import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'

const s3Client = new S3Client({ region: process.env.AWS_REGION })
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }))
const TABLE_NAME = process.env.TABLE_NAME!
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
    const { httpMethod } = event
    const userId = getUserFromEvent(event)

    switch (httpMethod) {
      case 'GET':
        return await listBeats()

      case 'POST':
        return await createBeat(event.body, userId)

      default:
        return createResponse(405, { error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Error:', error)
    return createResponse(500, { error: 'Internal server error' })
  }
}

async function listBeats(): Promise<APIGatewayProxyResult> {
  try {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#type = :beatType',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':beatType': 'beat',
      },
    })

    const result = await ddbClient.send(command)
    const items = result.Items || []

    // Generate presigned URLs for each beat's audio file
    const beats = await Promise.all(
      items.map(async (item) => {
        const presignedUrl = await getSignedUrl(
          s3Client as any,
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: item.s3Key,
          }),
          { expiresIn: 3600 } // 1 hour
        )

        return {
          id: item.id,
          name: item.name,
          path: presignedUrl,
          s3Key: item.s3Key,
          bpm: item.bpm || null,
          genre: item.genre || null,
          created: item.created,
        }
      })
    )

    return createResponse(200, { beats })
  } catch (error) {
    console.error('Error listing beats:', error)
    return createResponse(500, { error: 'Failed to list beats' })
  }
}

async function createBeat(bodyString: string | null, userId: string): Promise<APIGatewayProxyResult> {
  try {
    const body = bodyString ? JSON.parse(bodyString) : {}

    if (!body.name || !body.fileName) {
      return createResponse(400, { error: 'name and fileName are required' })
    }

    const beatId = body.id || `beat-${uuid()}`
    const s3Key = `beats/${beatId}/audio.wav`
    const now = new Date().toISOString()

    const beat = {
      id: beatId,
      userId: userId,
      type: 'beat',
      name: body.name,
      fileName: body.fileName,
      s3Key,
      bpm: body.bpm || null,
      genre: body.genre || null,
      created: now,
    }

    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: beat,
    })

    await ddbClient.send(putCommand)

    // Generate presigned URL for the audio file
    const presignedUrl = await getSignedUrl(
      s3Client as any,
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      }),
      { expiresIn: 3600 }
    )

    return createResponse(201, {
      ...beat,
      path: presignedUrl,
    })
  } catch (error) {
    console.error('Error creating beat:', error)
    return createResponse(500, { error: 'Failed to create beat' })
  }
}
