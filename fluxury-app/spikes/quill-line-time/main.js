import { createEditor, readLines, setLineTime, moveLine, attachGutter, measureAlignment, Delta } from './quillTime.js'

const SEED = [
  ['Woke up with the beat on loop', 8720],
  ['Pen on the page, no excuses, every line I write gets proven on the loop until the sun comes up and the whole block knows the name', 13000],
  ['Clock in, clock out, still movin\'', 17000],
  ['Notebook full but the hook still missin\' and the clock keeps ticking like a drum machine in my head all night long', null],
  ['Say it twice so the whole room listen', null],
  ['One more line to scroll with', 30000],
  ['And another', null],
  ['Last line with a long tail so that it wraps on a small phone screen too', 40000],
]

export const seedContents = () => ({
  ops: SEED.flatMap(([t, ms]) => [
    { insert: t },
    ms == null ? { insert: '\n' } : { insert: '\n', attributes: { time: String(ms) } },
  ]),
})

const quill = createEditor(document.getElementById('ed'), seedContents())
const gutter = document.getElementById('gutter')
const sectionStarts = new Set([0, 3])
const render = attachGutter(quill, gutter, sectionStarts)

window.spike = {
  quill,
  render,
  Delta,
  seedContents,
  readLines: () => readLines(quill),
  setLineTime: (i, ms) => setLineTime(quill, i, ms),
  moveLine: (a, b) => moveLine(quill, a, b),
  measure: () => measureAlignment(quill, gutter),
  // Round-trip through JSON into a second, fresh editor.
  roundTrip: () => {
    const json = JSON.stringify(quill.getContents())
    const q2 = createEditor(document.getElementById('scratch'), JSON.parse(json))
    return { json, lines: readLines(q2) }
  },
}
