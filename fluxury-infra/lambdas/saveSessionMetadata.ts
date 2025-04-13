import { DynamoDB } from 'aws-sdk'

const db = new DynamoDB.DocumentClient()
const TABLE_NAME = process.env.TABLE_NAME!

export const handler = async (event: any) => {
    const data = JSON.parse(event.body)
    await db.put({ TableName: TABLE_NAME, Item: data }).promise()
    return { statusCode: 200, body: 'ok' }
}
