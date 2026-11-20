import { describe, it, expect, beforeEach } from 'vitest'
import Quill from 'quill'
import {
  registerLineTime, attachLineTimeGuards, readLineTimes,
  setLineTime, timeOrderTarget, moveLine, playingLine, nextUnplaced, MAX_LINE_MS,
} from './lineTime'

/*
 * jsdom has no real keyboard, so Enter is simulated by applying the change
 * Quill's own Enter handler produces (a "\n" carrying the line's attributes).
 * Real key presses on Chromium (iPhone emulation) are covered by
 * tests/spike/quill-line-time.spec.ts, and Juan checked Return on his iPhone.
 */
const Delta = Quill.import('delta') as unknown as new () => {
  retain(n: number): any
}

// jsdom doesn't measure text; Quill's Undo scrolls the cursor into view with these.
if (!Range.prototype.getBoundingClientRect) {
  const rect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) })
  Range.prototype.getBoundingClientRect = rect as never
  Range.prototype.getClientRects = (() => []) as never
}

const timed = {
  ops: [
    { insert: 'Woke up with the beat on loop' },
    { insert: '\n', attributes: { time: '8720' } },
    { insert: 'Clock in, clock out' },
    { insert: '\n', attributes: { time: '17000' } },
    { insert: 'unplaced line\n' },
  ],
}

function editor() {
  registerLineTime()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const q = new Quill(el, { theme: 'snow' })
  attachLineTimeGuards(q)
  q.setContents(timed as never, 'silent')
  return q
}

/** What Quill's Enter handler applies at `index` inside a line with this time. */
const enterAt = (q: Quill, index: number, time: string) =>
  q.updateContents(new Delta().retain(index).insert('\n', { time }) as never, 'user')

let q: Quill
beforeEach(() => {
  document.body.innerHTML = ''
  q = editor()
})

describe('line times in the lyrics editor', () => {
  it('survive load and save unchanged (Quill drops unregistered attributes)', () => {
    expect(q.getContents().ops).toEqual(timed.ops)
  })

  it('Enter at the end of a timed line: the new line has no time', () => {
    enterAt(q, 'Woke up with the beat on loop'.length, '8720')
    expect(readLineTimes(q).map((l) => l.timeMs)).toEqual([8720, null, 17000, null])
  })

  it('Enter in the middle: the first half keeps the time, the second half has none', () => {
    enterAt(q, 7, '8720')
    const ls = readLineTimes(q)
    expect(ls[0]).toEqual({ text: 'Woke up', timeMs: 8720 })
    expect(ls[1]).toEqual({ text: ' with the beat on loop', timeMs: null })
  })

  it('Enter at the start: the new empty line above has no time, the text keeps it', () => {
    const start = 'Woke up with the beat on loop\n'.length
    enterAt(q, start, '17000')
    const ls = readLineTimes(q)
    expect(ls[1]).toEqual({ text: '', timeMs: null })
    expect(ls[2]).toEqual({ text: 'Clock in, clock out', timeMs: 17000 })
  })

  it('pasted lines carry no time', () => {
    q.clipboard.dangerouslyPasteHTML(q.getLength() - 1, '<p data-time="1000">pasted a</p><p data-time="2000">pasted b</p>', 'user')
    const pasted = readLineTimes(q).filter((l) => l.text.startsWith('pasted'))
    expect(pasted.length).toBeGreaterThan(0)
    for (const p of pasted) expect(p.timeMs).toBeNull()
  })

  it('formatting and typing in the classic editor keep the times', () => {
    q.formatText(0, 4, 'bold', true, 'user')
    q.insertText(4, ' still', 'user')
    expect(readLineTimes(q).map((l) => l.timeMs)).toEqual([8720, 17000, null])
  })

  it('a document without times is unaffected', () => {
    const plain = { ops: [{ insert: 'plain\nlyrics\n' }] }
    q.setContents(plain as never, 'silent')
    q.insertText(3, '\n', 'user')
    expect(q.getContents().ops).toEqual([{ insert: 'pla\nin\nlyrics\n' }])
  })
})


