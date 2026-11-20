import { describe, it, expect, beforeEach } from 'vitest'
import Quill from 'quill'
import { registerLineTime, attachLineTimeGuards, readLineTimes } from './lineTime'

/*
 * jsdom has no real keyboard, so Enter is simulated by applying the change
 * Quill's own Enter handler produces (a "\n" carrying the line's attributes).
 * Real key presses on Chromium (iPhone emulation) are covered by
 * tests/spike/quill-line-time.spec.ts, and Juan checked Return on his iPhone.
 */
const Delta = Quill.import('delta') as unknown as new () => {
  retain(n: number): any
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
