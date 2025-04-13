import { S3 } from 'aws-sdk'

const s3 = new S3()
const BUCKET_NAME = process.env.BUCKET_NAME!

export const handler = async (event: any) => {
    const id = event.pathParameters.id

    const obj = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: `sessions/${id}/script.json`
    }).promise()

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: obj.Body?.toString('utf-8')
    }
}
