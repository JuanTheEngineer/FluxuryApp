import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import https from 'https'
import { v4 as uuid } from 'uuid'

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }))
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION })
const BEATS_TABLE = process.env.BEATS_TABLE_NAME!
const BUCKET_NAME = process.env.BUCKET_NAME!
const DOWNLOAD_FUNCTION_NAME = process.env.DOWNLOAD_FUNCTION_NAME || ''

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').concat([
  'https://www.fluxury.app',
  'https://fluxury.app',
  'http://localhost:5173',
])

function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || ''
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin
  return ALLOWED_ORIGINS[0]
}

function createResponse(statusCode: number, body: any, origin: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  }
}

// Extract YouTube video ID from various URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Fetch JSON from URL
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('Invalid JSON response')) }
      })
    }).on('error', reject)
  })
}

// Fetch YouTube metadata using oEmbed (no API key needed)
async function fetchYouTubeMetadata(videoId: string) {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  
  try {
    const oembed = await fetchJson(oembedUrl)
    
    // oEmbed gives us: title, author_name, author_url, thumbnail_url, etc.
    // Thumbnail: use maxresdefault (highest quality), fallback to hqdefault
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    const fallbackThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    
    return {
      title: oembed.title || 'Unknown Beat',
      creator: oembed.author_name || 'Unknown',
      creatorUrl: oembed.author_url || '',
      thumbnailUrl: thumbnailUrl,
      fallbackThumbnailUrl: fallbackThumbnail,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
    }
  } catch (error) {
    console.error('oEmbed fetch failed:', error)
    return null
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, origin)
  }

  if (event.httpMethod !== 'POST') {
    return createResponse(405, { error: 'Method not allowed' }, origin)
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {}
    const { url } = body

    if (!url) {
      return createResponse(400, { error: 'url is required' }, origin)
    }

    // Extract video ID
    const videoId = extractVideoId(url)
    if (!videoId) {
      return createResponse(400, { error: 'Invalid YouTube URL' }, origin)
    }

    // Fetch metadata
    const metadata = await fetchYouTubeMetadata(videoId)
    if (!metadata) {
      return createResponse(502, { error: 'Failed to fetch YouTube metadata' }, origin)
    }

    // Create beat record
    const beatId = `beat-${videoId}`
    const s3Key = `beats/${beatId}/audio.wav`
    const now = new Date().toISOString()

    const beat = {
      id: beatId,
      name: metadata.title,
      creator: metadata.creator,
      creatorUrl: metadata.creatorUrl,
      thumbnailUrl: metadata.thumbnailUrl,
      fallbackThumbnailUrl: metadata.fallbackThumbnailUrl,
      sourceUrl: metadata.sourceUrl,
      videoId: metadata.videoId,
      s3Key,
      fileName: `${metadata.title}.wav`,
      status: 'pending_download', // Will be 'ready' once audio is downloaded
      created: now,
    }

    await ddbClient.send(new PutCommand({ TableName: BEATS_TABLE, Item: beat }))

    // Trigger async download if download Lambda is configured
    if (DOWNLOAD_FUNCTION_NAME) {
      try {
        await lambdaClient.send(new InvokeCommand({
          FunctionName: DOWNLOAD_FUNCTION_NAME,
          InvocationType: 'Event', // Async — don't wait for it
          Payload: Buffer.from(JSON.stringify({
            beatId: beat.id,
            sourceUrl: beat.sourceUrl,
            s3Key: beat.s3Key,
          })),
        }))
        console.log(`Triggered async download for ${beat.id}`)
      } catch (invokeErr) {
        console.error('Failed to trigger download Lambda:', invokeErr)
        // Non-fatal — beat is saved, download can be retried manually
      }
    }

    return createResponse(201, {
      ...beat,
      message: 'Beat metadata saved. Audio download started.',
    }, origin)

  } catch (error) {
    console.error('Error:', error)
    return createResponse(500, { error: 'Internal server error' }, origin)
  }
}
