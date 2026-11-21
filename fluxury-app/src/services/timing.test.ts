import { describe, it, expect } from 'vitest'
import {
  emptyTiming, decodeTiming, splitAt, removeSection, updateSection, applyTempoToAll,
  tempoChanges, sectionAt, snap, positionOf, tapTempo, MAX_SECTIONS, type Timing,
} from './timing'

const DUR = 200_000
const split = (t: Timing, ms: number) => {
  const r = splitAt(t, ms)
  if ('error' in r) throw new Error(r.error)
  return r
}
/** Contiguous from 0 to the end, no gaps or overlaps. */
const contiguous = (t: Timing) =>
  t.sections.every((s, i) => s.startMs < s.endMs && (i === 0 ? s.startMs === 0 : s.startMs === t.sections[i - 1].endMs)) &&
  t.sections[t.sections.length - 1].endMs === t.durationMs

describe('sections', () => {
  it('the first split of an empty beat makes two sections covering the song', () => {
    const { timing, section } = split(emptyTiming(DUR), 30_000)
    expect(timing.sections.map((s) => [s.startMs, s.endMs])).toEqual([[0, 30_000], [30_000, DUR]])
    expect(section.startMs).toBe(30_000)
    expect(contiguous(timing)).toBe(true)
  })

  it('adding at the very start of an empty beat makes one whole-song section', () => {
    const { timing } = split(emptyTiming(DUR), 200)
    expect(timing.sections.map((s) => [s.startMs, s.endMs])).toEqual([[0, DUR]])
  })

  it('a split copies the tempo and stays contiguous', () => {
    let t = split(emptyTiming(DUR), 30_000).timing
    t = updateSection(t, t.sections[1].id, { bpm: 111.1 })
    t = split(t, 90_000).timing
    expect(t.sections.map((s) => s.bpm)).toEqual([null, 111.1, 111.1])
    expect(contiguous(t)).toBe(true)
  })

  it('refuses slivers and more than 12 sections', () => {
    const t = split(emptyTiming(DUR), 30_000).timing
    expect(splitAt(t, 30_400)).toEqual({ error: 'Move the playhead further inside a section first.' })
    let full = t
    for (let k = 1; full.sections.length < MAX_SECTIONS; k++) full = split(full, 30_000 + k * 10_000).timing
    expect(splitAt(full, 195_000)).toEqual({ error: 'Up to 12 sections.' })
  })

  it('removing a section gives its time to the one before (or after, for the first)', () => {
    let t = split(split(emptyTiming(DUR), 30_000).timing, 90_000).timing
    const middle = t.sections[1].id
    t = removeSection(t, middle)
    expect(t.sections.map((s) => [s.startMs, s.endMs])).toEqual([[0, 90_000], [90_000, DUR]])
    t = removeSection(t, t.sections[0].id)
    expect(t.sections.map((s) => [s.startMs, s.endMs])).toEqual([[0, DUR]])
  })

  it('ignores invalid edits', () => {
    const t = split(emptyTiming(DUR), 30_000).timing
    const id = t.sections[0].id
    const e = updateSection(t, id, { bpm: 999, beatsPerBar: 9, color: 'red', name: '   ' })
    expect(e.sections[0]).toMatchObject({ bpm: null, beatsPerBar: 4, color: t.sections[0].color, name: t.sections[0].name })
  })

  it('apply tempo to all, and counts tempo changes between neighbours', () => {
    let t = split(split(emptyTiming(DUR), 30_000).timing, 90_000).timing
    t = updateSection(t, t.sections[2].id, { bpm: 140 })
    expect(tempoChanges(t)).toBe(1)
    t = applyTempoToAll(t, t.sections[2].id)
    expect(t.sections.map((s) => s.bpm)).toEqual([140, 140, 140])
    expect(tempoChanges(t)).toBe(0)
  })
})

describe('snapping and position', () => {
  // One section at 120 BPM: a beat every 500 ms, a bar every 2000 ms, from 10 s.
  let t = split(emptyTiming(DUR), 10_000).timing
  t = updateSection(t, t.sections[1].id, { bpm: 120 })

  it('snaps to the bar start within half a beat, otherwise to the nearest beat', () => {
    expect(snap(t, 12_200)).toBe(12_000) // 200 ms after bar 2: bar start
    expect(snap(t, 12_300)).toBe(12_500) // past half a beat: nearest beat
    expect(snap(t, 13_100)).toBe(13_000)
  })

  it('does not snap without a tempo, and never leaves the section', () => {
    expect(snap(t, 4321)).toBe(4321) // Section 1 has no tempo
    expect(snap(t, 10_100)).toBe(10_000)
  })

  it('reports bar and beat inside the section, counted from 1', () => {
    expect(positionOf(t, 10_000)).toMatchObject({ bar: 1, beat: 1 })
    expect(positionOf(t, 12_600)).toMatchObject({ bar: 2, beat: 2 })
    expect(positionOf(t, 5000)).toMatchObject({ bar: null })
  })

  it('a beat switch: each section snaps to its own tempo', () => {
    let s = split(t, 100_000).timing
    s = updateSection(s, s.sections[2].id, { bpm: 140 })
    const beat140 = 60000 / 140
    expect(snap(s, 100_000 + beat140 * 3 + 30)).toBe(Math.round(100_000 + beat140 * 3))
    expect(sectionAt(s, 99_999)!.bpm).toBe(120)
  })
})

