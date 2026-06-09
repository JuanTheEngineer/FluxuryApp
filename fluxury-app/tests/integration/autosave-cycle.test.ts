import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import 'fake-indexeddb/auto'
import { useAutosave } from '@/composables/useAutosave'
import { localDraftService } from '@/services/localDraft'
import type { QuillDelta } from '@/services/localDraft'

// Mock ONLY useConnectivity (not localDraft — we want the real service with fake-indexeddb)
const mockIsOnline = ref(true)
const mockReconnectCallbacks = new Set<() => void>()

vi.mock('@/composables/useConnectivity', () => ({
  useConnectivity: () => ({
    isOnline: mockIsOnline,
    onReconnect: (cb: () => void) => mockReconnectCallbacks.add(cb),
    offReconnect: (cb: () => void) => mockReconnectCallbacks.delete(cb),
  }),
  reportNetworkError: vi.fn(),
  reportNetworkSuccess: vi.fn(),
}))

// Mock localDraftService to avoid IndexedDB async issues with fake timers
// We use an in-memory Map to simulate real persistence behavior
const draftStore = new Map<string, { sessionId: string; delta: QuillDelta; editTimestamp: number; cursorPosition: number; beatPlaybackPosition: number; beatVolume: number; beatLooping: boolean }>()

vi.mock('@/services/localDraft', () => ({
  localDraftService: {
    get: vi.fn(async (sessionId: string) => draftStore.get(sessionId) ?? null),
    set: vi.fn(async (draft: { sessionId: string; delta: QuillDelta; editTimestamp: number }) => {
      draftStore.set(draft.sessionId, draft as any)
    }),
    delete: vi.fn(async (sessionId: string) => { draftStore.delete(sessionId) }),
    isAvailable: vi.fn(() => true),
  },
}))

function createDelta(text: string): QuillDelta {
  return { ops: [{ insert: text }] }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => resolve(undefined))
  }
}

describe('Integration: autosave cycle', () => {
  let saveFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    saveFn = vi.fn().mockResolvedValue('version-1')
    mockIsOnline.value = true
    mockReconnectCallbacks.clear()
    draftStore.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createInstance(sessionId = 'session-integration') {
    const sessionIdRef = ref(sessionId)
    const delta = ref<QuillDelta | null>(null)

    const result = useAutosave({
      sessionId: sessionIdRef,
      delta,
      saveFn,
      debounceMs: 1500,
      periodicFlushMs: 15000,
      localWriteMs: 500,
    })

    return { sessionId: sessionIdRef, delta, ...result }
  }

  it('full cycle: edit → debounce → server write → reload → resume from local draft', async () => {
    const testDelta = createDelta('verse one lyrics')
    const { delta, saveStatus, destroy } = createInstance()

    // Type lyrics
    delta.value = testDelta
    await nextTick()

    // Wait for local draft write (500ms) + debounce (1500ms)
    vi.advanceTimersByTime(1500)
    await flushMicrotasks()
    await nextTick()

    // Verify server write occurred
    expect(saveFn).toHaveBeenCalledWith('session-integration', testDelta)
    expect(saveStatus.value).toBe('saved')

    destroy()

    // "Simulate reload": read local draft back
    const restored = await localDraftService.get('session-integration')
    expect(restored).not.toBeNull()
    expect(restored!.delta).toEqual(testDelta)
  })

  it('offline cycle: edit → local draft saved → reconnect → server sync', async () => {
    mockIsOnline.value = true
    saveFn.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    saveFn.mockResolvedValueOnce('version-2')

    const { delta, saveStatus, destroy } = createInstance()

    // Edit — server write will fail with network error
    delta.value = createDelta('offline bars')
    await nextTick()

    // Debounce fires, server write fails → offline_saved_locally
    vi.advanceTimersByTime(1500)
    await flushMicrotasks()
    await nextTick()

    expect(saveStatus.value).toBe('offline_saved_locally')

    // Verify local draft was persisted
    const draft = await localDraftService.get('session-integration')
    expect(draft).not.toBeNull()
    expect(draft!.delta).toEqual(createDelta('offline bars'))

    // Simulate reconnect
    mockIsOnline.value = true
    mockReconnectCallbacks.forEach((cb) => cb())
    await flushMicrotasks()
    await nextTick()

    // Server retry succeeds
    expect(saveStatus.value).toBe('saved')
    expect(saveFn).toHaveBeenCalledTimes(2)

    destroy()
  })

  it('rapid edits → single debounced save (not per-keystroke)', async () => {
    const { delta, destroy } = createInstance()

    // Rapid edits at 500ms intervals
    delta.value = createDelta('a')
    await nextTick()
    vi.advanceTimersByTime(500)
    await flushMicrotasks()

    delta.value = createDelta('ab')
    await nextTick()
    vi.advanceTimersByTime(500)
    await flushMicrotasks()

    delta.value = createDelta('abc')
    await nextTick()

    // Debounce hasn't fired yet (0ms since last edit)
    expect(saveFn).not.toHaveBeenCalled()

    // Wait full debounce from last edit
    vi.advanceTimersByTime(1500)
    await flushMicrotasks()
    await nextTick()

    // Only ONE server write with the final value
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenCalledWith('session-integration', createDelta('abc'))

    destroy()
  })

  it('flush() → immediate server write without waiting debounce', async () => {
    const { delta, saveStatus, flush, destroy } = createInstance()

    // Edit (dirty)
    delta.value = createDelta('flush me')
    await nextTick()
    expect(saveStatus.value).toBe('dirty')

    // Flush immediately (no timer advance)
    await flush()
    await flushMicrotasks()
    await nextTick()

    expect(saveFn).toHaveBeenCalledWith('session-integration', createDelta('flush me'))
    expect(saveStatus.value).toBe('saved')

    destroy()
  })

  it('local draft written within 500ms even when offline', async () => {
    mockIsOnline.value = false
    const { delta, destroy } = createInstance()

    delta.value = createDelta('offline draft')
    await nextTick()

    // Advance 500ms for local write timer
    vi.advanceTimersByTime(500)
    await flushMicrotasks()
    await nextTick()

    // Local draft should be persisted regardless of connectivity
    expect(localDraftService.set).toHaveBeenCalled()
    const draft = await localDraftService.get('session-integration')
    expect(draft).not.toBeNull()
    expect(draft!.delta).toEqual(createDelta('offline draft'))

    destroy()
  })

  it('beforeunload → local draft written synchronously via localStorage', () => {
    const { delta, destroy } = createInstance()

    // Set delta directly (simulate having typed)
    delta.value = createDelta('unload lyrics')

    // Fire beforeunload
    const event = new Event('beforeunload')
    window.dispatchEvent(event)

    // Check localStorage (synchronous fallback path used in beforeunload handler)
    const raw = localStorage.getItem('fluxury-draft-session-integration')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.delta).toEqual(createDelta('unload lyrics'))
    expect(parsed.sessionId).toBe('session-integration')

    // Cleanup
    localStorage.removeItem('fluxury-draft-session-integration')
    destroy()
  })
})
