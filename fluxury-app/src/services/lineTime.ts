/**
 * Per-line times in the lyrics document (timed lyrics, Step 0).
 *
 * A placed line carries a `time` attribute (whole milliseconds, as a string) on
 * its trailing newline: {insert: "\n", attributes: {time: "8720"}}.
 * Both editors must register it: Quill silently drops attributes it doesn't
 * know, so an editor without it would erase every time on the next autosave.
 * See docs/research/timed-lyrics-data-model.md.
 */
import Quill from 'quill'

export const LINE_TIME = 'time'

type Op = { insert?: unknown; retain?: unknown; delete?: number; attributes?: Record<string, unknown> }
type DeltaLike = { ops: Op[] }

let registered = false

/** Register the `time` line attribute with Quill. Safe to call more than once. */
export function registerLineTime(): void {
  if (registered) return
  // Quill 2 exposes Parchment through Quill.import; its types are loose there.
  const Parchment = Quill.import('parchment') as unknown as {
    Attributor: new (name: string, key: string, opts: { scope: number }) => unknown
    Scope: { BLOCK: number }
  }
  const attr = new Parchment.Attributor(LINE_TIME, 'data-time', { scope: Parchment.Scope.BLOCK })
  Quill.register(attr as never, true)
  registered = true
}

/**
 * Keep each time on exactly one line:
 * - Enter: Quill copies the line's attributes to the new line. Remove the copy.
 *   Enter is recognised from the change itself, not from key events, because
 *   phone keyboards do not always send them.
 * - Paste: pasted lines carry no placement.
 */
export function attachLineTimeGuards(quill: Quill): void {
  quill.clipboard.addMatcher(Node.ELEMENT_NODE, (_node: Node, delta: DeltaLike) => {
    for (const op of delta.ops) {
      if (op.attributes && LINE_TIME in op.attributes) delete op.attributes[LINE_TIME]
    }
    return delta as never
  })
  quill.on('text-change', (delta: DeltaLike, _old: unknown, source: string) => {
    if (source === 'user') clearCopiedTime(quill, delta)
  })
}

/**
 * Enter looks like: one inserted "\n" carrying a time, with the very next line
 * holding the same time. The second test keeps Undo (which re-inserts a deleted
 * timed line in the same shape) from being mistaken for Enter.
 */
function clearCopiedTime(quill: Quill, delta: DeltaLike): void {
  const inserts = delta.ops.filter((o) => typeof o.insert === 'string')
  if (inserts.length !== 1) return
  const time = inserts[0].attributes?.[LINE_TIME]
  if (inserts[0].insert !== '\n' || time == null) return

  let index = 0
  for (const op of delta.ops) {
    if (op === inserts[0]) break
    if (typeof op.retain === 'number') index += op.retain
    else if (op.retain != null) index += 1
  }
  const [line, offsetInLine] = quill.getLine(index)
  const [next] = quill.getLine(index + 1)
  if (!line || !next || next.domNode.getAttribute('data-time') !== String(time)) return

  // Enter at the very start of a timed line: the new empty line above must not take the time.
  const emptyAbove = offsetInLine === 0 && !!line.next && line.next.length() > 1
  quill.formatLine(emptyAbove ? index - offsetInLine : index + 1, 1, LINE_TIME, false, 'user')
}

/** Each line's text and time, in document order. */
export function readLineTimes(quill: Quill): { text: string; timeMs: number | null }[] {
  return quill.getLines().map((line) => {
    const t = (line.domNode as HTMLElement).getAttribute('data-time')
    return { text: line.domNode.textContent ?? '', timeMs: t == null ? null : Number(t) }
  })
}

/** Set (or with null, clear) the time of line `lineIdx`, as an undoable user edit. */
export function setLineTime(quill: Quill, lineIdx: number, ms: number | null): void {
  const line = quill.getLines()[lineIdx]
  if (!line) return
  const value = ms == null ? false : String(Math.round(ms))
  quill.formatLine(quill.getIndex(line), 1, LINE_TIME, value, 'user')
}

/**
 * Where a just-placed line belongs so placed lines stay in time order: the
 * index to insert it before. Unplaced lines are left where they were typed, so
 * only placed lines are compared.
 */
export function timeOrderTarget(lines: { timeMs: number | null }[], from: number): number {
  const t = lines[from].timeMs
  if (t == null) return from
  const placed = lines.map((l, i) => ({ i, t: l.timeMs })).filter((p) => p.i !== from && p.t != null) as {
    i: number
    t: number
  }[]
  const prev = [...placed].reverse().find((p) => p.i < from)
  const next = placed.find((p) => p.i > from)
  // Already in order among the placed lines: don't move it.
  if ((!prev || prev.t <= t) && (!next || t <= next.t)) return from
  const firstLater = placed.find((p) => p.t > t)
  return firstLater ? firstLater.i : placed[placed.length - 1].i + 1
}

/**
 * Move line `from` so it sits before the line currently at `to` (`to` may be
 * the line count, meaning the end). Text, formatting and time travel together.
 * Source 'api': a moved timed newline must not be mistaken for an Enter copy.
 * Not 'silent', so Quill's history records it and Undo reverses it.
 */
export function moveLine(quill: Quill, from: number, to: number): void {
  const lines = quill.getLines()
  if (to === from || to === from + 1 || !lines[from]) return
  const Delta = Quill.import('delta') as unknown as new (ops?: unknown[]) => {
    retain(n: number): any
  }
  const a = quill.getIndex(lines[from])
  const len = lines[from].length()
  const b = to >= lines.length ? quill.getLength() : quill.getIndex(lines[to])
  const seg = new Delta(quill.getContents(a, len).ops)
  const change =
    b < a
      ? new Delta().retain(b).concat(seg).retain(a - b).delete(len)
      : new Delta().retain(a).delete(len).retain(b - a - len).concat(seg)
  quill.updateContents(change, 'api')
}

/** How long a line stays highlighted at most when no later line is placed. */
export const MAX_LINE_MS = 8000

/**
 * The line being played at `nowMs`: the latest placed line that has started,
 * until the next placed line starts (or MAX_LINE_MS passes). Null if none.
 */
export function playingLine(lines: { timeMs: number | null }[], nowMs: number): number | null {
  let best: number | null = null
  let bestT = -Infinity
  let nextT = Infinity
  lines.forEach((l, i) => {
    if (l.timeMs == null) return
    if (l.timeMs <= nowMs && l.timeMs >= bestT) {
      best = i
      bestT = l.timeMs
    }
  })
  if (best == null) return null
  for (const l of lines) if (l.timeMs != null && l.timeMs > bestT && l.timeMs < nextT) nextT = l.timeMs
  return nowMs < Math.min(nextT, bestT + MAX_LINE_MS) ? best : null
}

/** The first unplaced, non-empty line after `from`, or null. */
export function nextUnplaced(lines: { text: string; timeMs: number | null }[], from: number): number | null {
  for (let i = from + 1; i < lines.length; i++) if (lines[i].timeMs == null && lines[i].text.trim()) return i
  return null
}

/**
 * The line the lyrics should follow at `nowMs`: the latest placed line that
 * has started. It stays on the last placed line once the song passes it.
 * Null before the first placed line.
 */
export function followLine(lines: { timeMs: number | null }[], nowMs: number): number | null {
  let best: number | null = null
  let bestT = -Infinity
  lines.forEach((l, i) => {
    if (l.timeMs != null && l.timeMs <= nowMs && l.timeMs >= bestT) {
      best = i
      bestT = l.timeMs
    }
  })
  return best
}
