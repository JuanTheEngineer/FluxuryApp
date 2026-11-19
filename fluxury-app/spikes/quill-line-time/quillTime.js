// SPIKE (throwaway): can Quill carry a per-line time and keep a line-by-line UI aligned?
// Not wired into the app. See docs/research/lyrics-on-the-timeline.md.
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

const Parchment = Quill.import('parchment')
const Delta = Quill.import('delta')

// A block-level attribute. It is stored on each line's trailing "\n" in the delta,
// as {insert: "\n", attributes: {time: "12345"}} (milliseconds, as a string).
const TimeAttr = new Parchment.Attributor('time', 'data-time', { scope: Parchment.Scope.BLOCK })
Quill.register(TimeAttr, true)

export function createEditor(el, contents) {
  const quill = new Quill(el, { theme: 'snow', modules: { toolbar: false } })
  if (contents) quill.setContents(contents, 'silent')
  quill.history.clear()
  // Pasted or dragged-in HTML may carry data-time: drop it, a pasted line has no placement.
  quill.clipboard.addMatcher(Node.ELEMENT_NODE, (_node, d) => {
    d.ops.forEach((op) => {
      if (op.attributes && op.attributes.time) delete op.attributes.time
    })
    return d
  })
  quill.on('text-change', (delta, _old, source) => {
    if (source === 'user') fixCopiedTimes(quill, delta)
  })
  return quill
}

// Quill copies a line's attributes to the new line on Enter. A time must belong to exactly one
// line, so remove the copy. Enter is recognised from the change itself, not from key events,
// because phone keyboards do not always send them: one inserted "\n" that carries a time, with the
// very next line holding the same time. That second test keeps Undo (which re-inserts deleted
// timed lines as the same shape) from being mistaken for Enter.
function fixCopiedTimes(quill, delta) {
  let index = 0
  let enterAt = null
  const inserts = delta.ops.filter((o) => typeof o.insert === 'string')
  for (const op of delta.ops) {
    if (op.retain != null) index += typeof op.retain === 'number' ? op.retain : 1
    else if (typeof op.insert === 'string') {
      if (inserts.length === 1 && op.insert === '\n' && op.attributes && op.attributes.time) enterAt = index
      index += op.insert.length
    }
  }
  if (enterAt == null) return
  const [line, offsetInLine] = quill.getLine(enterAt)
  const [next] = quill.getLine(enterAt + 1)
  if (!next || next.domNode.getAttribute('data-time') !== String(inserts[0].attributes.time)) return
  const lineStart = enterAt - offsetInLine
  const emptyAbove = offsetInLine === 0 && line.next && line.next.length() > 1
  // Enter at the very start of a timed line: the new empty line above must not take the time.
  quill.formatLine(emptyAbove ? lineStart : enterAt + 1, 1, 'time', false, 'user')
}

export function readLines(quill) {
  return quill.getLines().map((line) => {
    const t = line.domNode.getAttribute('data-time')
    return { text: line.domNode.textContent, timeMs: t == null ? null : Number(t) }
  })
}

export function setLineTime(quill, lineIdx, ms) {
  const line = quill.getLines()[lineIdx]
  quill.formatLine(quill.getIndex(line), 1, 'time', ms == null ? false : String(ms), 'user')
}

// Move line `from` so it sits before the line currently at `to` (to may equal line count = end).
export function moveLine(quill, from, to) {
  const lines = quill.getLines()
  const a = quill.getIndex(lines[from])
  const len = lines[from].length()
  const b = to >= lines.length ? quill.getLength() : quill.getIndex(lines[to])
  if (to === from || to === from + 1) return
  const seg = new Delta(quill.getContents(a, len).ops)
  // Delta#concat returns a new Delta, so each step must be reassigned.
  const d =
    b < a
      ? new Delta().retain(b).concat(seg).retain(a - b).delete(len)
      : new Delta().retain(a).delete(len).retain(b - a - len).concat(seg)
  // 'api', not 'user': a moved line's newline carries a time and must not be mistaken for an Enter copy.
  quill.updateContents(d, 'api')
}

// Side column: one mark per timed line, plus a heading in extra space above section starts.
// Marks are placed from each line's real on-screen box, so wrapped lines and scrolling stay aligned.
export function attachGutter(quill, gutterEl, sectionStarts) {
  const HEADING_SPACE = 28
  const render = () => {
    const lines = quill.getLines()
    lines.forEach((line, i) => {
      line.domNode.style.marginTop = sectionStarts.has(i) ? HEADING_SPACE + 'px' : ''
    })
    const base = gutterEl.getBoundingClientRect()
    gutterEl.innerHTML = ''
    lines.forEach((line, i) => {
      const r = line.domNode.getBoundingClientRect()
      if (sectionStarts.has(i)) {
        const h = document.createElement('div')
        h.className = 'heading'
        h.dataset.line = String(i)
        h.textContent = 'SECTION'
        h.style.cssText = `position:absolute;left:0;height:${HEADING_SPACE}px;top:${r.top - base.top - HEADING_SPACE}px`
        gutterEl.appendChild(h)
      }
      if (line.domNode.getAttribute('data-time') != null) {
        const m = document.createElement('div')
        m.className = 'mark'
        m.dataset.line = String(i)
        m.style.cssText = `position:absolute;left:0;height:6px;width:6px;border-radius:3px;background:#8b5cf6;top:${r.top - base.top + 6}px`
        gutterEl.appendChild(m)
      }
    })
  }
  quill.on('text-change', render)
  quill.root.addEventListener('scroll', render)
  window.addEventListener('resize', render)
  new ResizeObserver(render).observe(quill.root)
  render()
  return render
}

// Offsets (px) between each mark/heading and its line, measured in the browser.
export function measureAlignment(quill, gutterEl, headingSpace = 28) {
  const lines = quill.getLines()
  const out = { marks: [], headings: [] }
  gutterEl.querySelectorAll('.mark').forEach((m) => {
    const line = lines[Number(m.dataset.line)].domNode
    out.marks.push(Math.abs(m.getBoundingClientRect().top - 6 - line.getBoundingClientRect().top))
  })
  gutterEl.querySelectorAll('.heading').forEach((h) => {
    const i = Number(h.dataset.line)
    const hb = h.getBoundingClientRect()
    const line = lines[i].domNode.getBoundingClientRect()
    const prev = i > 0 ? lines[i - 1].domNode.getBoundingClientRect() : null
    out.headings.push({
      gapToLine: Math.abs(hb.bottom - line.top),
      overlapsPrev: prev ? hb.top < prev.bottom - 1 : false,
    })
  })
  return out
}

export { Delta }
