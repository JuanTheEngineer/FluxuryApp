import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Timing and undo rules are covered in useUndoableDelete.test.ts; this covers
// what the store adds: the real delete call and the failure message.
const sessionStore = {
  error: null as string | null,
  deleteSession: vi.fn<(id: string) => Promise<boolean>>(),
}
vi.mock('./sessionStore', () => ({ useSessionStore: () => sessionStore }))

async function freshStore() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSessionDeletionStore } = await import('./sessionDeletionStore')
  return useSessionDeletionStore()
}

describe('sessionDeletionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStore.deleteSession.mockReset().mockResolvedValue(true)
  })
  afterEach(() => vi.useRealTimers())

  it('holds a requested delete as pending, then deletes through the session store', async () => {
    const store = await freshStore()
    store.request({ id: 's1', name: 'Verse one' })

    expect(store.pending).toEqual({ id: 's1', name: 'Verse one' })
    expect(store.isHidden('s1')).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(sessionStore.deleteSession).toHaveBeenCalledWith('s1')
    expect(store.pending).toBeNull()
  })

  it('a failed delete sets a message naming the session, which clears itself', async () => {
    sessionStore.deleteSession.mockResolvedValue(false)
    const store = await freshStore()
    store.request({ id: 's1', name: 'Verse one' })
    await vi.advanceTimersByTimeAsync(5000)

    expect(store.error).toBe("Couldn't delete “Verse one”. It's back in your list.")
    expect(store.isHidden('s1')).toBe(false)

    await vi.advanceTimersByTimeAsync(6000)
    expect(store.error).toBeNull()
  })

  it('a new delete clears an old failure message', async () => {
    sessionStore.deleteSession.mockResolvedValueOnce(false)
    const store = await freshStore()
    store.request({ id: 's1', name: 'Verse one' })
    await vi.advanceTimersByTimeAsync(5000)
    store.request({ id: 's2', name: 'Hook' })

    expect(store.error).toBeNull()
    expect(store.pending?.name).toBe('Hook')
  })
})