const L = (...ts: (number | null)[]) => ts.map((timeMs, i) => ({ text: `line ${i}`, timeMs }))

describe('timeOrderTarget: where a just-pinned line goes', () => {
  it('stays put when already in order among placed lines', () => {
    expect(timeOrderTarget(L(1000, 2000, 3000), 1)).toBe(1)
    expect(timeOrderTarget(L(1000, null, 2500, null), 2)).toBe(2) // unplaced lines between don't matter
  })
  it('a line pinned earlier than lines above it moves before the first later one', () => {
    // lines: 1000, 5000, 6000, [pinned 2000]
    expect(timeOrderTarget(L(1000, 5000, 6000, 2000), 3)).toBe(1)
  })
  it('a line pinned later than lines below it moves after the last placed line', () => {
    // [pinned 9000], 1000, unplaced, 2000, unplaced
    expect(timeOrderTarget(L(9000, 1000, null, 2000, null), 0)).toBe(4)
  })
  it('unplaced lines never force a move', () => {
    expect(timeOrderTarget(L(null, null, 4000, null), 2)).toBe(2)
  })
})

describe('playingLine', () => {
  const lines = L(1000, null, 3000, 2000)
  it('is the latest started line until the next placed one starts', () => {
    expect(playingLine(lines, 500)).toBeNull()
    expect(playingLine(lines, 1000)).toBe(0)
    expect(playingLine(lines, 2500)).toBe(3)
    expect(playingLine(lines, 3100)).toBe(2)
  })
  it('stops highlighting after MAX_LINE_MS when nothing later is placed', () => {
    expect(playingLine(lines, 3000 + MAX_LINE_MS - 1)).toBe(2)
    expect(playingLine(lines, 3000 + MAX_LINE_MS)).toBeNull()
  })
  it('is null with no placed lines', () => {
    expect(playingLine(L(null, null), 5000)).toBeNull()
  })
})

describe('nextUnplaced', () => {
  it('skips placed and empty lines', () => {
    const lines = [{ text: 'a', timeMs: 1 }, { text: '  ', timeMs: null }, { text: 'b', timeMs: null }]
    expect(nextUnplaced(lines, -1)).toBe(2)
    expect(nextUnplaced(lines, 2)).toBeNull()
  })
})

describe('pinning and moving on a real Quill', () => {
  it('pin + move into time order is one Undo, and Undo restores the document exactly', () => {
    const before = JSON.stringify(q.getContents())
    // Lines: "Woke up…" 8720, "Clock in…" 17000, "unplaced line". Pin the last at 1000.
    q.history.cutoff()
    setLineTime(q, 2, 1000)
    const to = timeOrderTarget(readLineTimes(q), 2)
    expect(to).toBe(0)
    moveLine(q, 2, to)
    q.history.cutoff()
    expect(readLineTimes(q)).toEqual([
      { text: 'unplaced line', timeMs: 1000 },
      { text: 'Woke up with the beat on loop', timeMs: 8720 },
      { text: 'Clock in, clock out', timeMs: 17000 },
    ])
    q.history.undo()
    expect(JSON.stringify(q.getContents())).toBe(before)
  })

  it('moving a line to the end keeps its text and time', () => {
    moveLine(q, 0, 3)
    expect(readLineTimes(q).at(-1)).toEqual({ text: 'Woke up with the beat on loop', timeMs: 8720 })
  })

  it('unpin clears only that line', () => {
    setLineTime(q, 0, null)
    expect(readLineTimes(q).map((l) => l.timeMs)).toEqual([null, 17000, null])
  })
})

import { followLine } from './lineTime'

describe('followLine: which line the lyrics scroll to', () => {
  const lines = L(1000, null, 3000, 2000)
  it('is the latest placed line that has started', () => {
    expect(followLine(lines, 500)).toBeNull()
    expect(followLine(lines, 2500)).toBe(3)
    expect(followLine(lines, 3000)).toBe(2)
  })
  it('stays on the last placed line once the song passes it (unlike the highlight)', () => {
    expect(followLine(lines, 3000 + MAX_LINE_MS * 5)).toBe(2)
  })
})
