/**
 * Sections of a beat (timed lyrics, Step B): the `timing` field of script.json.
 * Pure functions only; the editor stores the result through the session store.
 * See docs/research/timed-lyrics-data-model.md.
 *
 * Rules: sections are contiguous and non-overlapping from 0 to durationMs.
 * Each has its own tempo (or none yet), beats per bar and colour. The bar grid
 * of a section starts at the section's start. At most 12 sections; a warning
 * shows above 4 tempo changes.
 */

export interface Section {
  id: string
  name: string
  startMs: number
  endMs: number
  /** Beats per minute, 40-220. Null until the writer sets it: no grid, no snapping. */
  bpm: number | null
  beatsPerBar: number
  color: string
  source: 'auto' | 'user'
}

export interface Timing {
  v: 1
  durationMs: number
  sections: Section[]
}

export const MAX_SECTIONS = 12
export const WARN_TEMPO_CHANGES = 4
export const BPM_MIN = 40
export const BPM_MAX = 220
export const BEATS_PER_BAR = [2, 3, 4, 5, 6, 7]
export const COLORS = ['#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#22c55e', '#64748b']
/** Shortest section the split allows, so a stray tap can't make a sliver. */
export const MIN_SECTION_MS = 1000

const DEFAULT_NAMES = ['Intro', 'Verse 1', 'Hook', 'Verse 2', 'Bridge', 'Verse 3', 'Outro']

