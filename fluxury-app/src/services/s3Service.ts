import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { fetchAuthSession } from 'aws-amplify/auth'
import { ScriptConflictError, type ExpectedVersion } from './scriptConflict'
import type { StoredScript } from './api/contracts'

function isConditionalWriteRefused(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  const status = e?.$metadata?.httpStatusCode
  return status === 412 || status === 409 ||
    e?.name === 'PreconditionFailed' || e?.name === 'ConditionalRequestConflict'
}

const REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1'
const BUCKET_NAME = import.meta.env.VITE_S3_BUCKET_NAME || ''

/**
 * Gets an S3 client with fresh Cognito Identity Pool credentials.
 * Credentials are obtained via Amplify's fetchAuthSession which exchanges
 * the Cognito JWT for temporary AWS IAM credentials.
 */
async function getS3Client(): Promise<S3Client> {
  const session = await fetchAuthSession()
  const credentials = session.credentials

  if (!credentials) {
    throw new Error('No AWS credentials available. Is the user authenticated?')
  }

  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  })
}

export const S3Service = {
  /**
   * Conditional write (S3 conditional writes): `expectedVersion` string sends
   * If-Match, null sends If-None-Match: *. A refused write (412, or 409 when
   * two conditional writes race) becomes ScriptConflictError.
   */
  async uploadSessionScript(
    sessionId: string,
    scriptData: unknown,
    expectedVersion?: ExpectedVersion,
  ): Promise<{ url: string; version: string | null }> {
    const client = await getS3Client()
    const key = `sessions/${sessionId}/script.json`

    try {
      const res = await client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(scriptData),
        ContentType: 'application/json',
        ...(typeof expectedVersion === 'string' ? { IfMatch: expectedVersion } : {}),
        ...(expectedVersion === null ? { IfNoneMatch: '*' } : {}),
      }))
      return { url: `s3://${BUCKET_NAME}/${key}`, version: res.ETag ?? null }
    } catch (err) {
      if (isConditionalWriteRefused(err)) throw new ScriptConflictError(sessionId)
      throw err
    }
  },

  async downloadSessionScript(sessionId: string): Promise<StoredScript> {
    const client = await getS3Client()
    const key = `sessions/${sessionId}/script.json`

    const response = await client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }))

    const body = await response.Body?.transformToString()
    if (!body) throw new Error('Empty script response from S3')

    return { content: JSON.parse(body), version: response.ETag ?? null }
  },

  async uploadArtwork(sessionId: string, file: File): Promise<string> {
    const client = await getS3Client()
    const key = `sessions/${sessionId}/artwork.${file.name.split('.').pop()}`
    const buffer = await file.arrayBuffer()

    await client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
    }))

    return `s3://${BUCKET_NAME}/${key}`
  },

  async uploadBeat(beatId: string, file: File): Promise<string> {
    const client = await getS3Client()
    const key = `beats/${beatId}/audio.wav`
    const buffer = await file.arrayBuffer()

    await client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: file.type || 'audio/wav',
    }))

    return `s3://${BUCKET_NAME}/${key}`
  },
}
