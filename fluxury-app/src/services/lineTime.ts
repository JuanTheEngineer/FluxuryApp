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
