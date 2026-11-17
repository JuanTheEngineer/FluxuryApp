import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * DELETE /sessions/{id}: removes the DynamoDB record AND the session's files
 * in S3 (lyrics script.json, artwork). Ownership is checked by DynamoDB first,
 * so a request for someone else's session never touches S3.
 */

const ddbSend = jest.fn<(cmd: any) => Promise<any>>()
const s3Send = jest.fn<(cmd: any) => Promise<any>>()

jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: class {} }))
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const cmd = (type: string) => class { type = type; constructor(public input: any) {} }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: (c: any) => ddbSend(c) }) },
    GetCommand: cmd('Get'), PutCommand: cmd('Put'), QueryCommand: cmd('Query'),
    UpdateCommand: cmd('Update'), DeleteCommand: cmd('Delete'), ScanCommand: cmd('Scan'),
  }
})
jest.mock('@aws-sdk/client-s3', () => {
  const cmd = (type: string) => class { type = type; constructor(public input: any) {} }
  return {
    S3Client: class { send(c: any) { return s3Send(c) } },
    ListObjectsV2Command: cmd('ListObjectsV2'),
    DeleteObjectsCommand: cmd('DeleteObjects'),
  }
})

process.env.TABLE_NAME = 'sessions-table'
process.env.BUCKET_NAME = 'files-bucket'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require('../lib/lambdas/sessions')

function deleteEvent(id: string, sub = 'user-1'): any {
  return {
    httpMethod: 'DELETE',
    resource: '/sessions/{id}',
    pathParameters: { id },
    headers: {},
    requestContext: { authorizer: { claims: { sub } } },
  }
}

const SESSION_ID = '3f1c2a9e-1b2c-4d5e-8f90-123456789abc'

describe('sessions Lambda: DELETE /sessions/{id}', () => {
  beforeEach(() => {
    ddbSend.mockReset()
    s3Send.mockReset()
    s3Send.mockImplementation(async (c: any) =>
      c.type === 'ListObjectsV2'
        ? { Contents: [{ Key: `sessions/${SESSION_ID}/script.json` }, { Key: `sessions/${SESSION_ID}/artwork.png` }] }
        : {},
    )
  })

  it('deletes the record, then every S3 object under the session prefix', async () => {
    ddbSend.mockResolvedValue({ Attributes: { id: SESSION_ID, userId: 'user-1' } })

    const res = await handler(deleteEvent(SESSION_ID))

    expect(res.statusCode).toBe(200)
    const del = ddbSend.mock.calls[0][0]
    expect(del.type).toBe('Delete')
    expect(del.input.ConditionExpression).toBe('userId = :owner')

    const list = s3Send.mock.calls.find(([c]) => c.type === 'ListObjectsV2')![0]
    expect(list.input).toMatchObject({ Bucket: 'files-bucket', Prefix: `sessions/${SESSION_ID}/` })
    const bulk = s3Send.mock.calls.find(([c]) => c.type === 'DeleteObjects')![0]
    expect(bulk.input.Bucket).toBe('files-bucket')
    expect(bulk.input.Delete.Objects).toEqual([
      { Key: `sessions/${SESSION_ID}/script.json` },
      { Key: `sessions/${SESSION_ID}/artwork.png` },
    ])
  })

  it('never touches S3 when the session belongs to someone else', async () => {
    ddbSend.mockRejectedValue(Object.assign(new Error('nope'), { name: 'ConditionalCheckFailedException' }))

    const res = await handler(deleteEvent(SESSION_ID, 'someone-else'))

    expect(res.statusCode).toBe(403)
    expect(s3Send).not.toHaveBeenCalled()
  })

  it('never touches S3 when the session does not exist', async () => {
    ddbSend.mockResolvedValue({})

    const res = await handler(deleteEvent(SESSION_ID))

    expect(res.statusCode).toBe(404)
    expect(s3Send).not.toHaveBeenCalled()
  })

  it.each(['', '../beats', 'a/b', '*'])('refuses a malformed id (%j) before any data call', async (badId) => {
    const res = await handler(deleteEvent(badId))

    expect(res.statusCode).toBe(400)
    expect(ddbSend).not.toHaveBeenCalled()
    expect(s3Send).not.toHaveBeenCalled()
  })

  it('still reports success if S3 cleanup fails (the record is already gone)', async () => {
    ddbSend.mockResolvedValue({ Attributes: { id: SESSION_ID, userId: 'user-1' } })
    s3Send.mockRejectedValue(new Error('S3 down'))
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await handler(deleteEvent(SESSION_ID))

    expect(res.statusCode).toBe(200)
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(SESSION_ID), expect.anything())
    errorLog.mockRestore()
  })
})
