import express from 'express'
import cors from 'cors'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const port = 3001

app.use(cors())
app.use(express.json())

// AWS clients (uses your local AWS credentials)
const s3 = new S3Client({ region: 'us-east-1' })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }))
const BEATS_TABLE = 'fluxury-beta-beats-beta'
const BUCKET = 'fluxury-beta-files-728861022483-us-east-1'

// Fetch YouTube metadata via oEmbed
async function fetchMetadata(videoId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('Invalid oEmbed response')) }
      })
    }).on('error', reject)
  })
}

// Extract video ID from URL
function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

// POST /api/download — downloads YouTube audio, uploads to S3, registers in DynamoDB
app.post('/api/download', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing YouTube URL' })

  const videoId = getVideoId(url)
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' })

  const beatId = `beat-${videoId}`
  console.log(`\n🎵 Downloading beat: ${url}`)

  try {
    // 1. Get metadata
    const metadata = await fetchMetadata(videoId)
    console.log(`   Title: ${metadata.title}`)
    console.log(`   Creator: ${metadata.author_name}`)

    // 2. Download audio using yt-dlp CLI (works locally with residential IP)
    console.log('   ⬇️  Downloading audio via yt-dlp...')
    const cookiesPath = path.join(__dirname, '..', 'fluxury-infra', 'cookies.txt')
    const outputPath = path.join('/tmp', `${beatId}.wav`)
    const cookiesFlag = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : ''

    const { execSync } = await import('child_process')
    const cmd = `yt-dlp --extract-audio --audio-format wav --audio-quality 0 --no-playlist ${cookiesFlag} -o "/tmp/${beatId}.%(ext)s" "${url}" 2>&1`
    const output = execSync(cmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }).toString()
    console.log('   yt-dlp:', output.split('\n').slice(-3).join(' | '))

    // Read the downloaded file
    if (!fs.existsSync(outputPath)) {
      throw new Error('Download completed but output file not found')
    }
    const audioBuffer = fs.readFileSync(outputPath)
    console.log(`   📦 Downloaded ${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB`)

    // Get duration from yt-dlp output
    let duration = 0
    try {
      const durationCmd = `yt-dlp --print duration "${url}" 2>/dev/null`
      duration = parseInt(execSync(durationCmd, { timeout: 10000 }).toString().trim()) || 0
    } catch {}

    // 3. Upload to S3
    const s3Key = `beats/${beatId}/audio.wav`
    console.log(`   ☁️  Uploading to S3...`)
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: 'audio/wav',
    }))

    // 4. Register in DynamoDB
    const beat = {
      id: beatId,
      name: metadata.title,
      creator: metadata.author_name,
      creatorUrl: metadata.author_url || '',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      s3Key,
      fileName: `${metadata.title}.wav`,
      duration,
      status: 'ready',
      created: new Date().toISOString(),
    }

    await ddb.send(new PutCommand({ TableName: BEATS_TABLE, Item: beat }))

    // Cleanup tmp file
    fs.unlinkSync(outputPath)

    console.log(`   ✅ Beat registered: ${beatId}`)
    res.json(beat)

  } catch (err) {
    console.error(`   ❌ Failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/beats — list all beats from DynamoDB
app.get('/api/beats', async (req, res) => {
  try {
    const result = await ddb.send(new ScanCommand({ TableName: BEATS_TABLE }))
    res.json({ beats: result.Items || [] })
  } catch (err) {
    console.error('Error listing beats:', err.message)
    res.status(500).json({ error: 'Failed to list beats' })
  }
})

// DELETE /api/beats/:id — delete a beat
app.delete('/api/beats/:id', async (req, res) => {
  try {
    await ddb.send(new DeleteCommand({ TableName: BEATS_TABLE, Key: { id: req.params.id } }))
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(port, () => {
  console.log(`\n🎧 Fluxury Beat Server running at http://localhost:${port}`)
  console.log(`   POST /api/download — Download a YouTube beat to production`)
  console.log(`   GET  /api/beats    — List all beats`)
  console.log(`   DELETE /api/beats/:id — Delete a beat\n`)
})
