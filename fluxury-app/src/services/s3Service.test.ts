import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: any[] = []
let nextResult: () => any = () => ({ ETag: '"v2"' })

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand { constructor(public input: any) {} }
  class GetObjectCommand { constructor(public input: any) {} }
  class S3Client { async send(cmd: any) { sent.push(cmd.input); return nextResult() } }
  return { S3Client, PutObjectCommand, GetObjectCommand }
})
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({ credentials: { accessKeyId: 'a', secretAccessKey: 'b', sessionToken: 'c' } }),
}))

// tests/setup.ts already imported the API layer (and this module) with the
// real AWS SDK, so load fresh copies that see the mocks above.
let S3Service: typeof import('./s3Service').S3Service
let ScriptConflictError: typeof import('./scriptConflict').ScriptConflictError

const s3Error = (name: string, httpStatusCode: number) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode } })

describe('S3Service script versioning', () => {
  beforeEach(async () => {
    sent.length = 0
    nextResult = () => ({ ETag: '"v2"' })
    vi.resetModules()
    ;({ S3Service } = await import('./s3Service'))
    ;({ ScriptConflictError } = await import('./scriptConflict'))
  })

  it('sends If-Match when the expected version is known, and returns the new version', async () => {
    const res = await S3Service.uploadSessionScript('s1', { a: 1 }, '"v1"')
    expect(sent[0].IfMatch).toBe('"v1"')
    expect(sent[0].IfNoneMatch).toBeUndefined()
    expect(res.version).toBe('"v2"')
  })

  it('sends If-None-Match: * for the first save of a new session', async () => {
    await S3Service.uploadSessionScript('s1', { a: 1 }, null)
    expect(sent[0].IfNoneMatch).toBe('*')
    expect(sent[0].IfMatch).toBeUndefined()
  })

  it('writes unconditionally when the expected version is unknown', async () => {
    await S3Service.uploadSessionScript('s1', { a: 1 })
    expect(sent[0].IfMatch).toBeUndefined()
    expect(sent[0].IfNoneMatch).toBeUndefined()
  })

  it.each([
    ['PreconditionFailed', 412],
    ['ConditionalRequestConflict', 409],
  ])('turns %s (%i) into ScriptConflictError', async (name, status) => {
    nextResult = () => { throw s3Error(name, status) }
    await expect(S3Service.uploadSessionScript('s1', {}, '"v1"')).rejects.toBeInstanceOf(ScriptConflictError)
  })

  it('passes other errors through unchanged', async () => {
    nextResult = () => { throw s3Error('AccessDenied', 403) }
    await expect(S3Service.uploadSessionScript('s1', {}, '"v1"')).rejects.toMatchObject({ name: 'AccessDenied' })
  })

  it('download returns the content and the version it was read at', async () => {
    nextResult = () => ({ ETag: '"v7"', Body: { transformToString: async () => '{"x":1}' } })
    expect(await S3Service.downloadSessionScript('s1')).toEqual({ content: { x: 1 }, version: '"v7"' })
  })
})
