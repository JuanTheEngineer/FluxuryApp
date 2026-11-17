import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAutosave, type SaveStatus } from './useAutosave'
import type { QuillDelta } from '@/services/localDraft'

// Mock the localDraftService
vi.mock('@/services/localDraft', () => ({
  localDraftService: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockReturnValue(true),
  },
}))

// Mock useConnectivity
const mockIsOnline = ref(true)
const mockReconnectCallbacks = new Set<() => void>()

vi.mock('./useConnectivity', () => ({
  useConnectivity: () => ({
    isOnline: mockIsOnline,
    onReconnect: (cb: () => void) => mockReconnectCallbacks.add(cb),
    offReconnect: (cb: () => void) => mockReconnectCallbacks.delete(cb),
  }),
  reportNetworkError: vi.fn(),
  reportNetworkSuccess: vi.fn(),
}))

import { localDraftService } from '@/services/localDraft'
import { reportNetworkError, reportNetworkSuccess } from './useConnectivity'

function createDelta(text: string): QuillDelta {
  return { ops: [{ insert: text }] }
}

/**
 * Helper to flush microtask queue multiple times (for chained async operations inside timers)
 */
async function flushMicrotasks(): Promise<void> {
  // Multiple flush cycles to handle chained promises (e.g., saveFn reject → writeLocalDraft → status set)
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => resolve(undefined))
  }
}

