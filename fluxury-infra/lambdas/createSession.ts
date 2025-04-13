import { v4 as uuid } from 'uuid'
import { DynamoDB } from 'aws-sdk'

const db = new DynamoDB.DocumentClient()
const TABLE_NAME = process.env.TABLE_NAME!

export const handler = async () => {
    const id = uuid()
    const now = new Date().toISOString()

    const session = {
        id,
        name: 'Untitled Session',
        author: '',
        beat: '',
        image: '',
        script: `sessions/${id}/script.json`,
        created: now,
        modified: now
    }

    await db.put({
        TableName: TABLE_NAME,
        Item: session
    }).promise()

    return {
        statusCode: 200,
        body: JSON.stringify(session)
    }
}