describe('tap tempo', () => {
  const taps = (gap: number, n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i * gap)
  it('needs 4 taps, and reads the median gap', () => {
    expect(tapTempo(taps(500, 3))).toBeNull()
    expect(tapTempo(taps(500, 4))).toBe(120)
    expect(tapTempo([0, 540, 1080, 1700, 2160])).toBeCloseTo(111.1, 1) // one late tap
  })
  it('a pause over 2 s starts a new count', () => {
    expect(tapTempo([...taps(400, 4), ...taps(600, 3, 10_000)])).toBeNull()
    expect(tapTempo([...taps(400, 4), ...taps(600, 4, 10_000)])).toBe(100)
  })
})

describe('decodeTiming: stored data is not trusted', () => {
  it('returns null without timing', () => {
    expect(decodeTiming(undefined, DUR)).toBeNull()
    expect(decodeTiming({ sections: 'x' }, DUR)).toBeNull()
  })
  it('sorts, drops junk, chains ends and fits the audio length', () => {
    const t = decodeTiming(
      {
        sections: [
          { id: 'b', name: 'Hook', startMs: 60_000, bpm: 90, beatsPerBar: 4, color: '#f59e0b' },
          { id: 'a', name: 'Verse', startMs: 5000, bpm: 'fast', beatsPerBar: 11, color: 'javascript:x' },
          { startMs: -1 },
          { startMs: 999_999 },
          null,
        ],
      },
      DUR,
    )!
    expect(t.sections.map((s) => [s.id, s.startMs, s.endMs, s.bpm, s.beatsPerBar])).toEqual([
      ['a', 0, 60_000, null, 4],
      ['b', 60_000, DUR, 90, 4],
    ])
    expect(t.sections[0].color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(contiguous(t)).toBe(true)
  })
})

import { setTempo, moveBoundary, barLines, MIN_SECTION_MS } from './timing'

describe('tempo is set once for the song', () => {
  const three = () => split(split(emptyTiming(DUR), 30_000).timing, 90_000).timing

  it('setting one section fills every section without a tempo', () => {
    const t = setTempo(three(), three().sections[0].id, 111.1)
    expect(t.sections.map((s) => s.bpm)).toEqual([111.1, 111.1, 111.1])
  })

  it('a section with its own tempo (a beat switch) keeps it', () => {
    let t = three()
    t = setTempo(t, t.sections[2].id, 140) // all three get 140
    t = setTempo(t, t.sections[0].id, 90) // only the first changes now
    expect(t.sections.map((s) => s.bpm)).toEqual([90, 140, 140])
  })

  it('clearing a tempo clears only that section, and bad values are ignored', () => {
    let t = setTempo(three(), three().sections[0].id, 100)
    t = setTempo(t, t.sections[1].id, null)
    expect(t.sections.map((s) => s.bpm)).toEqual([100, null, 100])
    expect(setTempo(t, t.sections[0].id, 9999)).toBe(t)
  })
})

describe('moving a section boundary', () => {
  const t = split(split(emptyTiming(DUR), 30_000).timing, 90_000).timing
  it('moves where a section starts, and the one before ends there', () => {
    const m = moveBoundary(t, 1, 40_000)
    expect(m.sections.map((s) => [s.startMs, s.endMs])).toEqual([[0, 40_000], [40_000, 90_000], [90_000, DUR]])
  })
  it('stops short of the neighbours', () => {
    expect(moveBoundary(t, 1, 0).sections[1].startMs).toBe(MIN_SECTION_MS)
    expect(moveBoundary(t, 1, 99_000).sections[1].startMs).toBe(90_000 - MIN_SECTION_MS)
  })
  it('ignores the start of the song and unknown indexes', () => {
    expect(moveBoundary(t, 0, 5000)).toBe(t)
    expect(moveBoundary(t, 7, 5000)).toBe(t)
  })
})

describe('bar lines for the strip', () => {
  let t = split(emptyTiming(DUR), 10_000).timing
  t = setTempo(t, t.sections[1].id, 120) // bars every 2 s, both sections
  it('draws bars inside sections with a tempo', () => {
    const b = barLines(t, 0)
    expect(b.slice(0, 3)).toEqual([2000, 4000, 6000]) // section 1 from 0
    expect(b).toContain(12_000) // section 2 from 10 s
    expect(b).not.toContain(10_000) // the section line itself is drawn separately
  })
  it('thins out to every 2, 4, 8 bars when bars would be too close', () => {
    const b = barLines(t, 5000)
    expect(b.slice(0, 2)).toEqual([8000, 18_000]) // every 4 bars (8 s) in each section
  })
})

import { zoomWindow, gridTicks } from './timing'

describe('zoomed-in view', () => {
  let t = split(emptyTiming(DUR), 10_000).timing
  t = setTempo(t, t.sections[1].id, 120) // bars of 2 s in both sections
  t = { ...t, sections: t.sections.map((s, i) => (i === 1 ? { ...s, name: 'Verse 1' } : s)) }

  it('shows 4 bars with the playhead’s bar in the middle (a line on a bar start is centred)', () => {
    expect(zoomWindow(t, 14_000)).toEqual([10_000, 18_000]) // 14 s is exactly the middle
    expect(zoomWindow(t, 15_900)).toEqual([10_000, 18_000]) // steps by bars, doesn't slide
    expect(zoomWindow(t, 16_100)).toEqual([12_000, 20_000])
  })

  it('never starts before 0 or runs past the end', () => {
    expect(zoomWindow(t, 300)[0]).toBe(0)
    expect(zoomWindow(t, DUR - 100)[1]).toBe(DUR)
  })

  it('without a tempo: 8 seconds, stepping every 2', () => {
    const plain = emptyTiming(DUR)
    expect(zoomWindow(plain, 9_500)).toEqual([4000, 12_000])
  })

  it('ticks: beats, bar lines with labels, and the section name at its first bar', () => {
    const ticks = gridTicks(t, 10_000, 14_000)
    expect(ticks.map((k) => k.ms)).toEqual([10_000, 10_500, 11_000, 11_500, 12_000, 12_500, 13_000, 13_500])
    expect(ticks.filter((k) => k.major).map((k) => k.label)).toEqual(['Verse 1', '2']) // no repeated "bar"
  })

  it('ticks follow each section’s own tempo across a beat switch', () => {
    let s = split(t, 20_000).timing
    s = setTempo(s, s.sections[2].id, 60) // a beat every second after 20 s
    const ticks = gridTicks(s, 19_000, 22_000)
    expect(ticks.map((k) => k.ms)).toEqual([19_000, 19_500, 20_000, 21_000])
  })

  it('zoom levels: 1 bar steps by beats, 16 bars steps by bars; both keep the playhead centred', () => {
    expect(zoomWindow(t, 14_000, 1)).toEqual([13_000, 15_000]) // a beat is 500 ms: 14 s in the middle
    expect(zoomWindow(t, 14_200, 1)).toEqual([13_000, 15_000])
    expect(zoomWindow(t, 14_600, 1)).toEqual([13_500, 15_500])
    expect(zoomWindow(t, 40_000, 16)).toEqual([24_000, 56_000])
    expect(zoomWindow(t, 41_000, 16)).toEqual([24_000, 56_000])
  })

  it('zoomed out: labels thin to every few bars and beat ticks go', () => {
    const ticks = gridTicks(t, 24_000, 56_000) // 16 bars of Verse 1 (bars 8-23)
    expect(ticks.every((k) => k.major)).toBe(true)
    expect(ticks.filter((k) => k.label).map((k) => k.label)).toEqual(['9', '13', '17', '21'])
  })

  it('without a tempo: a tick every second, labelled every 2', () => {
    const ticks = gridTicks(emptyTiming(DUR), 6000, 9000)
    expect(ticks.map((k) => [k.ms, k.label])).toEqual([[6000, '0:06'], [7000, null], [8000, '0:08']])
  })
})

import { withIntro, withOutro, QUIET_COLOR } from './timing'

describe('Intro and Outro by dragging the song’s edges', () => {
  it('dragging the first section’s start makes a grey Intro before it, same tempo', () => {
    const base = split(emptyTiming(DUR), 60_000).timing
    const t = setTempo(base, base.sections[0].id, 90)
    const first = t.sections[0]
    const w = withIntro(t, 12_000)
    expect(w.sections.map((s) => [s.name, s.startMs, s.endMs])).toEqual([['Intro', 0, 12_000], [first.name, 12_000, 60_000], [t.sections[1].name, 60_000, DUR]])
    expect(w.sections[0]).toMatchObject({ color: QUIET_COLOR, bpm: 90 })
    expect(w.sections[1].id).toBe(first.id)
    expect(contiguous(w)).toBe(true)
  })
  it('dragging the last section’s end makes an Outro after it', () => {
    const t = split(emptyTiming(DUR), 60_000).timing
    const w = withOutro(t, 180_000)
    expect(w.sections.map((s) => [s.name, s.startMs, s.endMs]).at(-1)).toEqual(['Outro', 180_000, DUR])
    expect(w.sections.at(-2)!.endMs).toBe(180_000)
    expect(contiguous(w)).toBe(true)
  })
  it('a tiny drag, or 12 sections already, changes nothing', () => {
    const t = split(emptyTiming(DUR), 60_000).timing
    expect(withIntro(t, 400)).toBe(t)
    expect(withOutro(t, DUR - 400)).toBe(t)
    let full = t
    for (let k = 1; full.sections.length < MAX_SECTIONS; k++) full = split(full, 60_000 + k * 10_000).timing
    expect(withIntro(full, 12_000)).toBe(full)
  })
  it('never squeezes the section below a second', () => {
    const t = split(emptyTiming(DUR), 60_000).timing
    expect(withIntro(t, 59_900).sections[1].startMs).toBe(60_000 - MIN_SECTION_MS)
  })
})

describe('Intro and Outro are special: one of each, always at the song’s ends', () => {
  const base = () => split(emptyTiming(DUR), 60_000).timing // two ordinary sections
  const shape = (t: Timing) => t.sections.map((s) => [s.name, s.kind ?? '-', s.startMs, s.endMs])

  it('a second Intro can’t be made: dragging the Intro’s own start changes nothing', () => {
    const t = withIntro(base(), 10_000)
    expect(t.sections[0].kind).toBe('intro')
    expect(withIntro(t, 5000)).toBe(t)
    const o = withOutro(t, 190_000)
    expect(withOutro(o, 180_000)).toBe(o)
    expect(o.sections.filter((s) => s.kind).map((s) => s.kind)).toEqual(['intro', 'outro'])
  })

  it('new sections are never named Intro or Outro, however many there are', () => {
    let t = base()
    for (let k = 1; t.sections.length < MAX_SECTIONS; k++) t = split(t, 60_000 + k * 10_000).timing
    expect(t.sections.map((s) => s.name)).not.toContain('Intro')
    expect(t.sections.map((s) => s.name)).not.toContain('Outro')
  })

  it('splitting the Intro keeps the Intro first; splitting the Outro keeps the Outro last', () => {
    const t = withOutro(withIntro(base(), 20_000), 160_000)
    const a = split(t, 8000)
    expect(shape(a.timing).slice(0, 2)).toEqual([['Intro', 'intro', 0, 8000], [a.section.name, '-', 8000, 20_000]])
    const b = split(t, 180_000)
    expect(shape(b.timing).slice(-2)).toEqual([[b.section.name, '-', 160_000, 180_000], ['Outro', 'outro', 180_000, DUR]])
    expect(contiguous(a.timing) && contiguous(b.timing)).toBe(true)
  })

  it('the Intro can be removed, and the next section takes the start of the song', () => {
    const t = withIntro(base(), 20_000)
    const r = removeSection(t, t.sections[0].id)
    expect(shape(r)[0]).toEqual([t.sections[1].name, '-', 0, 60_000])
    expect(withIntro(r, 10_000).sections[0].kind).toBe('intro') // and a new one can be made again
  })

  it('removing a verse next to the Intro gives its time to the ordinary neighbour, not the Intro', () => {
    const t = split(withIntro(base(), 20_000), 40_000).timing // Intro 0-20, A 20-40, B 40-60, C 60-200
    const r = removeSection(t, t.sections[1].id)
    expect(shape(r).slice(0, 2)).toEqual([['Intro', 'intro', 0, 20_000], [t.sections[2].name, '-', 20_000, 60_000]])
  })

  it('stored files: kind is kept only for the first/last section; old files are read by name; doubled Intros are merged', () => {
    const t = decodeTiming(
      {
        sections: [
          { id: 'a', name: 'Intro', startMs: 0 },
          { id: 'b', name: 'Intro', startMs: 8000 }, // the accidental second Intro
          { id: 'c', name: 'Verse 1', startMs: 20_000, kind: 'intro' }, // not first: ignored
          { id: 'd', name: 'Outro', startMs: 180_000 },
        ],
      },
      DUR,
    )!
    expect(shape(t)).toEqual([['Intro', 'intro', 0, 20_000], ['Verse 1', '-', 20_000, 180_000], ['Outro', 'outro', 180_000, DUR]])
  })
})
