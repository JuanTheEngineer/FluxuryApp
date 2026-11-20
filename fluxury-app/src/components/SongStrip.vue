<template>
  <!-- The whole beat at a glance: sections (named), the bar grid where a tempo
       is set, where lines are placed, and the playhead. Drag or tap to move the
       beat; drag the line between two sections to move where one starts. -->
  <div class="select-none">
    <div class="flex items-center justify-between min-h-[26px]">
      <span
        class="text-[10px] tracking-wide text-slate-400 transition-opacity duration-500"
        :class="hintSeen ? 'opacity-0' : 'opacity-100'"
        :aria-hidden="hintSeen"
      >
        drag the strip to scrub
      </span>
      <slot name="right" />
    </div>
    <div ref="box" class="relative h-11">
      <svg
        data-testid="song-strip"
        role="slider"
        tabindex="0"
        aria-label="Position in the beat"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(durationMs / 1000)"
        :aria-valuenow="Math.round(nowMs / 1000)"
        :aria-valuetext="fmt(nowMs)"
        :viewBox="`0 0 1000 ${H}`"
        preserveAspectRatio="none"
        class="absolute inset-0 block w-full h-full cursor-pointer rounded touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
        @keydown.left.prevent="emit('seek', Math.max(0, nowMs - 5000))"
        @keydown.right.prevent="emit('seek', Math.min(durationMs, nowMs + 5000))"
      >
        <rect x="0" y="0" width="1000" :height="H" fill="#111c33" />
        <rect
          v-for="s in sections"
          :key="s.id"
          data-testid="strip-section"
          :x="x(s.startMs)"
          y="0"
          :width="Math.max(0, x(s.endMs) - x(s.startMs))"
          :height="H"
          :fill="s.color"
          :opacity="s.id === currentId ? 0.34 : 0.14"
        />
        <line
          v-for="b in bars"
          :key="'g' + b"
          :x1="x(b)"
          :x2="x(b)"
          :y1="H - 7"
          :y2="H"
          stroke="#94a3b8"
          stroke-opacity="0.45"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <rect
          v-for="b in blocks"
          :key="'l' + b.line"
          :x="x(b.start)"
          y="14"
          :width="Math.max(2, x(b.end) - x(b.start))"
          :height="H - 24"
          :fill="b.color"
          :opacity="b.line === targetLine ? 1 : 0.7"
          :stroke="b.line === targetLine ? '#f8fafc' : 'none'"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          rx="1"
        />
        <rect
          v-if="windowRange"
          data-testid="strip-window"
          :x="x(windowRange[0])"
          y="0.5"
          :width="Math.max(2, x(windowRange[1]) - x(windowRange[0]))"
          :height="H - 1"
          fill="none"
          stroke="#e2e8f0"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
          rx="2"
        />
        <line
          :x1="x(nowMs)"
          :x2="x(nowMs)"
          y1="0"
          :y2="H"
          stroke="#f8fafc"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <!-- Names in HTML, not SVG: the SVG stretches to the width, text would too -->
      <span
        v-for="s in labelled"
        :key="'n' + s.id"
        class="absolute top-0.5 pointer-events-none text-[9px] font-semibold leading-none truncate"
        :style="{ left: `calc(${pct(s.startMs)}% + 3px)`, maxWidth: `calc(${pct(s.endMs - s.startMs)}% - 6px)`, color: s.color }"
      >
        {{ s.name }}
      </span>
      <!-- Boundaries of the SELECTED section only, so a tap on the strip never
           grabs one by accident. A coloured grip, unlike the white playhead. -->
      <button
        v-for="h in handles"
        :key="'h' + h.index"
        type="button"
        data-testid="section-boundary"
        :aria-label="`Move where ${sections[h.index].name} starts (now ${fmt(sections[h.index].startMs)})`"
        class="absolute top-0 bottom-0 w-7 -ml-3.5 cursor-ew-resize touch-none focus:outline-none group"
        :style="{ left: pct(sections[h.index].startMs) + '%' }"
        @pointerdown.stop="grab($event, h.index)"
        @pointermove="drag"
        @pointerup="release"
        @pointercancel="release"
        @keydown.left.prevent="nudge(h.index, -1000)"
        @keydown.right.prevent="nudge(h.index, 1000)"
      >
        <span class="absolute left-1/2 top-0 bottom-0 -ml-[1.5px] w-[3px] rounded" :style="{ background: h.color }" />
        <span
          class="absolute left-1/2 top-1/2 -ml-[7px] -mt-[9px] w-[14px] h-[18px] rounded-[4px] border-2 border-slate-900 shadow group-focus-visible:ring-2 group-focus-visible:ring-violet-300"
          :class="{ 'scale-110': moving === h.index }"
          :style="{ background: h.color }"
        >
          <span class="absolute inset-x-[3px] top-[4px] bottom-[4px] border-x border-slate-900/60" />
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Section } from '@/services/timing'

