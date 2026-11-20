<template>
  <!-- The whole beat at a glance: sections (named), the bar grid where a tempo
       is set, where lines are placed, and the playhead. Drag or tap to move the
       beat; drag the line between two sections to move where one starts. -->
  <div class="select-none">
    <!-- Fixed height with a gap below, so the Sections button never overlaps the strip -->
    <div class="flex items-center justify-end h-8 mb-1.5">
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
        :key="h.edge"
        type="button"
        data-testid="section-boundary"
        :data-edge="h.edge"
        :aria-label="h.label"
        class="absolute top-0 bottom-0 cursor-ew-resize touch-none focus:outline-none group"
        :style="{ left: `calc(${pct(h.ms)}% - ${h.shift}px)`, width: h.width + 'px' }"
        @pointerdown.stop="grab($event, h.edge)"
        @pointermove="drag"
        @pointerup="release"
        @pointercancel="release"
        @keydown.left.prevent="nudge(h.edge, h.ms - 1000)"
        @keydown.right.prevent="nudge(h.edge, h.ms + 1000)"
      >
        <span class="absolute top-0 bottom-0 w-[3px] rounded" :style="{ left: h.shift - 1.5 + 'px', background: h.color }" />
        <span
          class="absolute top-1/2 -mt-[9px] w-[14px] h-[18px] rounded-[4px] border-2 border-slate-900 shadow group-focus-visible:ring-2 group-focus-visible:ring-violet-300"
          :class="{ 'scale-110': moving === h.edge }"
          :style="{ left: Math.min(Math.max(h.shift - 7, 0), h.width - 14) + 'px', background: h.color }"
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
  /** Dragging an edge of the selected section to `ms`. */
  'edge-move': [edge: 'start' | 'end', ms: number]
  'edge-end': [edge: 'start' | 'end']
}>()

const H = 44
const box = ref<HTMLElement>()
let press: { x: number; moved: boolean } | null = null
const moving = ref<'start' | 'end' | null>(null)


const pct = (ms: number) => (props.durationMs > 0 ? (Math.min(Math.max(ms, 0), props.durationMs) / props.durationMs) * 100 : 0)
const x = (ms: number) => pct(ms) * 10
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`
/** Only name sections wide enough to read (about 7% of the strip). */
const labelled = computed(() => props.sections.filter((s) => pct(s.endMs - s.startMs) >= 7))
/**
 * Grips on both edges of the selected section. The song's own start and end
 * can be dragged too: that makes an Intro or Outro. Keyed by edge, so the grip
 * under the finger survives the Intro appearing mid-drag. Kept inside the
 * strip at its two ends (`shift` = where the line sits inside the grip). At the
 * song's own start and end the grip is narrower (16px instead of 28), so it
 * covers little of the strip that a tap would use to jump near the start or end.
 */
const handles = computed(() => {
  const s = props.sections.find((x) => x.id === props.selectedId)
  if (!s) return []
  const edge = (e: 'start' | 'end', ms: number) => {
    const p = pct(ms)
    const width = p <= 0 || p >= 100 ? 16 : 28
    const shift = p <= 0 ? 0 : p >= 100 ? width : width / 2
    const label = e === 'start'
      ? (ms <= 0 ? `Drag to start ${s.name} later (makes an Intro)` : `Move where ${s.name} starts (now ${fmt(ms)})`)
      : (ms >= props.durationMs ? `Drag to end ${s.name} earlier (makes an Outro)` : `Move where ${s.name} ends (now ${fmt(ms)})`)
    return { edge: e, ms, shift, width, label, color: s.color }
  }
  return [edge('start', s.startMs), edge('end', s.endMs)]
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
}
function cancel() {
  press = null
}

function grab(e: PointerEvent, edge: 'start' | 'end') {
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  moving.value = edge
}
function drag(e: PointerEvent) {
  if (moving.value != null) emit('edge-move', moving.value, msAt(e))
}
function release() {
  if (moving.value == null) return
  const edge = moving.value
  moving.value = null
  emit('edge-end', edge)
}
function nudge(edge: 'start' | 'end', ms: number) {
  emit('edge-move', edge, ms)
  emit('edge-end', edge)
}
</script>
