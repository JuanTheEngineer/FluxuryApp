import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { v4 as uuid } from 'uuid'

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION })
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const s3 = new S3Client({ region: process.env.AWS_REGION })

const TABLE_NAME = process.env.TABLE_NAME!
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

function getUserFromEvent(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext.authorizer?.claims
  return claims?.sub || claims?.['cognito:username'] || 'anonymous'
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, origin)
  }

  try {
    const { httpMethod, pathParameters, body, resource } = event
    const userId = getUserFromEvent(event)

    // Public endpoints (no auth required)
    if (resource?.startsWith('/public/')) {
      if (httpMethod === 'GET') {
        if (pathParameters?.id) {
          return await getSession(pathParameters.id, origin)
        }
        return await listSessionsPublic(origin)
      }
      return createResponse(405, { error: 'Method not allowed' }, origin)
    }

    switch (httpMethod) {
      case 'GET':
        if (pathParameters?.id) {
          return await getSession(pathParameters.id, origin)
        }
        return await listSessions(userId, origin)

      case 'POST':
        return await createSession(body, userId, origin)

      case 'PUT':
        if (!pathParameters?.id) return createResponse(400, { error: 'Session ID required' }, origin)
        return await updateSession(pathParameters.id, body, userId, origin)

      case 'DELETE':
        if (!isValidSessionId(pathParameters?.id)) return createResponse(400, { error: 'Valid session ID required' }, origin)
        return await deleteSession(pathParameters!.id!, userId, origin)

      default:
        return createResponse(405, { error: 'Method not allowed' }, origin)
    }
  } catch (error) {
    console.error('Error:', error)
    return createResponse(500, { error: 'Internal server error' }, origin)
  }
}

// --- List sessions by owner (Query on OwnerIndex) ---
async function listSessions(userId: string, origin: string): Promise<APIGatewayProxyResult> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'OwnerIndex',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false, // Most recent first
  })
  const result = await docClient.send(command)
  return createResponse(200, { sessions: result.Items || [] }, origin)
}

// --- Public list (single-user: scan all sessions) ---
async function listSessionsPublic(origin: string): Promise<APIGatewayProxyResult> {
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    ProjectionExpression: 'id, userId, #n, author, beatId, artworkUrl, created, modified',
    ExpressionAttributeNames: { '#n': 'name' },
  })
  const result = await docClient.send(command)
  const sessions = (result.Items || []).sort((a: any, b: any) =>
    (b.modified || b.created || '').localeCompare(a.modified || a.created || '')
  )
  return createResponse(200, { sessions }, origin)
}

// --- Get single session by ID (simple GetItem, PK only) ---
async function getSession(sessionId: string, origin: string): Promise<APIGatewayProxyResult> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { id: sessionId },
  })
  const result = await docClient.send(command)
  if (!result.Item) return createResponse(404, { error: 'Session not found' }, origin)
  return createResponse(200, result.Item, origin)
}

// --- Create session ---
async function createSession(bodyString: string | null, userId: string, origin: string): Promise<APIGatewayProxyResult> {
  const body = bodyString ? JSON.parse(bodyString) : {}
  const now = new Date().toISOString()
  const sessionId = uuid()

  const session = {
    id: sessionId,
    userId,
    name: body.name || 'Untitled Session',
    author: body.author || 'Unknown Artist',
    beatId: body.beatId || '',
    artworkUrl: body.artworkUrl || '',
    script: body.script || '',
    created: now,
    modified: now,
  }

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: session }))
  return createResponse(201, session, origin)
}

// --- Update session ---
async function updateSession(sessionId: string, bodyString: string | null, userId: string, origin: string): Promise<APIGatewayProxyResult> {
  const body = bodyString ? JSON.parse(bodyString) : {}
  const now = new Date().toISOString()

  const updates: string[] = ['modified = :modified']
  const values: any = { ':modified': now }
  const names: any = {}

  if (body.name !== undefined) { updates.push('#n = :name'); names['#n'] = 'name'; values[':name'] = body.name }
  if (body.author !== undefined) { updates.push('author = :author'); values[':author'] = body.author }
  if (body.beatId !== undefined) { updates.push('beatId = :beatId'); values[':beatId'] = body.beatId }
  if (body.artworkUrl !== undefined) { updates.push('artworkUrl = :artworkUrl'); values[':artworkUrl'] = body.artworkUrl }
  if (body.script !== undefined) { updates.push('script = :script'); values[':script'] = body.script }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id: sessionId },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: { ...values, ':owner': userId },
    ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
    ConditionExpression: 'userId = :owner',
    ReturnValues: 'ALL_NEW',
  })

  try {
    const result = await docClient.send(command)
    return createResponse(200, result.Attributes, origin)
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse(403, { error: 'Not your session' }, origin)
    }
    throw err
  }
}

// --- Delete session ---

/**
 * Session ids are generated by uuid(); anything else (empty, slashes,
 * wildcards) is refused. The id becomes an S3 prefix below, and an empty or
 * crafted prefix like "sessions/" would match every session's files.
 */
function isValidSessionId(id: string | undefined): id is string {
  return !!id && /^[A-Za-z0-9-]{1,64}$/.test(id)
}

/**
 * Deletes the record first: DynamoDB's condition is the ownership check, so
 * S3 is only touched for a session this user owned. Then removes everything
 * under sessions/<id>/ (lyrics, artwork). The files bucket is versioned, so
 * deleted files stay recoverable for 30 days (lifecycle rule).
 */
async function deleteSession(sessionId: string, userId: string, origin: string): Promise<APIGatewayProxyResult> {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { id: sessionId },
    ConditionExpression: 'userId = :owner',
    ExpressionAttributeValues: { ':owner': userId },
    ReturnValues: 'ALL_OLD',
  })

  try {
    const result = await docClient.send(command)
    if (!result.Attributes) return createResponse(404, { error: 'Session not found' }, origin)
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse(403, { error: 'Not your session' }, origin)
    }
    throw err
  }

  // The record is gone, so the delete has succeeded from the user's point of
  // view. A failed cleanup only leaves orphaned files: log it, don't fail.
  try {
    await deleteSessionFiles(sessionId)
  } catch (err) {
    console.error(`Session ${sessionId} deleted but its S3 files were not:`, err)
  }
  return createResponse(200, { message: 'Session deleted' }, origin)
}

async function deleteSessionFiles(sessionId: string): Promise<void> {
  const Prefix = `sessions/${sessionId}/`
  let ContinuationToken: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix, ContinuationToken }))
    const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET_NAME, Delete: { Objects: objects, Quiet: true } }))
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (ContinuationToken)
}