const props = defineProps<{
  durationMs: number
  nowMs: number
  sections: Section[]
  /** Bar-line times to draw (already thinned out for the width). */
  bars: number[]
  /** Placed lines in time order, each with when it ends and its line index. */
  blocks: { line: number; start: number; end: number; color: string }[]
  /** The section under the playhead, drawn brighter. */
  currentId: string | null
  /** The line Pin will place, outlined. */
  targetLine: number | null
  /** The section being edited: only its boundaries can be dragged. */
  selectedId: string | null
  /** The stretch shown in the zoomed-in view, boxed. Null when it's hidden. */
  windowRange?: [number, number] | null
}>()
const emit = defineEmits<{
  /** While scrubbing. */
  seek: [ms: number]
  /** A tap (no drag) at this time. */
  tap: [ms: number]
  'boundary-move': [index: number, ms: number]
  'boundary-end': [index: number]
}>()

const H = 44
const HINT_KEY = 'fluxury.stripHintSeen'
const box = ref<HTMLElement>()
const hintSeen = ref(readHint())
let press: { x: number; moved: boolean } | null = null
const moving = ref<number | null>(null)

function readHint() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

const pct = (ms: number) => (props.durationMs > 0 ? (Math.min(Math.max(ms, 0), props.durationMs) / props.durationMs) * 100 : 0)
const x = (ms: number) => pct(ms) * 10
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`
/** Only name sections wide enough to read (about 7% of the strip). */
const labelled = computed(() => props.sections.filter((s) => pct(s.endMs - s.startMs) >= 7))
/** Handles for where the selected section starts and where it ends (the next one starts). */
const handles = computed(() => {
  const i = props.sections.findIndex((s) => s.id === props.selectedId)
  if (i < 0) return []
  const color = props.sections[i].color
  return [i, i + 1].filter((k) => k >= 1 && k < props.sections.length).map((index) => ({ index, color }))
})

function msAt(e: PointerEvent) {
  const r = box.value!.getBoundingClientRect()
  return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * props.durationMs)
}

function down(e: PointerEvent) {
  if (!props.durationMs) return
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  press = { x: e.clientX, moved: false }
  emit('seek', msAt(e))
}
function move(e: PointerEvent) {
  if (!press) return
  if (Math.abs(e.clientX - press.x) > 6) press.moved = true
  emit('seek', msAt(e))
}
function up(e: PointerEvent) {
  if (!press) return
  const wasTap = !press.moved
  press = null
  if (wasTap) emit('tap', msAt(e))
  else markHintSeen()
}
function cancel() {
  press = null
}

function markHintSeen() {
  if (hintSeen.value) return
  hintSeen.value = true
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    // not remembered; the hint shows again next visit
  }
}

function grab(e: PointerEvent, index: number) {
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  moving.value = index
}
function drag(e: PointerEvent) {
  if (moving.value != null) emit('boundary-move', moving.value, msAt(e))
}
function release() {
  if (moving.value == null) return
  const i = moving.value
  moving.value = null
  emit('boundary-end', i)
}
function nudge(index: number, deltaMs: number) {
  emit('boundary-move', index, props.sections[index].startMs + deltaMs)
  emit('boundary-end', index)
}
</script>
