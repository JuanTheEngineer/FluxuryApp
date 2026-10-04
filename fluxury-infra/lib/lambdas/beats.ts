import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'

const s3Client = new S3Client({ region: process.env.AWS_REGION })
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }))
const TABLE_NAME = process.env.BEATS_TABLE_NAME!
const BUCKET_NAME = process.env.BUCKET_NAME!
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
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, origin)
  }

  try {
    switch (event.httpMethod) {
      case 'GET':
        return await listBeats(origin)
      case 'POST':
        return await createBeat(event.body, origin)
      case 'DELETE':
        if (!event.pathParameters?.id) return createResponse(400, { error: 'Beat ID required' }, origin)
        return await deleteBeat(event.pathParameters.id, origin)
      default:
        return createResponse(405, { error: 'Method not allowed' }, origin)
    }
  } catch (error) {
    console.error('Error:', error)
    return createResponse(500, { error: 'Internal server error' }, origin)
  }
}

// --- List all beats (small table, scan is fine) ---
async function listBeats(origin: string): Promise<APIGatewayProxyResult> {
  const result = await ddbClient.send(new ScanCommand({ TableName: TABLE_NAME }))
  const items = result.Items || []

  // Generate presigned URLs for each beat's audio
  const beats = await Promise.all(
    items.map(async (item) => {
      let audioUrl = ''
      if (item.s3Key) {
        audioUrl = await getSignedUrl(
          s3Client as any,
          new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.s3Key }),
          { expiresIn: 3600 }
        )
      }

      return {
        id: item.id,
        name: item.name,
        path: audioUrl,
        s3Key: item.s3Key,
        thumbnailUrl: item.thumbnailUrl || null,
        creator: item.creator || null,
        bpm: item.bpm || null,
        genre: item.genre || null,
        duration: item.duration || null,
        sourceUrl: item.sourceUrl || null,
        created: item.created,
      }
    })
  )

  return createResponse(200, { beats }, origin)
}

// --- Create beat ---
async function createBeat(bodyString: string | null, origin: string): Promise<APIGatewayProxyResult> {
  const body = bodyString ? JSON.parse(bodyString) : {}

  if (!body.name) {
    return createResponse(400, { error: 'name is required' }, origin)
  }

  const beatId = body.id || `beat-${uuid()}`
  const s3Key = body.s3Key || `beats/${beatId}/audio.wav`
  const now = new Date().toISOString()

  const beat = {
    id: beatId,
    name: body.name,
    fileName: body.fileName || `${body.name}.wav`,
    s3Key,
    thumbnailUrl: body.thumbnailUrl || null,
    creator: body.creator || null,
    bpm: body.bpm || null,
    genre: body.genre || null,
    duration: body.duration || null,
    sourceUrl: body.sourceUrl || null,
    created: now,
  }

  await ddbClient.send(new PutCommand({ TableName: TABLE_NAME, Item: beat }))

  // Generate presigned URL for the audio
  let audioUrl = ''
  try {
    audioUrl = await getSignedUrl(
      s3Client as any,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
      { expiresIn: 3600 }
    )
  } catch {}

  return createResponse(201, { ...beat, path: audioUrl }, origin)
}

// --- Delete beat ---
async function deleteBeat(beatId: string, origin: string): Promise<APIGatewayProxyResult> {
  await ddbClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id: beatId } }))
  return createResponse(200, { message: 'Beat deleted' }, origin)
}
