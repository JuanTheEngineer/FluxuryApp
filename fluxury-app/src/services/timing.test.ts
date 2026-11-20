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
