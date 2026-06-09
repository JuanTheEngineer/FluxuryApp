import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuid } from 'uuid'

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION })
const docClient = DynamoDBDocumentClient.from(dynamoClient)

const TABLE_NAME = process.env.TABLE_NAME!
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
    const { httpMethod, pathParameters, body } = event
    const userId = getUserFromEvent(event)

    switch (httpMethod) {
      case 'GET':
        if (pathParameters?.id) {
          // Get specific session
          return await getSession(pathParameters.id, userId)
        } else {
          // List user sessions
          return await listSessions(userId)
        }

      case 'POST':
        // Create new session
        return await createSession(body, userId)

      case 'PUT':
        // Update session
        if (!pathParameters?.id) {
          return createResponse(400, { error: 'Session ID required' })
        }
        return await updateSession(pathParameters.id, body, userId)

      case 'DELETE':
        // Delete session
        if (!pathParameters?.id) {
          return createResponse(400, { error: 'Session ID required' })
        }
        return await deleteSession(pathParameters.id, userId)

      default:
        return createResponse(405, { error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Error:', error)
    return createResponse(500, { error: 'Internal server error' })
  }
}

async function listSessions(userId: string): Promise<APIGatewayProxyResult> {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'UserIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // Most recent first
    })

    const result = await docClient.send(command)

    return createResponse(200, {
      sessions: result.Items || [],
    })
  } catch (error) {
    console.error('Error listing sessions:', error)
    return createResponse(500, { error: 'Failed to list sessions' })
  }
}

async function getSession(sessionId: string, userId: string): Promise<APIGatewayProxyResult> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        id: sessionId,
        userId: userId,
      },
    })

    const result = await docClient.send(command)

    if (!result.Item) {
      return createResponse(404, { error: 'Session not found' })
    }

    return createResponse(200, result.Item)
  } catch (error) {
    console.error('Error getting session:', error)
    return createResponse(500, { error: 'Failed to get session' })
  }
}

async function createSession(bodyString: string | null, userId: string): Promise<APIGatewayProxyResult> {
  try {
    const body = bodyString ? JSON.parse(bodyString) : {}
    const now = new Date().toISOString()
    const sessionId = uuid()

    const session = {
      id: sessionId,
      userId: userId,
      name: body.name || 'Untitled Session',
      author: body.author || 'Unknown Artist',
      beatUrl: body.beatUrl || '',
      artworkUrl: body.artworkUrl || '',
      script: body.script || JSON.stringify({ ops: [{ insert: 'Start writing your lyrics here...\n' }] }),
      created: now,
      modified: now,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days TTL
    }

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: session,
    })

    await docClient.send(command)

    return createResponse(201, session)
  } catch (error) {
    console.error('Error creating session:', error)
    return createResponse(500, { error: 'Failed to create session' })
  }
}

async function updateSession(sessionId: string, bodyString: string | null, userId: string): Promise<APIGatewayProxyResult> {
  try {
    const body = bodyString ? JSON.parse(bodyString) : {}
    const now = new Date().toISOString()

    const updateExpression = []
    const expressionAttributeValues: any = {
      ':modified': now,
    }
    const expressionAttributeNames: any = {}

    // Build dynamic update expression
    if (body.name !== undefined) {
      updateExpression.push('#name = :name')
      expressionAttributeNames['#name'] = 'name'
      expressionAttributeValues[':name'] = body.name
    }

    if (body.author !== undefined) {
      updateExpression.push('author = :author')
      expressionAttributeValues[':author'] = body.author
    }

    if (body.beatUrl !== undefined) {
      updateExpression.push('beatUrl = :beatUrl')
      expressionAttributeValues[':beatUrl'] = body.beatUrl
    }

    if (body.artworkUrl !== undefined) {
      updateExpression.push('artworkUrl = :artworkUrl')
      expressionAttributeValues[':artworkUrl'] = body.artworkUrl
    }

    if (body.script !== undefined) {
      updateExpression.push('script = :script')
      expressionAttributeValues[':script'] = body.script
    }

    updateExpression.push('modified = :modified')

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        id: sessionId,
        userId: userId,
      },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW',
    })

    const result = await docClient.send(command)

    if (!result.Attributes) {
      return createResponse(404, { error: 'Session not found' })
    }

    return createResponse(200, result.Attributes)
  } catch (error) {
    console.error('Error updating session:', error)
    return createResponse(500, { error: 'Failed to update session' })
  }
}

async function deleteSession(sessionId: string, userId: string): Promise<APIGatewayProxyResult> {
  try {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        id: sessionId,
        userId: userId,
      },
      ReturnValues: 'ALL_OLD',
    })

    const result = await docClient.send(command)

    if (!result.Attributes) {
      return createResponse(404, { error: 'Session not found' })
    }

    return createResponse(200, { message: 'Session deleted successfully' })
  } catch (error) {
    console.error('Error deleting session:', error)
    return createResponse(500, { error: 'Failed to delete session' })
  }
}