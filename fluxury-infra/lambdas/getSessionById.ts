import { DynamoDB } from 'aws-sdk'

const db = new DynamoDB.DocumentClient()
const TABLE_NAME = process.env.TABLE_NAME!

export const handler = async (event: any) => {
    const id = event.pathParameters.id
    const result = await db.get({ TableName: TABLE_NAME, Key: { id } }).promise()
    return {
        statusCode: 200,
        body: JSON.stringify(result.Item)
    }
}
