import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  arbitraryQuillDelta,
  arbitraryEdit,
  arbitrarySessionState,
  arbitrarySaveEvent,
  arbitraryLifecycleEvent,
} from './generators'

describe('test-utils/generators smoke test', () => {
  it('arbitraryQuillDelta generates valid deltas', () => {
    fc.assert(
      fc.property(arbitraryQuillDelta(), (delta) => {
        expect(delta.ops).toBeDefined()
        expect(delta.ops.length).toBeGreaterThanOrEqual(1)
        for (const op of delta.ops) {
          expect(op.insert).toBeDefined()
        }
      }),
      { numRuns: 20 },
    )
  })

  it('arbitraryEdit generates edit with delta and timestamp', () => {
    fc.assert(
      fc.property(arbitraryEdit(), (edit) => {
        expect(edit.delta.ops.length).toBeGreaterThanOrEqual(1)
        expect(edit.timestamp).toBeGreaterThanOrEqual(1700000000000)
        expect(edit.timestamp).toBeLessThanOrEqual(1800000000000)
      }),
      { numRuns: 20 },
    )
  })

  it('arbitrarySessionState generates valid session state', () => {
    fc.assert(
      fc.property(arbitrarySessionState(), (state) => {
        expect(state.sessionId).toMatch(/^session-/)
        expect(state.delta.ops.length).toBeGreaterThanOrEqual(1)
        expect(state.cursorPosition).toBeGreaterThanOrEqual(0)
        expect(state.beatVolume).toBeGreaterThanOrEqual(0)
        expect(state.beatVolume).toBeLessThanOrEqual(1)
        expect(typeof state.beatLooping).toBe('boolean')
      }),
      { numRuns: 20 },
    )
  })

  it('arbitrarySaveEvent generates valid save events', () => {
    const validEvents = new Set([
      'edit', 'debounce_expire', 'periodic_flush', 'manual_flush',
      'server_success', 'server_success_with_pending', 'server_network_error',
      'server_error', 'connectivity_restored', 'retry',
    ])
    fc.assert(
      fc.property(arbitrarySaveEvent(), (event) => {
        expect(validEvents.has(event)).toBe(true)
      }),
      { numRuns: 20 },
    )
  })

  it('arbitraryLifecycleEvent generates valid lifecycle events', () => {
    const validEvents = new Set([
      'open_session', 'load_complete', 'first_edit', 'save_start',
      'save_success', 'save_error', 'retry',
    ])
    fc.assert(
      fc.property(arbitraryLifecycleEvent(), (event) => {
        expect(validEvents.has(event)).toBe(true)
      }),
      { numRuns: 20 },
    )
  })
})
