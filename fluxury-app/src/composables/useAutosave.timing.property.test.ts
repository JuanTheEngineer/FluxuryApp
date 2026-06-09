import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { ref, nextTick } from 'vue'
import { useAutosave } from './useAutosave'
import type { QuillDelta } from '@/services/localDraft'

// Tag: Feature: creative-core-loop, Property 6 & 7: Debounce and periodic flush timing

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

function createDelta(text: string): QuillDelta {
  return { ops: [{ insert: text }] }
}

/**
 * Helper to flush microtask queue multiple times (for chained async operations inside timers)
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => resolve(undefined))
  }
}

/**
 * **Validates: Requirements 5.1, 5.2**
 *
 * Property 6: Debounced save fires 1.5s after last edit
 * For any sequence of edits with the last edit at time T, and no further edits
 * occurring between T and T+1.5s, a server write SHALL be initiated at time
 * T+1.5s (±50ms tolerance for timer precision).
 *
 * Property 7: Periodic flush within 15s
 * For any session in the Editing state where the most recent server write was at time T,
 * if unsaved edits exist and connectivity is available, a server write SHALL occur
 * before time T+15s.
 */
describe('Property 6: Debounced save fires 1.5s after last edit', () => {
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

  it('server write fires at debounceMs after the LAST edit in any arbitrary edit sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of (delay_before_edit_ms, delta_text) tuples
        // Delays are less than debounceMs so debounce keeps resetting
        fc.array(
          fc.record({
            delayMs: fc.integer({ min: 50, max: 1400 }),
            text: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 15 }
        ),
        async (editSequence) => {
          saveFn.mockClear()

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs: 30000, // large periodic to avoid interference
            localWriteMs: 500,
          })

          // Apply each edit with the specified delay
          for (const edit of editSequence) {
            vi.advanceTimersByTime(edit.delayMs)
            delta.value = createDelta(edit.text)
            await nextTick() // flush Vue watcher
          }

          // Clear any calls that may have happened during the sequence
          saveFn.mockClear()

          // Advance time by debounceMs - 51ms (just before the tolerance window)
          vi.advanceTimersByTime(debounceMs - 51)
          await flushMicrotasks()

          // Server write should NOT have fired yet
          expect(saveFn).not.toHaveBeenCalled()

          // Advance the remaining 51ms to cross the debounce threshold
          vi.advanceTimersByTime(51)
          await flushMicrotasks()

          // Server write should have fired now (at debounceMs after last edit)
          expect(saveFn).toHaveBeenCalled()

          // Verify it was called with the last delta text
          const lastText = editSequence[editSequence.length - 1].text
          expect(saveFn).toHaveBeenCalledWith('session-1', createDelta(lastText))

          destroy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('debounce resets on each new edit — no premature server writes within debounce window', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate edits that arrive at intervals always shorter than debounceMs
        fc.array(
          fc.record({
            delayMs: fc.integer({ min: 100, max: 1000 }),
            text: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (editSequence) => {
          saveFn.mockClear()

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs: 30000, // large periodic to avoid interference
            localWriteMs: 500,
          })

          // Apply all edits — each interval < debounceMs, so debounce should never fire
          for (const edit of editSequence) {
            vi.advanceTimersByTime(edit.delayMs)
            delta.value = createDelta(edit.text)
            await nextTick()
          }

          // No server write should have occurred yet since each edit resets the debounce
          expect(saveFn).not.toHaveBeenCalled()

          // Now wait for debounce to fire
          vi.advanceTimersByTime(debounceMs)
          await flushMicrotasks()

          // Exactly one server write
          expect(saveFn).toHaveBeenCalledTimes(1)

          destroy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('server write fires exactly once per debounce expiry (not multiple)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (burstCount, baseText) => {
          saveFn.mockClear()

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs: 30000,
            localWriteMs: 500,
          })

          // Rapid burst of edits (100ms apart)
          for (let i = 0; i < burstCount; i++) {
            vi.advanceTimersByTime(100)
            delta.value = createDelta(baseText + i)
            await nextTick()
          }

          // Wait for debounce
          vi.advanceTimersByTime(debounceMs)
          await flushMicrotasks()

          // Should fire exactly once
          expect(saveFn).toHaveBeenCalledTimes(1)

          // Should be called with the LAST delta
          expect(saveFn).toHaveBeenCalledWith('session-1', createDelta(baseText + (burstCount - 1)))

          destroy()
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 7: Periodic flush within 15s', () => {
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

  it('periodic flush fires within periodicFlushMs even when debounce never expires due to continuous edits', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate edit intervals always shorter than debounceMs so debounce never fires on its own
        fc.integer({ min: 500, max: 1400 }),
        async (editInterval) => {
          saveFn.mockClear()

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500
          const periodicFlushMs = 15000

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs,
            localWriteMs: 500,
          })

          // Make initial edit
          delta.value = createDelta('initial')
          await nextTick()

          // Keep editing at regular intervals (always < debounceMs)
          // Continue until we pass periodicFlushMs
          let elapsed = 0
          let editCount = 0
          while (elapsed < periodicFlushMs + editInterval) {
            vi.advanceTimersByTime(editInterval)
            elapsed += editInterval
            editCount++
            delta.value = createDelta(`edit-${editCount}`)
            await nextTick()
            await flushMicrotasks()
          }

          // By now, periodic flush should have triggered at least once
          expect(saveFn).toHaveBeenCalled()

          destroy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('periodic flush fires after an initial save when session stays dirty due to continuous edits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 500, max: 1200 }),
        async (editInterval) => {
          saveFn.mockClear()

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500
          const periodicFlushMs = 15000

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs,
            localWriteMs: 500,
          })

          // First edit and let debounce fire (initial save)
          delta.value = createDelta('first edit')
          await nextTick()
          vi.advanceTimersByTime(debounceMs)
          await flushMicrotasks()
          await nextTick()

          expect(saveFn).toHaveBeenCalledTimes(1)
          saveFn.mockClear()

          // Now keep editing continuously so debounce never fires
          let elapsed = 0
          let editCount = 0
          while (elapsed < periodicFlushMs + editInterval) {
            vi.advanceTimersByTime(editInterval)
            elapsed += editInterval
            editCount++
            delta.value = createDelta(`continuous-edit-${editCount}`)
            await nextTick()
            await flushMicrotasks()
          }

          // Periodic flush should have triggered within 15s of last write
          expect(saveFn).toHaveBeenCalled()

          destroy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('periodic flush does NOT fire if session is not dirty (already saved)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 16000, max: 30000 }),
        async (waitTime) => {
          saveFn.mockClear()

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500
          const periodicFlushMs = 15000

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs,
            localWriteMs: 500,
          })

          // Make one edit and let debounce fire (transitions to saved)
          delta.value = createDelta('hello')
          await nextTick()
          vi.advanceTimersByTime(debounceMs)
          await flushMicrotasks()
          await nextTick()

          expect(saveFn).toHaveBeenCalledTimes(1)
          saveFn.mockClear()

          // Now wait a long time without any edits
          vi.advanceTimersByTime(waitTime)
          await flushMicrotasks()

          // No additional server write should occur — session is saved, not dirty
          expect(saveFn).not.toHaveBeenCalled()

          destroy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('periodic flush does NOT fire when offline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 500, max: 1200 }),
        async (editInterval) => {
          saveFn.mockClear()
          mockIsOnline.value = false

          const sessionId = ref('session-1')
          const delta = ref<QuillDelta | null>(null)
          const debounceMs = 1500
          const periodicFlushMs = 15000

          const { destroy } = useAutosave({
            sessionId,
            delta,
            saveFn,
            debounceMs,
            periodicFlushMs,
            localWriteMs: 500,
          })

          // Make edits continuously while offline
          delta.value = createDelta('initial')
          await nextTick()

          let elapsed = 0
          let editCount = 0
          while (elapsed < periodicFlushMs + editInterval * 2) {
            vi.advanceTimersByTime(editInterval)
            elapsed += editInterval
            editCount++
            delta.value = createDelta(`offline-edit-${editCount}`)
            await nextTick()
            await flushMicrotasks()
          }

          // No server write should occur — we are offline
          expect(saveFn).not.toHaveBeenCalled()

          destroy()
          mockIsOnline.value = true
        }
      ),
      { numRuns: 100 }
    )
  })
})
