import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import ytdl from '@distube/ytdl-core'

const s3 = new S3Client({ region: process.env.AWS_REGION })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }))
const BEATS_TABLE = process.env.BEATS_TABLE_NAME!
const BUCKET_NAME = process.env.BUCKET_NAME!
const COOKIES_KEY = 'config/youtube-cookies.txt'

async function updateBeatStatus(beatId: string, status: string, extra: Record<string, any> = {}) {
  const updates = ['#s = :status']
  const values: Record<string, any> = { ':status': status }
  const names: Record<string, string> = { '#s': 'status' }

  if (extra.duration) { updates.push('duration = :dur'); values[':dur'] = extra.duration }

  await ddb.send(new UpdateCommand({
    TableName: BEATS_TABLE,
    Key: { id: beatId },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: values,
    ExpressionAttributeNames: names,
  }))
}

async function getCookies(): Promise<ytdl.Cookie[]> {
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: COOKIES_KEY,
    }))
    const text = await response.Body!.transformToString()

    // Parse Netscape cookie format into ytdl-core cookie objects
    return text
      .split('\n')
      .filter(line => !line.startsWith('#') && line.trim().length > 0)
      .map(line => {
        const parts = line.split('\t')
        if (parts.length >= 7) {
          return {
            domain: parts[0],
            httpOnly: parts[1] === 'TRUE',
            path: parts[2],
            secure: parts[3] === 'TRUE',
            expires: parseInt(parts[4]) || undefined,
            name: parts[5],
            value: parts[6],
          } as ytdl.Cookie
        }
        return null
      })
      .filter(Boolean) as ytdl.Cookie[]
  } catch (err) {
    console.warn('Failed to load cookies:', err)
    return []
  }
}

export async function handler(event: any) {
  const { beatId, sourceUrl, s3Key } = event

  if (!beatId || !sourceUrl || !s3Key) {
    throw new Error('Missing required fields: beatId, sourceUrl, s3Key')
  }

  console.log(`Downloading audio for beat ${beatId} from ${sourceUrl}`)

  try {
    await updateBeatStatus(beatId, 'downloading')

    // Load cookies
    const cookies = await getCookies()
    console.log(`Cookies loaded: ${cookies.length} entries`)

    // Create agent with cookies
    const agent = ytdl.createAgent(cookies)

    // Get video info to find duration
    const info = await ytdl.getInfo(sourceUrl, { agent })
    const duration = parseInt(info.videoDetails.lengthSeconds) || 0
    console.log(`Video: "${info.videoDetails.title}" (${duration}s)`)

    // Download audio-only stream
    const audioStream = ytdl(sourceUrl, {
      agent,
      filter: 'audioonly',
      quality: 'highestaudio',
    })

    // Collect stream into buffer
    const chunks: Buffer[] = []
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk))
    }
    const audioBuffer = Buffer.concat(chunks)
    console.log(`Downloaded ${audioBuffer.length} bytes`)

    if (audioBuffer.length < 1000) {
      throw new Error('Downloaded file too small — likely not valid audio')
    }

    // Upload to S3 as webm (ytdl-core returns webm/opus for audio-only)
    const actualKey = s3Key.replace('.wav', '.webm')
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: actualKey,
      Body: audioBuffer,
      ContentType: 'audio/webm',
    }))

    // Update beat record with ready status, duration, and corrected s3Key
    await ddb.send(new UpdateCommand({
      TableName: BEATS_TABLE,
      Key: { id: beatId },
      UpdateExpression: 'SET #s = :status, duration = :dur, s3Key = :key',
      ExpressionAttributeValues: {
        ':status': 'ready',
        ':dur': duration,
        ':key': actualKey,
      },
      ExpressionAttributeNames: { '#s': 'status' },
    }))

    console.log(`✅ Beat ${beatId} uploaded to s3://${BUCKET_NAME}/${actualKey} (${duration}s)`)
    return { success: true, beatId, duration, size: audioBuffer.length }

  } catch (error: any) {
    console.error(`❌ Download failed for ${beatId}:`, error.message)
    await updateBeatStatus(beatId, 'failed')
    throw error
  }
}
