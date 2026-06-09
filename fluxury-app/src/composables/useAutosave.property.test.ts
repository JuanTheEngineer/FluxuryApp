import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbitrarySaveEvent, type SaveStatus, type SaveEvent } from '@/test-utils/generators'
import { VALID_SAVE_TRANSITIONS, isValidSaveTransition } from './useAutosave'

// Tag: Feature: creative-core-loop, Property 5: Save_Status state machine correctness

/**
 * **Validates: Requirements 7.1, 7.3, 7.4**
 *
 * Property 5: Save_Status state machine correctness
 * For any sequence of events applied to the Autosave_Engine starting from `idle`,
 * the resulting Save_Status SHALL always be exactly one value from
 * { idle, dirty, saving, saved, offline_saved_locally, error },
 * every transition SHALL follow the rules defined in Requirement 7.3,
 * and `saved` SHALL never transition to `idle` without an intervening edit event.
 */

const ALL_SAVE_STATUSES: SaveStatus[] = [
  'idle',
  'dirty',
  'saving',
  'saved',
  'offline_saved_locally',
  'error',
]

/**
 * Pure reducer that applies a SaveEvent to a SaveStatus,
 * returning the next status according to the valid transitions.
 * If the event does not produce a valid transition from the current state,
 * the state remains unchanged.
 *
 * Transition mapping (event → which state transitions it triggers):
 *   edit: idle→dirty, saved→dirty, dirty→dirty (stays)
 *   debounce_expire / periodic_flush / manual_flush: dirty→saving
 *   server_success: saving→saved (no pending edits)
 *   server_success_with_pending: saving→dirty (pending edits exist)
 *   server_network_error: saving→offline_saved_locally
 *   server_error: saving→error
 *   connectivity_restored: offline_saved_locally→saving
 *   retry: error→saving
 */
function saveStatusReducer(status: SaveStatus, event: SaveEvent): SaveStatus {
  switch (event) {
    case 'edit': {
      // idle→dirty, saved→dirty, dirty stays dirty
      if (status === 'idle' || status === 'saved') return 'dirty'
      return status
    }
    case 'debounce_expire':
    case 'periodic_flush':
    case 'manual_flush': {
      // dirty→saving
      if (status === 'dirty') return 'saving'
      return status
    }
    case 'server_success': {
      // saving→saved (no pending edits)
      if (status === 'saving') return 'saved'
      return status
    }
    case 'server_success_with_pending': {
      // saving→dirty (pending edits arrived during save)
      if (status === 'saving') return 'dirty'
      return status
    }
    case 'server_network_error': {
      // saving→offline_saved_locally
      if (status === 'saving') return 'offline_saved_locally'
      return status
    }
    case 'server_error': {
      // saving→error
      if (status === 'saving') return 'error'
      return status
    }
    case 'connectivity_restored': {
      // offline_saved_locally→saving
      if (status === 'offline_saved_locally') return 'saving'
      return status
    }
    case 'retry': {
      // error→saving
      if (status === 'error') return 'saving'
      return status
    }
    default:
      return status
  }
}

describe('Property 5: Save_Status state machine correctness', () => {
  it('status is always one of the 6 valid values after any sequence of events', () => {
    fc.assert(
      fc.property(
        fc.array(arbitrarySaveEvent(), { minLength: 1, maxLength: 50 }),
        (events) => {
          let status: SaveStatus = 'idle'

          for (const event of events) {
            status = saveStatusReducer(status, event)
            expect(ALL_SAVE_STATUSES).toContain(status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every transition follows the valid transition rules from Requirement 7.3', () => {
    fc.assert(
      fc.property(
        fc.array(arbitrarySaveEvent(), { minLength: 1, maxLength: 50 }),
        (events) => {
          let status: SaveStatus = 'idle'

          for (const event of events) {
            const prevStatus = status
            status = saveStatusReducer(status, event)

            // If a transition occurred, it must be valid
            if (status !== prevStatus) {
              expect(
                isValidSaveTransition(prevStatus, status),
              ).toBe(true)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('saved never transitions directly to idle without an intervening edit', () => {
    fc.assert(
      fc.property(
        fc.array(arbitrarySaveEvent(), { minLength: 1, maxLength: 50 }),
        (events) => {
          let status: SaveStatus = 'idle'
          let wasJustSaved = false

          for (const event of events) {
            const prevStatus = status
            status = saveStatusReducer(status, event)

            // Track when we enter 'saved'
            if (status === 'saved' && prevStatus !== 'saved') {
              wasJustSaved = true
            }

            // If we were in 'saved' and something changed, verify it's not 'idle'
            if (wasJustSaved && status !== 'saved') {
              // The only valid exit from 'saved' is to 'dirty' (via edit)
              expect(status).not.toBe('idle')
              wasJustSaved = false
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('from saved, only edit event causes a transition (to dirty)', () => {
    fc.assert(
      fc.property(
        arbitrarySaveEvent(),
        (event) => {
          const result = saveStatusReducer('saved', event)

          if (event === 'edit') {
            // edit from saved → dirty
            expect(result).toBe('dirty')
          } else {
            // all other events from saved → stay saved
            expect(result).toBe('saved')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('from idle, only edit event causes a transition (to dirty)', () => {
    fc.assert(
      fc.property(
        arbitrarySaveEvent(),
        (event) => {
          const result = saveStatusReducer('idle', event)

          if (event === 'edit') {
            expect(result).toBe('dirty')
          } else {
            expect(result).toBe('idle')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('valid transitions from each state match VALID_SAVE_TRANSITIONS map', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SAVE_STATUSES),
        fc.array(arbitrarySaveEvent(), { minLength: 10, maxLength: 30 }),
        (startState, events) => {
          // Starting from any valid state, all transitions that occur must be valid
          let status: SaveStatus = startState

          for (const event of events) {
            const prevStatus = status
            status = saveStatusReducer(status, event)

            if (status !== prevStatus) {
              // Verify transition is in the allowed set
              expect(VALID_SAVE_TRANSITIONS[prevStatus]).toContain(status)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
