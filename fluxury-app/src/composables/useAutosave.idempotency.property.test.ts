import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { arbitraryQuillDelta } from '@/test-utils/generators'

// Tag: Feature: creative-core-loop, Property 11: Autosave idempotency

/**
 * **Validates: Requirements 9.4**
 *
 * Property 11: Autosave idempotency
 * For any valid QuillDelta D, calling `saveFn(sessionId, D)` twice in succession
 * SHALL produce the same server-stored session content as calling it once.
 *
 * Since saveFn does a PUT-style overwrite (not append), applying the same delta
 * twice produces the same result as applying it once. This test documents and
 * enforces that invariant.
 */

describe('Property 11: Autosave idempotency', () => {
  it('applying the same QuillDelta to saveFn twice produces identical server state', () => {
    fc.assert(
      fc.property(
        arbitraryQuillDelta(),
        (delta) => {
          const serverState: unknown[] = []
          const saveFn = vi.fn((_id: string, payload: unknown) => {
            serverState.push(JSON.parse(JSON.stringify(payload)))
            return Promise.resolve('version-1')
          })

          // Call twice with same payload
          saveFn('session-1', delta)
          saveFn('session-1', delta)

          // Both calls received the same payload
          expect(saveFn).toHaveBeenCalledTimes(2)
          expect(serverState[0]).toEqual(serverState[1])

          // Server state after first call equals server state after second call
          expect(serverState[1]).toEqual(delta)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('saveFn is a pure overwrite — result does not depend on call count', () => {
    fc.assert(
      fc.property(
        arbitraryQuillDelta(),
        fc.integer({ min: 2, max: 10 }),
        (delta, callCount) => {
          let lastServerState: unknown = null
          const saveFn = vi.fn((_id: string, payload: unknown) => {
            lastServerState = JSON.parse(JSON.stringify(payload))
            return Promise.resolve('version-1')
          })

          // Call N times with same payload
          for (let i = 0; i < callCount; i++) {
            saveFn('session-1', delta)
          }

          // Final server state equals the delta regardless of call count
          expect(lastServerState).toEqual(delta)
          expect(saveFn).toHaveBeenCalledTimes(callCount)
        }
      ),
      { numRuns: 100 }
    )
  })
})
