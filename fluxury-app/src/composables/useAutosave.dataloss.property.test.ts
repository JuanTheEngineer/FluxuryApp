import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { ref, nextTick } from 'vue'
import { useAutosave } from './useAutosave'
import type { QuillDelta } from '@/services/localDraft'
import { arbitraryQuillDelta } from '@/test-utils/generators'

// Tag: Feature: creative-core-loop, Property 8 & 9: Local draft and server write timing guarantees

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

/**
 * Helper to flush microtask queue multiple times (for chained async operations inside timers)
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => resolve(undefined))
  }
}

/**
 * **Validates: Requirements 6.1, 9.1, 9.2**
 *
 * Property 8: Local draft written within 500ms of every edit.
 * For any edit accepted by the Lyrics_Editor at time T, the Local_Draft store SHALL contain
 * the resulting Quill_Delta by time T+500ms, regardless of connectivity.
 *
 * Property 9: Server write within 17s of edit (when online).
 * For any edit accepted by the Lyrics_Editor at time T while connectivity is available,
 * a server write containing that edit's delta SHALL complete by time T+17s.
 */
describe('Property 8 & 9: Local draft and server write timing guarantees', () => {
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

  describe('Property 8: Local draft written within 500ms of every edit', () => {
    it('for any generated delta, localDraftService.set is called within 500ms of the edit', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryQuillDelta(),
          async (generatedDelta) => {
            // Reset mocks for this iteration
            ;(localDraftService.set as ReturnType<typeof vi.fn>).mockClear()

            const { delta, destroy } = createAutosave()

            // Simulate an edit by setting the delta
            delta.value = generatedDelta
            await nextTick()

            // Local draft should NOT have been called yet (timer not expired)
            expect(localDraftService.set).not.toHaveBeenCalled()

            // Advance exactly 500ms (the localWriteMs)
            vi.advanceTimersByTime(500)
            await flushMicrotasks()
            await nextTick()

            // Now the local draft MUST have been written
            expect(localDraftService.set).toHaveBeenCalled()
            expect(localDraftService.set).toHaveBeenCalledWith(
              expect.objectContaining({
                sessionId: 'session-1',
                delta: generatedDelta,
              })
            )

            // Cleanup before next iteration
            destroy()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('local draft is written within 500ms regardless of connectivity (offline)', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryQuillDelta(),
          async (generatedDelta) => {
            ;(localDraftService.set as ReturnType<typeof vi.fn>).mockClear()
            mockIsOnline.value = false

            const { delta, destroy } = createAutosave()

            // Simulate edit while offline
            delta.value = generatedDelta
            await nextTick()

            // Advance 500ms
            vi.advanceTimersByTime(500)
            await flushMicrotasks()
            await nextTick()

            // Local draft must still be written even when offline
            expect(localDraftService.set).toHaveBeenCalled()
            expect(localDraftService.set).toHaveBeenCalledWith(
              expect.objectContaining({
                sessionId: 'session-1',
                delta: generatedDelta,
              })
            )

            destroy()
            mockIsOnline.value = true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rapid edits still result in local draft written within 500ms of last edit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryQuillDelta(), { minLength: 2, maxLength: 10 }),
          async (deltas) => {
            ;(localDraftService.set as ReturnType<typeof vi.fn>).mockClear()

            const { delta, destroy } = createAutosave()

            // Simulate rapid edits with short intervals between them (each resets the timer)
            for (let i = 0; i < deltas.length; i++) {
              delta.value = deltas[i]
              await nextTick()
              // Advance 100ms between edits (less than localWriteMs, so timer resets)
              if (i < deltas.length - 1) {
                vi.advanceTimersByTime(100)
                await flushMicrotasks()
                await nextTick()
              }
            }

            // Now advance 500ms from the last edit
            vi.advanceTimersByTime(500)
            await flushMicrotasks()
            await nextTick()

            // The last call to localDraftService.set should contain the final delta
            const calls = (localDraftService.set as ReturnType<typeof vi.fn>).mock.calls
            expect(calls.length).toBeGreaterThanOrEqual(1)
            const lastCall = calls[calls.length - 1]
            expect(lastCall[0]).toMatchObject({
              sessionId: 'session-1',
              delta: deltas[deltas.length - 1],
            })

            destroy()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 9: Server write within 17s of edit (when online)', () => {
    it('for any generated delta while online, saveFn is called within 17s of the edit', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryQuillDelta(),
          async (generatedDelta) => {
            saveFn.mockClear()
            mockIsOnline.value = true

            const { delta, destroy } = createAutosave()

            // Simulate an edit
            delta.value = generatedDelta
            await nextTick()

            // Advance 17000ms (17s) — ample margin for debounce (1.5s) + periodic (15s)
            vi.advanceTimersByTime(17000)
            await flushMicrotasks()
            await nextTick()

            // Server write MUST have been called by now
            expect(saveFn).toHaveBeenCalled()
            expect(saveFn).toHaveBeenCalledWith('session-1', generatedDelta)

            destroy()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('server write completes via debounce (1.5s) which is well within 17s', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryQuillDelta(),
          async (generatedDelta) => {
            saveFn.mockClear()
            mockIsOnline.value = true

            const { delta, saveStatus, destroy } = createAutosave()

            // Simulate an edit
            delta.value = generatedDelta
            await nextTick()

            // Advance past debounce (1.5s)
            vi.advanceTimersByTime(1500)
            await flushMicrotasks()
            await nextTick()

            // Server write should have fired via debounce, well within 17s
            expect(saveFn).toHaveBeenCalledTimes(1)
            expect(saveFn).toHaveBeenCalledWith('session-1', generatedDelta)
            expect(saveStatus.value).toBe('saved')

            destroy()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('even with multiple rapid edits, server write completes within 17s of the first edit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryQuillDelta(), { minLength: 2, maxLength: 8 }),
          async (deltas) => {
            saveFn.mockClear()
            mockIsOnline.value = true

            const { delta, destroy } = createAutosave()

            // Simulate rapid edits spaced 1s apart (each resets the debounce)
            for (let i = 0; i < deltas.length; i++) {
              delta.value = deltas[i]
              await nextTick()
              if (i < deltas.length - 1) {
                vi.advanceTimersByTime(1000) // Each edit is 1s apart
                await flushMicrotasks()
                await nextTick()
              }
            }

            // Total time elapsed so far: (deltas.length - 1) * 1000 ms
            // Now advance the remaining time up to 17000ms total from start
            const elapsedSoFar = (deltas.length - 1) * 1000
            const remaining = 17000 - elapsedSoFar
            if (remaining > 0) {
              vi.advanceTimersByTime(remaining)
              await flushMicrotasks()
              await nextTick()
            }

            // By 17s from the first edit, server write MUST have been called
            expect(saveFn).toHaveBeenCalled()

            // The server write should have been called with the latest delta at least once
            const allCalls = saveFn.mock.calls
            const lastDelta = deltas[deltas.length - 1]
            const calledWithLastDelta = allCalls.some(
              (call: [string, QuillDelta]) => JSON.stringify(call[1]) === JSON.stringify(lastDelta)
            )
            expect(calledWithLastDelta).toBe(true)

            destroy()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
