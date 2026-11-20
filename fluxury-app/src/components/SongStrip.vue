<template>
  <!-- The whole beat at a glance: section colours, where lines are placed,
       and the playhead. Drag or tap anywhere to move the beat there. -->
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
    <svg
      ref="svg"
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
      class="block w-full h-11 cursor-pointer rounded touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @keydown.left.prevent="emit('seek', Math.max(0, nowMs - 5000))"
      @keydown.right.prevent="emit('seek', Math.min(durationMs, nowMs + 5000))"
    >
      <rect x="0" y="0" width="1000" :height="H" fill="#111c33" />
      <rect
        v-for="s in sections"
        :key="s.id"
        :x="x(s.startMs)"
        y="0"
        :width="Math.max(0, x(s.endMs) - x(s.startMs))"
        :height="H"
        :fill="s.color"
        opacity="0.18"
      />
      <line
        v-for="s in sections.slice(1)"
        :key="'b' + s.id"
        :x1="x(s.startMs)"
        :x2="x(s.startMs)"
        y1="0"
        :y2="H"
        stroke="#475569"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <rect
        v-for="(b, i) in blocks"
        :key="'l' + i"
        :x="x(b.start)"
        y="8"
        :width="Math.max(2, x(b.end) - x(b.start))"
        :height="H - 16"
        :fill="b.color"
        opacity="0.75"
        rx="1"
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Section } from '@/services/timing'

const props = defineProps<{
  durationMs: number
  nowMs: number
  sections: Section[]
  /** Placed lines in time order, each with when it ends (the next placed line, capped). */
  blocks: { start: number; end: number; color: string }[]
}>()
const emit = defineEmits<{ seek: [ms: number] }>()

const H = 44
const HINT_KEY = 'fluxury.stripHintSeen'
const svg = ref<SVGSVGElement>()
const dragging = ref(false)
const hintSeen = ref(readHint())

function readHint() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

const x = (ms: number) => (props.durationMs > 0 ? (Math.min(Math.max(ms, 0), props.durationMs) / props.durationMs) * 1000 : 0)
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`

function msAt(e: PointerEvent) {
  const r = svg.value!.getBoundingClientRect()
  return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * props.durationMs)
}

function down(e: PointerEvent) {
  if (!props.durationMs) return
  dragging.value = true
  svg.value?.setPointerCapture(e.pointerId)
  emit('seek', msAt(e))
}
function move(e: PointerEvent) {
  if (dragging.value) emit('seek', msAt(e))
}
function up() {
  if (!dragging.value) return
  dragging.value = false
  if (!hintSeen.value) {
    hintSeen.value = true
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      // not remembered; the hint shows again next visit
    }
  }
}
</script>