describe('useAutosave', () => {
  let saveFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    saveFn = vi.fn().mockResolvedValue('version-1')
    mockIsOnline.value = true
    mockReconnectCallbacks.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createAutosave(overrides: Partial<Parameters<typeof useAutosave>[0]> = {}) {
    const sessionId = ref('session-1')
    const delta = ref<QuillDelta | null>(null)

    const result = useAutosave({
      sessionId,
      delta,
      saveFn,
      debounceMs: 1500,
      periodicFlushMs: 15000,
      localWriteMs: 500,
      ...overrides,
    })

    return { sessionId, delta, ...result }
  }

  describe('initial state', () => {
    it('starts with idle status', () => {
      const { saveStatus, destroy } = createAutosave()
      expect(saveStatus.value).toBe('idle')
      destroy()
    })

    it('starts with null timestamps', () => {
      const { lastSavedAt, lastLocalSaveAt, destroy } = createAutosave()
      expect(lastSavedAt.value).toBeNull()
      expect(lastLocalSaveAt.value).toBeNull()
      destroy()
    })
  })

  describe('delta change → dirty', () => {
    it('transitions to dirty on delta change', async () => {
      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      expect(saveStatus.value).toBe('dirty')
      destroy()
    })

    it('schedules local draft write within 500ms', async () => {
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      expect(localDraftService.set).not.toHaveBeenCalled()

      // Advance 500ms for local write timer
      vi.advanceTimersByTime(500)
      await flushMicrotasks()
      await nextTick()

      expect(localDraftService.set).toHaveBeenCalledTimes(1)
      destroy()
    })

    it('resets local write timer on rapid edits (batches)', async () => {
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()
      vi.advanceTimersByTime(300)

      delta.value = createDelta('ab')
      await nextTick()
      vi.advanceTimersByTime(300)

      delta.value = createDelta('abc')
      await nextTick()

      // Only 300ms since last edit, not yet 500ms
      expect(localDraftService.set).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      await flushMicrotasks()
      await nextTick()

      // Should have written once with latest delta
      expect(localDraftService.set).toHaveBeenCalledTimes(1)
      expect(localDraftService.set).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          delta: createDelta('abc'),
        })
      )
      destroy()
    })
  })

  describe('local draft sync flag (multi-copy resume)', () => {
    const setCalls = () => vi.mocked(localDraftService.set).mock.calls.map(([d]) => d)

    it('writes edits to the local draft as unsynced', async () => {
      const { delta, destroy } = createAutosave()
      delta.value = createDelta('bars')
      await nextTick()
      vi.advanceTimersByTime(500)
      await flushMicrotasks()

      expect(setCalls().at(-1)).toMatchObject({ delta: createDelta('bars'), synced: false })
      destroy()
    })

    it('marks the draft synced after a server save with no newer edits', async () => {
      const { delta, destroy } = createAutosave()
      delta.value = createDelta('bars')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()

      expect(saveFn).toHaveBeenCalledTimes(1)
      expect(setCalls().at(-1)).toMatchObject({ delta: createDelta('bars'), synced: true })
      destroy()
    })

    it('keeps the draft unsynced when edits arrive during the save', async () => {
      let finishSave!: () => void
      saveFn.mockImplementationOnce(() => new Promise<string>((resolve) => { finishSave = () => resolve('v1') }))
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('first')
      await nextTick()
      vi.advanceTimersByTime(1500) // save of 'first' starts and hangs
      await flushMicrotasks()

      delta.value = createDelta('first, second') // edit during the save
      await nextTick()
      vi.advanceTimersByTime(500)
      await flushMicrotasks()
      finishSave()
      await flushMicrotasks()

      expect(setCalls().some((d) => d.synced === true)).toBe(false)
      destroy()
    })

    it('keeps the draft unsynced when the server save fails', async () => {
      saveFn.mockRejectedValue(new TypeError('Failed to fetch'))
      const { delta, destroy } = createAutosave()
      delta.value = createDelta('offline bars')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()

      expect(setCalls().length).toBeGreaterThan(0)
      expect(setCalls().every((d) => d.synced === false)).toBe(true)
      destroy()
    })
  })

  describe('debounce → server write', () => {
    it('attempts server write after debounce expires (1.5s)', async () => {
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      expect(saveFn).not.toHaveBeenCalled()

      // Advance past debounce
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(saveFn).toHaveBeenCalledWith('session-1', createDelta('hello'))
      destroy()
    })

    it('resets debounce timer on each edit', async () => {
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()
      vi.advanceTimersByTime(1000)

      delta.value = createDelta('ab')
      await nextTick()
      vi.advanceTimersByTime(1000)

      // Only 1000ms since last edit, debounce not expired
      expect(saveFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      await flushMicrotasks()
      await nextTick()

      expect(saveFn).toHaveBeenCalledTimes(1)
      destroy()
    })

    it('transitions saving → saved on success', async () => {
      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(saveStatus.value).toBe('saved')
      destroy()
    })

    it('records lastSavedAt on success', async () => {
      const { delta, lastSavedAt, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(lastSavedAt.value).toBeTypeOf('number')
      expect(lastSavedAt.value).toBeGreaterThan(0)
      destroy()
    })

    it('calls reportNetworkSuccess on successful save', async () => {
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(reportNetworkSuccess).toHaveBeenCalled()
      destroy()
    })
  })

  describe('edits during save → dirty', () => {
    it('transitions to dirty if edits arrive during save', async () => {
      // Make saveFn take some time — resolved via a deferred promise
      let resolveSave: (value: string | null) => void
      saveFn.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      // Trigger debounce expiry
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(saveStatus.value).toBe('saving')

      // Edit arrives during save
      delta.value = createDelta('hello world')
      await nextTick()

      // Complete the save
      resolveSave!('v1')
      await flushMicrotasks()
      await nextTick()

      // Should be dirty because new edits arrived
      expect(saveStatus.value).toBe('dirty')
      destroy()
    })
  })

  describe('network error → offline_saved_locally', () => {
    it('sets offline_saved_locally on network error (TypeError)', async () => {
      saveFn.mockRejectedValue(new TypeError('Failed to fetch'))

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(saveStatus.value).toBe('offline_saved_locally')
      destroy()
    })

    it('confirms local draft is written before setting offline status', async () => {
      saveFn.mockRejectedValue(new TypeError('Failed to fetch'))

      const { delta, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      // localDraftService.set should have been called for the offline confirmation
      expect(localDraftService.set).toHaveBeenCalled()
      destroy()
    })

    it('calls reportNetworkError on network failure', async () => {
      saveFn.mockRejectedValue(new TypeError('Failed to fetch'))

      const { delta, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(reportNetworkError).toHaveBeenCalled()
      destroy()
    })
  })

  describe('non-network error → error', () => {
    it('sets error status on non-network server error', async () => {
      const serverError = Object.assign(new Error('Internal Server Error'), { response: { status: 500 } })
      saveFn.mockRejectedValue(serverError)

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(saveStatus.value).toBe('error')
      destroy()
    })
  })

  describe('periodic flush', () => {
    it('forces server write every 15s while dirty', async () => {
      // Use a saveFn that transitions to dirty after first save (simulating edits during save)
      let callCount = 0
      saveFn.mockImplementation(() => {
        callCount++
        return Promise.resolve(`v${callCount}`)
      })

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      // Debounce fires at 1.5s
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()
      expect(saveFn).toHaveBeenCalledTimes(1)
      expect(saveStatus.value).toBe('saved')

      // Make a new edit
      saveFn.mockClear()
      delta.value = createDelta('hello world')
      await nextTick()
      expect(saveStatus.value).toBe('dirty')

      // Debounce fires again at 1.5s
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()
      expect(saveFn).toHaveBeenCalledTimes(1)

      destroy()
    })
  })

  describe('connectivity restored → retry', () => {
    it('retries server write on reconnect when offline_saved_locally', async () => {
      saveFn.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      saveFn.mockResolvedValueOnce('version-2')

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()

      expect(saveStatus.value).toBe('offline_saved_locally')

      // Simulate reconnect
      mockReconnectCallbacks.forEach((cb) => cb())
      await flushMicrotasks()
      await nextTick()

      expect(saveStatus.value).toBe('saved')
      expect(saveFn).toHaveBeenCalledTimes(2)
      destroy()
    })
  })

  describe('flush()', () => {
    it('immediately writes to server if dirty', async () => {
      const { delta, saveStatus, flush, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()
      expect(saveStatus.value).toBe('dirty')

      await flush()
      await flushMicrotasks()
      await nextTick()

      expect(saveFn).toHaveBeenCalledWith('session-1', createDelta('hello'))
      expect(saveStatus.value).toBe('saved')
      destroy()
    })

    it('does nothing if not dirty', async () => {
      const { flush, destroy } = createAutosave()

      await flush()
      await flushMicrotasks()
      await nextTick()

      expect(saveFn).not.toHaveBeenCalled()
      destroy()
    })
  })

  describe('destroy()', () => {
    it('clears all timers and removes listeners', async () => {
      const { delta, destroy } = createAutosave()

      delta.value = createDelta('hello')
      await nextTick()

      destroy()

      // Advance time — debounce should not fire
      vi.advanceTimersByTime(2000)
      await flushMicrotasks()
      await nextTick()

      // saveFn should not have been called since we destroyed before debounce fired
      expect(saveFn).not.toHaveBeenCalled()
    })

    it('removes reconnect callback', () => {
      const { destroy } = createAutosave()

      expect(mockReconnectCallbacks.size).toBe(1)
      destroy()
      expect(mockReconnectCallbacks.size).toBe(0)
    })
  })

  describe('state transitions follow valid rules', () => {
    it('idle → dirty on edit', async () => {
      const { delta, saveStatus, destroy } = createAutosave()
      expect(saveStatus.value).toBe('idle')

      delta.value = createDelta('a')
      await nextTick()
      expect(saveStatus.value).toBe('dirty')
      destroy()
    })

    it('dirty → saving on debounce expiry', async () => {
      // Use a deferred saveFn to observe saving state
      let resolveSave: (value: string | null) => void
      saveFn.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()

      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()
      expect(saveStatus.value).toBe('saving')

      resolveSave!('v1')
      await flushMicrotasks()
      await nextTick()
      destroy()
    })

    it('saved → dirty on new edit', async () => {
      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()
      expect(saveStatus.value).toBe('saved')

      delta.value = createDelta('ab')
      await nextTick()
      expect(saveStatus.value).toBe('dirty')
      destroy()
    })

    it('offline_saved_locally → saving on reconnect', async () => {
      saveFn.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      let resolveSave: (value: string | null) => void
      saveFn.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()
      expect(saveStatus.value).toBe('offline_saved_locally')

      mockReconnectCallbacks.forEach((cb) => cb())
      await flushMicrotasks()
      await nextTick()
      expect(saveStatus.value).toBe('saving')

      resolveSave!('v1')
      await flushMicrotasks()
      await nextTick()
      expect(saveStatus.value).toBe('saved')
      destroy()
    })

    it('error → saving on retry via flush()', async () => {
      const serverError = Object.assign(new Error('Server Error'), { response: { status: 500 } })
      saveFn.mockRejectedValueOnce(serverError)
      saveFn.mockResolvedValueOnce('v2')

      const { delta, saveStatus, flush, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      await nextTick()
      expect(saveStatus.value).toBe('error')

      // The Retry button calls flush(): it must retry from 'error'
      await flush()
      await flushMicrotasks()
      expect(saveFn).toHaveBeenCalledTimes(2)
      expect(saveStatus.value).toBe('saved')
      destroy()
    })

    it('a new edit after an error retries the save after the debounce', async () => {
      const serverError = Object.assign(new Error('Server Error'), { response: { status: 500 } })
      saveFn.mockRejectedValueOnce(serverError)
      saveFn.mockResolvedValueOnce('v2')

      const { delta, saveStatus, destroy } = createAutosave()

      delta.value = createDelta('a')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      expect(saveStatus.value).toBe('error')

      delta.value = createDelta('ab')
      await nextTick()
      vi.advanceTimersByTime(1500)
      await flushMicrotasks()
      expect(saveFn).toHaveBeenLastCalledWith('session-1', createDelta('ab'))
      expect(saveStatus.value).toBe('saved')
      destroy()
    })
  })
})