let idCounter = 0
const newId = () => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`

export function emptyTiming(durationMs: number): Timing {
  return {
    v: 1,
    durationMs: Math.max(0, Math.round(durationMs)),
    sections: [],
  }
}

/** One section covering the whole beat: the starting point for splitting. */
export function wholeSong(durationMs: number): Section {
  return { id: newId(), name: 'Section 1', startMs: 0, endMs: Math.round(durationMs), bpm: null, beatsPerBar: 4, color: COLORS[0], source: 'user' }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const validBpm = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= BPM_MIN && v <= BPM_MAX ? Math.round(v * 10) / 10 : null)

/**
 * Read `timing` from a stored script. The file is user data from S3, so
 * nothing is trusted: bad sections are dropped, the rest are sorted, made
 * contiguous and fitted to the audio's real length. Returns null if absent.
 */
export function decodeTiming(raw: unknown, audioDurationMs: number): Timing | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { sections?: unknown }
  const duration = Math.round(audioDurationMs)
  if (!Array.isArray(r.sections) || duration <= 0) return null
  const sections: Section[] = []
  for (const s of r.sections as Record<string, unknown>[]) {
    if (!s || typeof s !== 'object') continue
    const startMs = Number(s.startMs)
    if (!Number.isFinite(startMs) || startMs < 0 || startMs >= duration) continue
    sections.push({
      id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newId(),
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : 'Section',
      startMs: Math.round(startMs),
      endMs: 0,
      bpm: validBpm(s.bpm),
      beatsPerBar: BEATS_PER_BAR.includes(Number(s.beatsPerBar)) ? Number(s.beatsPerBar) : 4,
      color: typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : COLORS[sections.length % COLORS.length],
      source: s.source === 'auto' ? 'auto' : 'user',
    })
    if (sections.length >= MAX_SECTIONS) break
  }
  if (sections.length === 0) return { v: 1, durationMs: duration, sections: [] }
  sections.sort((a, b) => a.startMs - b.startMs)
  sections[0].startMs = 0
  // Drop duplicates at the same start, then chain the ends.
  const unique = sections.filter((s, i) => i === 0 || s.startMs > sections[i - 1].startMs)
  unique.forEach((s, i) => (s.endMs = i + 1 < unique.length ? unique[i + 1].startMs : duration))
  return { v: 1, durationMs: duration, sections: unique }
}

export function sectionAt(t: Timing, ms: number): Section | null {
  const list = t.sections
  if (list.length === 0) return null
  const x = clamp(ms, 0, Math.max(0, t.durationMs - 1))
  return list.find((s) => x >= s.startMs && x < s.endMs) ?? list[list.length - 1]
}

/** Split the section under `atMs` into two. The new one copies its tempo. */
export function splitAt(t: Timing, atMs: number): { timing: Timing; section: Section } | { error: string } {
  if (t.sections.length === 0) {
    const whole = wholeSong(t.durationMs)
    if (atMs < MIN_SECTION_MS || t.durationMs - atMs < MIN_SECTION_MS) {
      return { timing: { ...t, sections: [whole] }, section: whole }
    }
    t = { ...t, sections: [whole] }
  }
  if (t.sections.length >= MAX_SECTIONS) return { error: `Up to ${MAX_SECTIONS} sections.` }
  const s = sectionAt(t, atMs)!
  const at = Math.round(atMs)
  if (at - s.startMs < MIN_SECTION_MS || s.endMs - at < MIN_SECTION_MS) {
    return { error: 'Move the playhead further inside a section first.' }
  }
  const i = t.sections.indexOf(s)
  const n = t.sections.length
  const added: Section = {
    ...s,
    id: newId(),
    name: DEFAULT_NAMES[n] ?? `Section ${n + 1}`,
    startMs: at,
    color: COLORS[n % COLORS.length],
    source: 'user',
  }
  const sections = [...t.sections.slice(0, i), { ...s, endMs: at }, added, ...t.sections.slice(i + 1)]
  return { timing: { ...t, sections }, section: added }
}

/** Remove a section; the one before it (or after, for the first) takes over its time. */
export function removeSection(t: Timing, id: string): Timing {
  const i = t.sections.findIndex((s) => s.id === id)
  if (i < 0) return t
  const sections = t.sections.map((s) => ({ ...s }))
  const [gone] = sections.splice(i, 1)
  if (sections.length > 0) {
    if (i > 0) sections[i - 1].endMs = gone.endMs
    else sections[0].startMs = 0
  }
  return { ...t, sections }
}

export type SectionEdit = Partial<Pick<Section, 'name' | 'bpm' | 'beatsPerBar' | 'color'>>

/** Change one section. Invalid values are ignored, not stored. */
export function updateSection(t: Timing, id: string, edit: SectionEdit): Timing {
  return {
    ...t,
    sections: t.sections.map((s) => {
      if (s.id !== id) return s
      const next = { ...s, source: 'user' as const }
      if (edit.name !== undefined && edit.name.trim()) next.name = edit.name.trim().slice(0, 40)
      if (edit.bpm !== undefined) next.bpm = edit.bpm === null ? null : validBpm(edit.bpm) ?? s.bpm
      if (edit.beatsPerBar !== undefined && BEATS_PER_BAR.includes(edit.beatsPerBar)) next.beatsPerBar = edit.beatsPerBar
      if (edit.color !== undefined && /^#[0-9a-f]{6}$/i.test(edit.color)) next.color = edit.color
      return next
    }),
  }
}

/**
 * Set one section's tempo. Most beats keep one tempo, so sections that have
 * no tempo yet take it too; a section with its own tempo (a beat switch) keeps it.
 */
export function setTempo(t: Timing, id: string, bpm: number | null): Timing {
  const v = bpm === null ? null : validBpm(bpm)
  if (bpm !== null && v === null) return t
  return {
    ...t,
    sections: t.sections.map((s) =>
      s.id === id ? { ...s, bpm: v, source: 'user' as const } : v !== null && s.bpm === null ? { ...s, bpm: v } : s,
    ),
  }
}

/**
 * Move the boundary where section `index` starts (index >= 1). It stays at
 * least MIN_SECTION_MS inside both neighbours.
 */
export function moveBoundary(t: Timing, index: number, ms: number): Timing {
  const s = t.sections
  if (index < 1 || index >= s.length) return t
  const at = Math.round(clamp(ms, s[index - 1].startMs + MIN_SECTION_MS, s[index].endMs - MIN_SECTION_MS))
  const sections = s.map((x, i) => (i === index - 1 ? { ...x, endMs: at } : i === index ? { ...x, startMs: at } : x))
  return { ...t, sections }
}

/** Bar-line times inside each section that has a tempo, for drawing the grid. */
export function barLines(t: Timing, minGapMs: number): number[] {
  const out: number[] = []
  for (const s of t.sections) {
    const b = beatMs(s)
    if (!b) continue
    const bar = b * s.beatsPerBar
    let step = bar
    while (step < minGapMs) step *= 2 // thin out on a narrow strip: every 2, 4, 8 bars
    for (let x = s.startMs + step; x < s.endMs - 1; x += step) out.push(Math.round(x))
  }
  return out
}

export function applyTempoToAll(t: Timing, fromId: string): Timing {
  const src = t.sections.find((s) => s.id === fromId)
  if (!src) return t
  return { ...t, sections: t.sections.map((s) => ({ ...s, bpm: src.bpm, beatsPerBar: src.beatsPerBar })) }
}

/** Neighbouring sections whose tempo or beats per bar differ. */
export function tempoChanges(t: Timing): number {
  return t.sections.filter((s, i) => i > 0 && (s.bpm !== t.sections[i - 1].bpm || s.beatsPerBar !== t.sections[i - 1].beatsPerBar)).length
}

const beatMs = (s: Section) => (s.bpm ? 60000 / s.bpm : null)

/**
 * Snap a time to the beat grid of its section: to the bar start if within half
 * a beat of it, otherwise to the nearest beat. Unchanged without a tempo.
 * Never leaves the section.
 */
export function snap(t: Timing, ms: number): number {
  const s = sectionAt(t, ms)
  const b = s && beatMs(s)
  if (!s || !b) return Math.round(ms)
  const bar = b * s.beatsPerBar
  const barStart = s.startMs + Math.round((ms - s.startMs) / bar) * bar
  const snapped = Math.abs(barStart - ms) < b / 2 ? barStart : s.startMs + Math.round((ms - s.startMs) / b) * b
  return Math.round(clamp(snapped, s.startMs, Math.max(s.startMs, s.endMs - 1)))
}

/** Where a time sits: its section, and (with a tempo) bar and beat inside it, from 1. */
export function positionOf(t: Timing, ms: number): { section: Section; bar: number; beat: number } | { section: Section; bar: null; beat: null } | null {
  const s = sectionAt(t, ms)
  if (!s) return null
  const b = beatMs(s)
  if (!b) return { section: s, bar: null, beat: null }
  const k = Math.max(0, Math.floor((ms - s.startMs) / b + 1e-6))
  return { section: s, bar: Math.floor(k / s.beatsPerBar) + 1, beat: (k % s.beatsPerBar) + 1 }
}

/**
 * Tempo from tap times (ms, in order). Uses the median gap, so one late tap
 * doesn't skew it. Needs 4 taps; gaps more than 2 s apart restart the count.
 */
export function tapTempo(taps: number[]): number | null {
  const recent: number[] = []
  for (const t of taps) {
    if (recent.length && t - recent[recent.length - 1] > 2000) recent.length = 0
    recent.push(t)
  }
  const last = recent.slice(-9)
  if (last.length < 4) return null
  const gaps = last.slice(1).map((t, i) => t - last[i]).sort((a, b) => a - b)
  const mid = gaps[Math.floor(gaps.length / 2)]
  const bpm = 60000 / mid
  return validBpm(bpm)
}
