import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = {
  deleteSession: vi.fn<(id: string) => Promise<any>>(),
}
const drafts = { delete: vi.fn<(id: string) => Promise<void>>() }

vi.mock('@/services/api', () => ({
  sessionsApi: { deleteSession: (id: string) => api.deleteSession(id) },
  storageApi: {},
}))
vi.mock('@/services/localDraft', () => ({
  localDraftService: { delete: (id: string) => drafts.delete(id) },
}))

// tests/setup.ts already loaded the real API layer; load a fresh store that
// sees the mocks above.
async function freshStore() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSessionStore } = await import('./sessionStore')
  const store = useSessionStore()
  store.sessions = [
    { id: 's1', name: 'One', author: '', created: '', modified: '' },
    { id: 's2', name: 'Two', author: '', created: '', modified: '' },
  ]
  store.scriptVersions = { s1: '"e1"', s2: '"e2"' }
  store.conflictSessionId = 's1'
  return store
}

describe('sessionStore.deleteSession', () => {
  beforeEach(() => {
    api.deleteSession.mockReset().mockResolvedValue({ data: { success: true } })
    drafts.delete.mockReset().mockResolvedValue(undefined)
  })

  it('removes the session and everything this browser kept for it', async () => {
    const store = await freshStore()

    expect(await store.deleteSession('s1')).toBe(true)

    expect(store.sessions.map((s) => s.id)).toEqual(['s2'])
    expect(drafts.delete).toHaveBeenCalledWith('s1')
    expect(store.scriptVersions).toEqual({ s2: '"e2"' })
    expect(store.conflictSessionId).toBeNull()
  })

  it('keeps everything when the server delete fails', async () => {
    const store = await freshStore()
    api.deleteSession.mockRejectedValue(new Error('500'))

    expect(await store.deleteSession('s1')).toBe(false)

    expect(store.sessions.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(drafts.delete).not.toHaveBeenCalled()
    expect(store.scriptVersions.s1).toBe('"e1"')
  })

  it('still succeeds if clearing the local draft fails', async () => {
    const store = await freshStore()
    drafts.delete.mockRejectedValue(new Error('IndexedDB blocked'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await store.deleteSession('s1')).toBe(true)
    expect(store.sessions.map((s) => s.id)).toEqual(['s2'])
  })
})
