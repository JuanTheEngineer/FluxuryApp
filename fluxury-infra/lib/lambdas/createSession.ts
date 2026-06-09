import { v4 as uuid } from 'uuid'
import { DynamoDB } from 'aws-sdk'
import { withAuth } from '../utils/authMiddleware'
import { createSuccessResponse, createErrorResponse, createOptionsResponse } from '../utils/corsHeaders'
import { APIGatewayProxyEvent } from 'aws-lambda'

const db = new DynamoDB.DocumentClient()
const TABLE_NAME = process.env.TABLE_NAME!

export const handler = withAuth(async (event: APIGatewayProxyEvent, user: any) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse()
  }

  try {
    const id = uuid()
    const now = new Date().toISOString()

    // Parse request body if provided
    let requestData = {}
    if (event.body) {
      try {
        requestData = JSON.parse(event.body)
      } catch (e) {
        return createErrorResponse(400, 'Invalid JSON in request body')
      }
    }

    const session = {
      id,
      name: (requestData as any).name || 'Untitled Session',
      author: (requestData as any).author || user.email || user.username || '',
      beatUrl: (requestData as any).beatUrl || '',
      artworkUrl: (requestData as any).artworkUrl || '',
      script: `https://${process.env.BUCKET_NAME}.s3.us-east-1.amazonaws.com/sessions/${id}/script.json`,
      userId: user.sub, // Associate with authenticated user
      created: now,
      modified: now,
    }

    await db
      .put({
        TableName: TABLE_NAME,
        Item: session,
      })
      .promise()

    return createSuccessResponse(session, 201)
  } catch (error) {
    console.error('Error creating session:', error)
    return createErrorResponse(500, 'Failed to create session')
  }
})
