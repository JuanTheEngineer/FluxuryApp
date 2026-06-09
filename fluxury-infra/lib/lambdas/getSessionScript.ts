import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({ region: process.env.AWS_REGION })
const BUCKET_NAME = process.env.BUCKET_NAME!

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const id = event.pathParameters?.id

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Session ID required' }),
      }
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `sessions/${id}/script.json`,
    })

    const response = await s3Client.send(command)
    const body = await response.Body?.transformToString() || '{}'

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: body,
    }
  } catch (error) {
    console.error('Error getting session script:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to get session script' }),
    }
  }
}
