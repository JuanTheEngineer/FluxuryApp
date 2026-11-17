import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbitraryQuillDelta, arbitrarySessionState } from '@/test-utils/generators'
import type { LocalDraft, QuillDelta } from '@/services/localDraft'
import { encodeServerScript, resolveResume } from '@/services/resume'

// Tag: Feature: creative-core-loop, Properties 10, 12, 13: Resume flow correctness
//
// These properties exercise the REAL resolveResume used by SessionEditorView.
// (They previously tested a copy pasted into this file, which is how the
// stale-draft bug shipped with every property green.)

const ts = () => fc.integer({ min: 1000, max: 2000000000000 })

function draft(delta: QuillDelta, editTimestamp: number, synced: boolean, cursorPosition = 0): LocalDraft {
  return {
    sessionId: 's1', delta, editTimestamp, cursorPosition,
    beatPlaybackPosition: 0, beatVolume: 0.8, beatLooping: false, synced,
  }
}

/**
 * **Validates: Requirements 9.3, 10.1**
 *
 * Property 10: Last_Write_Wins among copies that hold unsaved work.
 * Unsynced local edits win only when strictly newer than the server; server
 * wins ties. A synced draft never wins.
 */
describe('Property 10: Last_Write_Wins — newer timestamp selected on resume', () => {
  it('unsynced draft: selects the newer copy; server wins on tie', () => {
    fc.assert(
      fc.property(arbitraryQuillDelta(), arbitraryQuillDelta(), ts(), ts(), fc.integer({ min: 0, max: 500 }),
        (serverDelta, localDelta, serverTs, localTs, cursor) => {
          const r = resolveResume(encodeServerScript(serverDelta, serverTs), draft(localDelta, localTs, false, cursor))
          if (localTs > serverTs) {
            expect(r.delta).toEqual(localDelta)
            expect(r.cursorPosition).toBe(cursor)
          } else {
            expect(r.delta).toEqual(serverDelta)
            expect(r.cursorPosition).toBe(0)
          }
        }),
      { numRuns: 100 },
    )
  })

  it('synced draft: server always wins, whatever the timestamps', () => {
    fc.assert(
      fc.property(arbitraryQuillDelta(), arbitraryQuillDelta(), ts(), ts(),
        (serverDelta, localDelta, serverTs, localTs) => {
          const r = resolveResume(encodeServerScript(serverDelta, serverTs), draft(localDelta, localTs, true))
          expect(r.delta).toEqual(serverDelta)
          expect(r.source).toBe('server')
        }),
      { numRuns: 100 },
    )
  })
})

/**
 * **Validates: Requirements 9.5**
 *
 * Property 12: Zero-data-loss round-trip — the most recently committed edit
 * is restored, whether it lives in an unsynced local draft or on the server.
 */
describe('Property 12: Zero-data-loss round-trip', () => {
  it('restored delta equals the most recently committed edit', () => {
    fc.assert(
      fc.property(arbitraryQuillDelta(), ts(), (committed, t) => {
        const old: QuillDelta = { ops: [{ insert: 'old\n' }] }
        // Newest edit is unsynced local work
        expect(resolveResume(encodeServerScript(old, t - 1000), draft(committed, t, false)).delta).toEqual(committed)
        // Newest edit is on the server (saved by any copy)
        expect(resolveResume(encodeServerScript(committed, t), draft(old, t - 1000, false)).delta).toEqual(committed)
        expect(resolveResume(encodeServerScript(committed, t), draft(old, t + 1000, true)).delta).toEqual(committed)
      }),
      { numRuns: 100 },
    )
  })
})

/**
 * **Validates: Requirements 10.5**
 *
 * Property 13: Resume determinism.
 */
describe('Property 13: Resume determinism', () => {
  it('same persisted state always produces same editor state', () => {
    fc.assert(
      fc.property(arbitrarySessionState(), arbitraryQuillDelta(), ts(), fc.boolean(),
        (local, serverDelta, serverTs, synced) => {
          const server = encodeServerScript(serverDelta, serverTs)
          const d = draft(local.delta, local.editTimestamp, synced, local.cursorPosition)
          expect(resolveResume(server, d)).toEqual(resolveResume(server, d))
        }),
      { numRuns: 100 },
    )
  })

  it('returns server delta when no local draft exists', () => {
    fc.assert(
      fc.property(arbitraryQuillDelta(), ts(), (serverDelta, serverTs) => {
        expect(resolveResume(encodeServerScript(serverDelta, serverTs), null).delta).toEqual(serverDelta)
      }),
      { numRuns: 100 },
    )
  })
})
