import { DynamoDB } from 'aws-sdk'
import { withAuth } from '../utils/authMiddleware'

const db = new DynamoDB.DocumentClient()
const TABLE_NAME = process.env.TABLE_NAME!

export const handler = withAuth(async (event: any) => {
  const id = event.pathParameters.id
  const result = await db.get({ TableName: TABLE_NAME, Key: { id } }).promise()
  return {
    statusCode: 200,
    body: JSON.stringify(result.Item),
  }
})
