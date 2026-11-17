import { describe, it, expect } from 'vitest'
import type { LocalDraft, QuillDelta } from './localDraft'
import { decodeServerScript, encodeServerScript, resolveResume } from './resume'

const d = (text: string): QuillDelta => ({ ops: [{ insert: `${text}\n` }] })

function draft(text: string, editTimestamp: number, synced?: boolean): LocalDraft {
  return {
    sessionId: 's1', delta: d(text), editTimestamp, cursorPosition: 7,
    beatPlaybackPosition: 0, beatVolume: 0.8, beatLooping: false,
    ...(synced === undefined ? {} : { synced }),
  }
}

describe('resolveResume', () => {
  const server = encodeServerScript(d('server'), 2000)

  it('uses the server when there is no local draft', () => {
    expect(resolveResume(server, null)).toEqual({ delta: d('server'), cursorPosition: 0, source: 'server' })
  })

  it('uses unsynced local edits that are newer than the server (crash / offline / closed tab)', () => {
    const r = resolveResume(server, draft('local', 3000, false))
    expect(r).toEqual({ delta: d('local'), cursorPosition: 7, source: 'local' })
  })

  it('uses the server when another copy saved after this copy\'s unsynced edits', () => {
    expect(resolveResume(server, draft('stale', 1000, false)).source).toBe('server')
  })

  it('never lets a synced draft override the server, however new it is', () => {
    // The bug: this device saved Monday, another copy saved Tuesday, this
    // device reopens Wednesday. Its draft is newer than nothing, but synced.
    expect(resolveResume(server, draft('monday', 9_999_999, true)).source).toBe('server')
  })

  it('treats legacy drafts (no synced flag) as synced', () => {
    expect(resolveResume(server, draft('legacy', 9_999_999)).source).toBe('server')
  })

  it('server wins a timestamp tie', () => {
    expect(resolveResume(server, draft('tie', 2000, false)).source).toBe('server')
  })

  it('a legacy server file (no timestamp) still loses to genuinely unsynced edits', () => {
    const legacy = decodeServerScript(d('legacy server'))
    expect(resolveResume(legacy, draft('unsynced', 1, false)).source).toBe('local')
  })
})

describe('decodeServerScript', () => {
  it('reads the current { delta, editTimestamp } format', () => {
    expect(decodeServerScript({ delta: d('x'), editTimestamp: 42 })).toEqual({ delta: d('x'), editTimestamp: 42 })
  })

  it('reads legacy bare-delta files with timestamp 0', () => {
    expect(decodeServerScript(d('x'))).toEqual({ delta: d('x'), editTimestamp: 0 })
  })

  it('falls back to an empty document for missing or malformed content', () => {
    for (const raw of [null, undefined, '', 'nope', {}, { delta: 'nope' }]) {
      expect(decodeServerScript(raw)).toEqual({ delta: { ops: [{ insert: '\n' }] }, editTimestamp: 0 })
    }
  })

  it('round-trips through encode', () => {
    expect(decodeServerScript(encodeServerScript(d('x'), 5))).toEqual({ delta: d('x'), editTimestamp: 5 })
  })
})
