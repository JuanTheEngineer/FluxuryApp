/**
 * Which copy of a session's lyrics to show when it is opened.
 *
 * A session can be open in many places at once: several tabs or windows in one
 * browser (which share one local draft store) and several devices (each with
 * its own). The server copy is the shared truth. A local draft exists only to
 * hold edits that never reached the server (crash, closed tab, offline), so it
 * may override the server ONLY when it has unsynced edits that are newer than
 * the server copy. A synced draft is just a cache and never wins.
 *
 * Remaining gap (BACKLOG P0 step 2): a copy left open with stale content can
 * still save over newer work. Fixing that needs conflict detection on save.
 */
import type { LocalDraft, QuillDelta } from './localDraft'

/** Stored format of sessions/<id>/script.json. */
export interface ServerScript {
  delta: QuillDelta
  /** Epoch ms of the save. 0 = unknown (legacy file or new session). */
  editTimestamp: number
}

export interface ResumeChoice {
  delta: QuillDelta
  cursorPosition: number
  source: 'server' | 'local'
}

const EMPTY_DELTA: QuillDelta = { ops: [{ insert: '\n' }] }

function isDelta(value: unknown): value is QuillDelta {
  return !!value && typeof value === 'object' && Array.isArray((value as QuillDelta).ops)
}

export function encodeServerScript(delta: QuillDelta, editTimestamp: number): ServerScript {
  return { delta, editTimestamp }
}

/**
 * Accepts the current `{ delta, editTimestamp }` format and legacy files that
 * are a bare delta (saved before 2026-11-16, no timestamp).
 */
export function decodeServerScript(raw: unknown): ServerScript {
  if (raw && typeof raw === 'object' && isDelta((raw as ServerScript).delta)) {
    const ts = Number((raw as ServerScript).editTimestamp)
    return { delta: (raw as ServerScript).delta, editTimestamp: Number.isFinite(ts) ? ts : 0 }
  }
  if (isDelta(raw)) return { delta: raw, editTimestamp: 0 }
  return { delta: EMPTY_DELTA, editTimestamp: 0 }
}

/**
 * Drafts written before sync tracking existed have no `synced` flag. They are
 * treated as synced: lyrics have been saving reliably since 2026-11-14, and
 * letting them win is exactly the stale-copy bug this module fixes.
 */
export function hasUnsyncedEdits(draft: LocalDraft): boolean {
  return draft.synced === false
}

export function resolveResume(server: ServerScript, draft: LocalDraft | null): ResumeChoice {
  if (draft && hasUnsyncedEdits(draft) && draft.editTimestamp > server.editTimestamp) {
    return { delta: draft.delta, cursorPosition: draft.cursorPosition || 0, source: 'local' }
  }
  return { delta: server.delta, cursorPosition: 0, source: 'server' }
}
