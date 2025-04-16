import { S3 } from 'aws-sdk'
import { withAuth } from '../utils/authMiddleware'

const s3 = new S3()
const BUCKET_NAME = process.env.BUCKET_NAME!

export const handler = withAuth(async (event: any) => {
  const id = event.pathParameters.id
  const body = JSON.parse(event.body)

  await s3
    .putObject({
      Bucket: BUCKET_NAME,
      Key: `sessions/${id}/script.json`,
      Body: JSON.stringify(body),
      ContentType: 'application/json',
    })
    .promise()

  return { statusCode: 200, body: 'ok' }
})
