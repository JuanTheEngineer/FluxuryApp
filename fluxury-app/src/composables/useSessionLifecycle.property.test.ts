import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import {
  useSessionLifecycle,
  isValidTransition,
  VALID_TRANSITIONS,
  type SessionLifecycleState,
} from './useSessionLifecycle'

const ALL_STATES: SessionLifecycleState[] = ['idle', 'loading', 'ready', 'editing', 'saving', 'saved', 'error']

// Tag: Feature: creative-core-loop, Property 4: Session lifecycle state machine correctness

/**
 * **Validates: Requirements 3.1, 3.9, 3.10**
 *
 * Property 4: Session lifecycle state machine correctness
 * For any sequence of events applied to the Session_Editor starting from `idle`,
 * the resulting state SHALL always be exactly one value from the valid set,
 * every transition SHALL be a member of the valid transition set, and
 * any invalid transition attempt SHALL be rejected without changing state.
 */
describe('Property 4: Session lifecycle state machine correctness', () => {
  it('state is always one of the valid set after any sequence of transitions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ALL_STATES), { minLength: 1, maxLength: 50 }),
        (targets) => {
          vi.spyOn(console, 'warn').mockImplementation(() => {})
          const { state, transition } = useSessionLifecycle('idle')

          for (const target of targets) {
            transition(target)
            expect(ALL_STATES).toContain(state.value)
          }

          vi.restoreAllMocks()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('valid transitions always succeed and update state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATES),
        (fromState) => {
          const validTargets = VALID_TRANSITIONS[fromState]
          if (validTargets.length === 0) return true // no valid transitions to test

          for (const target of validTargets) {
            const { state, transition } = useSessionLifecycle(fromState)
            const result = transition(target)
            expect(result).toBe(true)
            expect(state.value).toBe(target)
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('invalid transitions are rejected without changing state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATES),
        fc.constantFrom(...ALL_STATES),
        (fromState, targetState) => {
          if (isValidTransition(fromState, targetState)) return true // skip valid ones

          vi.spyOn(console, 'warn').mockImplementation(() => {})
          const { state, transition } = useSessionLifecycle(fromState)
          const result = transition(targetState)

          expect(result).toBe(false)
          expect(state.value).toBe(fromState) // unchanged

          vi.restoreAllMocks()
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
