import { DynamoDB } from 'aws-sdk'
import { withAuth } from '../utils/authMiddleware'

const db = new DynamoDB.DocumentClient()
const TABLE_NAME = process.env.TABLE_NAME!

export const handler = withAuth(async (event, user) => {
  console.log('✅ Authenticated user:', user)

  const result = await db.scan({ TableName: TABLE_NAME }).promise()
  return {
    statusCode: 200,
    body: JSON.stringify(result.Items || []),
  }
})
