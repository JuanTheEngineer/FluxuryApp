import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A session deleted in another tab/device while open here. S3 answers a
 * conditional save with 404 (If-Match on a deleted file), or accepts it and the
 * API then answers 403 (the record is gone). Neither says "deleted", so the
 * store asks the API whether the session still exists.
 */
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })
const s3Error = (status: number) => Object.assign(new Error(`S3 ${status}`), { $metadata: { httpStatusCode: status } })

const api = {
  getSession: vi.fn<(id: string) => Promise<any>>(),
  updateSession: vi.fn<(id: string, p: any) => Promise<any>>(),
  createSession: vi.fn<(p: any) => Promise<any>>(),
  uploadSessionScript: vi.fn<(id: string, body: any, expected?: any) => Promise<any>>(),
}
const drafts = { delete: vi.fn<(id: string) => Promise<void>>() }

vi.mock('@/services/api', () => ({
  sessionsApi: {
    getSession: (id: string) => api.getSession(id),
    updateSession: (id: string, p: any) => api.updateSession(id, p),
    createSession: (p: any) => api.createSession(p),
  },
  storageApi: {
    uploadSessionScript: (id: string, body: any, expected?: any) => api.uploadSessionScript(id, body, expected),
  },
}))
vi.mock('@/services/localDraft', () => ({ localDraftService: { delete: (id: string) => drafts.delete(id) } }))

async function freshStore() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSessionStore } = await import('./sessionStore')
  const store = useSessionStore()
  store.activeSession = { id: 's1', name: 'Verse one', beatId: 'beat-1' } as any
  store.scriptVersions = { s1: '"e1"' }
  return store
}

const lyrics = { ops: [{ insert: 'bars written after the delete\n' }] }

describe('saving a session that was deleted somewhere else', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset()
    drafts.delete.mockReset().mockResolvedValue(undefined)
    api.uploadSessionScript.mockResolvedValue({ url: 's3://b/sessions/s1/script.json', version: '"e2"' })
    api.updateSession.mockResolvedValue({ data: {} })
  })

  it('S3 404 + session gone: throws SessionDeletedError and pauses saving', async () => {
    const store = await freshStore()
    api.uploadSessionScript.mockRejectedValue(s3Error(404))
    api.getSession.mockRejectedValue(httpError(404))

    await expect(store.saveScript('s1', lyrics)).rejects.toMatchObject({ name: 'SessionDeletedError' })
    expect(store.deletedSessionId).toBe('s1')

    api.uploadSessionScript.mockClear()
    await expect(store.saveScript('s1', lyrics)).rejects.toMatchObject({ name: 'SessionDeletedError' })
    expect(api.uploadSessionScript).not.toHaveBeenCalled() // no more writes for a deleted session
  })

  it('API 403 after a successful upload + session gone: also SessionDeletedError', async () => {
    const store = await freshStore()
    api.updateSession.mockRejectedValue(httpError(403))
    api.getSession.mockRejectedValue(httpError(404))

    await expect(store.saveScript('s1', lyrics)).rejects.toMatchObject({ name: 'SessionDeletedError' })
    expect(store.deletedSessionId).toBe('s1')
  })

  it('a 403 for a session that still exists is an ordinary save error', async () => {
    const store = await freshStore()
    api.updateSession.mockRejectedValue(httpError(403))
    api.getSession.mockResolvedValue({ data: { id: 's1' } })

    await expect(store.saveScript('s1', lyrics)).rejects.toMatchObject({ message: 'HTTP 403' })
    expect(store.deletedSessionId).toBeNull()
  })

  it('a network failure never triggers the existence check', async () => {
    const store = await freshStore()
    api.uploadSessionScript.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(store.saveScript('s1', lyrics)).rejects.toBeInstanceOf(TypeError)
    expect(api.getSession).not.toHaveBeenCalled()
    expect(store.deletedSessionId).toBeNull()
  })

  it('if the existence check itself fails, keeps the original error', async () => {
    const store = await freshStore()
    api.uploadSessionScript.mockRejectedValue(s3Error(404))
    api.getSession.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(store.saveScript('s1', lyrics)).rejects.toMatchObject({ message: 'S3 404' })
    expect(store.deletedSessionId).toBeNull()
  })
})

describe('saveDeletedAsNewSession', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset()
    drafts.delete.mockReset().mockResolvedValue(undefined)
    api.createSession.mockResolvedValue({ data: { id: 's2' } })
    api.uploadSessionScript.mockResolvedValue({ url: 's3://b/sessions/s2/script.json', version: '"n1"' })
    api.updateSession.mockResolvedValue({ data: {} })
  })

  it('creates a "(restored)" session with the same beat and these lyrics, and resumes', async () => {
    const store = await freshStore()
    store.deletedSessionId = 's1'

    const result = await store.saveDeletedAsNewSession('s1', lyrics)

    expect(result).toEqual({ id: 's2', name: 'Verse one (restored)' })
    expect(api.createSession).toHaveBeenCalledWith({ name: 'Verse one (restored)', beatId: 'beat-1' })
    const [id, body, expected] = api.uploadSessionScript.mock.calls[0]
    expect([id, body.delta, expected]).toEqual(['s2', lyrics, null])
    expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ script: 's3://b/sessions/s2/script.json' }))
    expect(store.scriptVersions.s2).toBe('"n1"')
    expect(store.deletedSessionId).toBeNull()
    expect(drafts.delete).toHaveBeenCalledWith('s1')
  })

  it('stays paused (and keeps the old draft) if creating the copy fails', async () => {
    const store = await freshStore()
    store.deletedSessionId = 's1'
    api.createSession.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(store.saveDeletedAsNewSession('s1', lyrics)).rejects.toBeInstanceOf(TypeError)
    expect(store.deletedSessionId).toBe('s1')
    expect(drafts.delete).not.toHaveBeenCalled()
  })
})
