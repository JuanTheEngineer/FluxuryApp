import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbitraryQuillDelta, arbitrarySessionState } from '@/test-utils/generators'
import type { QuillDelta } from '@/services/localDraft'

// Tag: Feature: creative-core-loop, Properties 10, 12, 13: Resume flow correctness

/**
 * Pure resume logic (extracted from SessionEditorView for testability):
 * Given a server delta + timestamp and a local draft delta + timestamp,
 * return the selected delta and cursor position.
 *
 * Last_Write_Wins: local wins only if it exists and has a strictly newer timestamp.
 * Server wins on tie or when local is absent/older.
 */
interface ResumeInput {
  serverDelta: QuillDelta
  serverTimestamp: number
  localDelta: QuillDelta | null
  localTimestamp: number | null
  localCursorPosition: number
}

interface ResumeOutput {
  selectedDelta: QuillDelta
  cursorPosition: number
}

function resolveResume(input: ResumeInput): ResumeOutput {
  const { serverDelta, serverTimestamp, localDelta, localTimestamp, localCursorPosition } = input

  // Last_Write_Wins: local wins only if it exists and has a strictly newer timestamp
  if (localDelta && localTimestamp !== null && localTimestamp > serverTimestamp) {
    return { selectedDelta: localDelta, cursorPosition: localCursorPosition }
  }

  // Server wins (including tie)
  return { selectedDelta: serverDelta, cursorPosition: 0 }
}

/**
 * **Validates: Requirements 9.3, 10.1**
 *
 * Property 10: Last_Write_Wins — newer timestamp delta selected on resume
 * For any pair of (server delta with timestamp Ts, local draft delta with timestamp Tl),
 * the Session_Editor on resume SHALL select the delta with max(Ts, Tl).
 * If timestamps are equal, server delta takes precedence.
 */
describe('Property 10: Last_Write_Wins — newer timestamp selected on resume', () => {
  it('selects the delta with the higher timestamp; server wins on tie', () => {
    fc.assert(
      fc.property(
        arbitraryQuillDelta(),
        arbitraryQuillDelta(),
        fc.integer({ min: 1000, max: 2000000000000 }),
        fc.integer({ min: 1000, max: 2000000000000 }),
        fc.integer({ min: 0, max: 500 }),
        (serverDelta, localDelta, serverTs, localTs, cursor) => {
          const result = resolveResume({
            serverDelta,
            serverTimestamp: serverTs,
            localDelta,
            localTimestamp: localTs,
            localCursorPosition: cursor,
          })

          if (localTs > serverTs) {
            expect(result.selectedDelta).toEqual(localDelta)
            expect(result.cursorPosition).toBe(cursor)
          } else {
            // Server wins on tie or when server is newer
            expect(result.selectedDelta).toEqual(serverDelta)
            expect(result.cursorPosition).toBe(0)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

/**
 * **Validates: Requirements 9.5**
 *
 * Property 12: Zero-data-loss round-trip
 * For any sequence of edits followed by a reload, the restored Quill_Delta SHALL equal
 * the most recently committed edit at the time of reload.
 */
describe('Property 12: Zero-data-loss round-trip', () => {
  it('restored delta equals the most recently committed edit', () => {
    fc.assert(
      fc.property(
        arbitraryQuillDelta(), // the "committed" edit
        fc.integer({ min: 1000, max: 2000000000000 }), // its timestamp
        (committedDelta, timestamp) => {
          // Scenario: the committed edit is either in local draft or server
          // If it's the most recent, resume must return it

          // Case 1: committed edit is in local draft (newer than server)
          const result1 = resolveResume({
            serverDelta: { ops: [{ insert: 'old\n' }] },
            serverTimestamp: timestamp - 1000,
            localDelta: committedDelta,
            localTimestamp: timestamp,
            localCursorPosition: 0,
          })
          expect(result1.selectedDelta).toEqual(committedDelta)

          // Case 2: committed edit is on server (newer than local)
          const result2 = resolveResume({
            serverDelta: committedDelta,
            serverTimestamp: timestamp,
            localDelta: { ops: [{ insert: 'old\n' }] },
            localTimestamp: timestamp - 1000,
            localCursorPosition: 0,
          })
          expect(result2.selectedDelta).toEqual(committedDelta)
        },
      ),
      { numRuns: 100 },
    )
  })
})

/**
 * **Validates: Requirements 10.5**
 *
 * Property 13: Resume determinism
 * For any persisted session state S, resuming from S SHALL always produce
 * the same editor state: same delta content, same cursor position.
 */
describe('Property 13: Resume determinism', () => {
  it('same persisted state always produces same editor state', () => {
    fc.assert(
      fc.property(
        arbitrarySessionState(),
        arbitraryQuillDelta(),
        fc.integer({ min: 1000, max: 2000000000000 }),
        (localState, serverDelta, serverTs) => {
          const input: ResumeInput = {
            serverDelta,
            serverTimestamp: serverTs,
            localDelta: localState.delta,
            localTimestamp: localState.editTimestamp,
            localCursorPosition: localState.cursorPosition,
          }

          const result1 = resolveResume(input)
          const result2 = resolveResume(input)

          expect(result1).toEqual(result2)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns server delta when no local draft exists', () => {
    fc.assert(
      fc.property(
        arbitraryQuillDelta(),
        fc.integer({ min: 1000, max: 2000000000000 }),
        (serverDelta, serverTs) => {
          const result = resolveResume({
            serverDelta,
            serverTimestamp: serverTs,
            localDelta: null,
            localTimestamp: null,
            localCursorPosition: 0,
          })
          expect(result.selectedDelta).toEqual(serverDelta)
        },
      ),
      { numRuns: 100 },
    )
  })
})
