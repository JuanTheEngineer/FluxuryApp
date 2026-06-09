import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'

const s3Client = new S3Client({ region: process.env.AWS_REGION })
const BUCKET_NAME = process.env.BUCKET_NAME!
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
}

function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  }
}

function getUserFromEvent(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext.authorizer?.claims
  return claims?.sub || claims?.['cognito:username'] || 'anonymous'
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2))

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {})
  }

  try {
    const { httpMethod, queryStringParameters } = event
    const userId = getUserFromEvent(event)

    switch (httpMethod) {
      case 'GET':
        // List available beats or get beat details
        return await listBeats(queryStringParameters)

      case 'POST':
        // Upload new beat (generate signed URL)
        return await createBeatUploadUrl(event.body, userId)

      default:
        return createResponse(405, { error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Error:', error)
    return createResponse(500, { error: 'Internal server error' })
  }
}

async function listBeats(queryParams: any): Promise<APIGatewayProxyResult> {
  try {
    // For beta, return a mix of public beats and user uploads
    const publicBeats = [
      {
        id: 'beat-1',
        name: 'Chill Lo-Fi Beat',
        artist: 'FluxuryBeats',
        duration: 180,
        bpm: 85,
        key: 'C minor',
        genre: 'Lo-Fi',
        url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Placeholder
        artworkUrl: 'https://picsum.photos/400/400?random=1',
        isPublic: true,
        tags: ['chill', 'lofi', 'study'],
      },
      {
        id: 'beat-2',
        name: 'Trap Banger',
        artist: 'FluxuryBeats',
        duration: 150,
        bpm: 140,
        key: 'G minor',
        genre: 'Trap',
        url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Placeholder
        artworkUrl: 'https://picsum.photos/400/400?random=2',
        isPublic: true,
        tags: ['trap', 'hard', 'energetic'],
      },
      {
        id: 'beat-3',
        name: 'Boom Bap Classic',
        artist: 'FluxuryBeats',
        duration: 200,
        bpm: 90,
        key: 'A minor',
        genre: 'Boom Bap',
        url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Placeholder
        artworkUrl: 'https://picsum.photos/400/400?random=3',
        isPublic: true,
        tags: ['boombap', 'classic', 'vinyl'],
      },
    ]

    // In production, you'd also fetch user-uploaded beats from S3
    // For now, just return the public beats
    return createResponse(200, {
      beats: publicBeats,
      total: publicBeats.length,
    })
  } catch (error) {
    console.error('Error listing beats:', error)
    return createResponse(500, { error: 'Failed to list beats' })
  }
}

async function createBeatUploadUrl(bodyString: string | null, userId: string): Promise<APIGatewayProxyResult> {
  try {
    const body = bodyString ? JSON.parse(bodyString) : {}
    const { fileName, fileType } = body

    if (!fileName || !fileType) {
      return createResponse(400, { error: 'fileName and fileType are required' })
    }

    // Generate unique file key
    const fileExtension = fileName.split('.').pop()
    const uniqueFileName = `${uuid()}.${fileExtension}`
    const fileKey = `beats/${userId}/${uniqueFileName}`

    // Generate signed URL for upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
      Metadata: {
        userId: userId,
        originalName: fileName,
        uploadedAt: new Date().toISOString(),
      },
    })

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }) // 5 minutes

    return createResponse(200, {
      uploadUrl: signedUrl,
      fileKey: fileKey,
      expiresIn: 300,
    })
  } catch (error) {
    console.error('Error creating upload URL:', error)
    return createResponse(500, { error: 'Failed to create upload URL' })
  }
}