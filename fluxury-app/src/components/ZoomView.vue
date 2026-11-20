<template>
  <!-- A few bars around the playhead: the beat grid and the placed lines as
       blocks. Drag anywhere to look along the song (the playhead stays put;
       a flick glides on); tap a block to pick that line; tap empty space to
       move the beat there. Lines can't be dragged: moving them by hand mixes
       them up too easily. To change a line's time, pick it and Pin it again.
       Zoom with + and −, a pinch, or a trackpad pinch. No instruction text,
       like the strip. The controls sit in their own column, never over a line. -->
  <div class="mt-2 flex items-stretch gap-1">
    <div
      ref="box"
      data-testid="zoom-view"
      :data-bars="bars"
      class="relative flex-1 min-w-0 h-[72px] rounded-lg bg-[#111c33] overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="cancelPointer"
      @wheel="wheel"
    >
      <!-- section colour along the top -->
      <div
        v-for="s in bands"
        :key="'c' + s.id"
        class="absolute top-0 h-1"
        :style="{ left: pct(s.a) + '%', width: pct(s.z) - pct(s.a) + '%', background: s.color }"
      />
      <!-- the grid: bar numbers like a music app's bar ruler, no repeated "bar" -->
      <template v-for="k in ticks" :key="'t' + k.ms">
        <div
          class="absolute bottom-0 w-px"
          :class="k.major ? 'top-1.5 bg-slate-500/80' : 'top-[56px] bg-slate-600/80'"
          :style="{ left: pct(k.ms) + '%' }"
        />
        <span
          v-if="k.label"
          data-testid="zoom-label"
          class="absolute top-1.5 pl-1 text-[10px] leading-none whitespace-nowrap pointer-events-none tabular-nums"
          :style="{ left: pct(k.ms) + '%', color: k.color ?? '#94a3b8' }"
        >{{ k.label }}</span>
      </template>
      <!-- placed lines -->
      <div
        v-for="b in shown"
        :key="'b' + b.line"
        data-testid="zoom-line"
        :data-line="b.line"
        role="button"
        tabindex="0"
        :aria-label="`${b.text || 'Line'}: pick this line`"
        class="absolute top-[20px] h-8 rounded-md px-1.5 flex items-center text-[12px] text-white overflow-hidden whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        :style="{
          left: `calc(${pct(b.start)}% + 2px)`,
          width: `max(24px, calc(${pct(b.end) - pct(b.start)}% - 4px))`,
          background: b.color,
          opacity: b.line === playingLine ? 0.95 : 0.55,
          outline: b.line === targetLine ? '1.5px solid #f8fafc' : 'none',
        }"
        @keydown.enter.prevent="emit('pick', b.line)"
      >
        {{ b.text }}
      </div>
      <div class="absolute top-0 bottom-0 w-0.5 bg-slate-50 pointer-events-none" :style="{ left: pct(nowMs) + '%' }" />
      <!-- After a zoom change only: how many bars are shown -->
      <div
        v-if="levelFlash"
        data-testid="zoom-level"
        role="status"
        class="absolute right-1.5 bottom-1.5 px-1.5 py-0.5 rounded bg-slate-900/90 text-[10px] text-slate-200 pointer-events-none"
      >
        {{ bars }} {{ bars === 1 ? 'bar' : 'bars' }}
      </div>
    </div>
    <div class="flex-none w-8 flex flex-col gap-0.5">
      <button
        type="button"
        data-testid="zoom-in"
        :disabled="level <= 0"
        aria-label="Zoom in (fewer bars)"
        title="Zoom in"
        class="flex-1 rounded-t-lg text-[15px] leading-none text-slate-300 bg-[#111c33] hover:text-slate-100 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        @click="zoomBy(-1)"
      >
        +
      </button>
      <button
        type="button"
        data-testid="zoom-out"
        :disabled="level >= ZOOM_LEVELS.length - 1"
        aria-label="Zoom out (more bars)"
        title="Zoom out"
        class="flex-1 text-[15px] leading-none text-slate-300 bg-[#111c33] hover:text-slate-100 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        @click="zoomBy(1)"
      >
        −
      </button>
      <button
        type="button"
        data-testid="zoom-toggle"
        :aria-expanded="true"
        aria-label="Hide the zoomed-in view"
        title="Hide the zoomed-in view"
        class="flex-1 rounded-b-lg text-[11px] text-slate-400 bg-[#111c33] hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        @click="emit('hide')"
      >
        ▴
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ZOOM_LEVELS, type GridTick, type Timing } from '@/services/timing'

type Block = { line: number; start: number; end: number; color: string; text: string }
const props = defineProps<{
  timing: Timing
  window: [number, number]
  ticks: GridTick[]
  blocks: Block[]
  nowMs: number
  targetLine: number | null
  playingLine: number | null
  /** Index into ZOOM_LEVELS. */
  level: number
  /** True while the view is following the playhead (not panned away). */
  following: boolean
}>()
const emit = defineEmits<{
  pick: [line: number]
  seek: [ms: number]
  /** Look along the song: show from `w0` on. The playhead doesn't move. */
  pan: [w0: number]
  /** New zoom level (index into ZOOM_LEVELS). */
  zoom: [level: number]
  hide: []
}>()

const box = ref<HTMLElement>()
const span = computed(() => Math.max(1, props.window[1] - props.window[0]))
const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - props.window[0]) / span.value) * 100))
const bars = computed(() => ZOOM_LEVELS[props.level])

const bands = computed(() =>
  props.timing.sections
    .map((s) => ({ id: s.id, color: s.color, a: Math.max(s.startMs, props.window[0]), z: Math.min(s.endMs, props.window[1]) }))
    .filter((s) => s.z > s.a),
)

const shown = computed(() => props.blocks.filter((b) => b.end > props.window[0] && b.start < props.window[1]))

// --- Zoom: buttons, a pinch, a trackpad pinch (ctrl + wheel) ---
const levelFlash = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | undefined
function zoomBy(d: number) {
  const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, props.level + d))
  if (next === props.level) return
  stopGlide()
  emit('zoom', next)
  levelFlash.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (levelFlash.value = false), 1200)
}
let wheelAcc = 0
function wheel(e: WheelEvent) {
  if (!e.ctrlKey) return // ordinary scrolling scrolls the page
  e.preventDefault()
  wheelAcc += e.deltaY
  if (Math.abs(wheelAcc) < 40) return
  zoomBy(wheelAcc < 0 ? -1 : 1) // fingers apart (negative) zooms in
  wheelAcc = 0
}

// --- Pointers: tap, drag (pan with momentum) or two-finger pinch ---
// A press is a tap (pick a line, or move the beat there) unless it moves
// more than 6 px: then it's a drag that slides the view along the song.
const press = ref<{ x: number; w0: number; moved: boolean; width: number } | null>(null)
const pointers = new Map<number, number>() // id -> clientX
let pinchBase = 0
let samples: { t: number; x: number }[] = []

function down(e: PointerEvent) {
  stopGlide()
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, e.clientX)
  if (pointers.size === 2) {
    press.value = null // a pinch, not a drag or tap
    const [a, b] = [...pointers.values()]
    pinchBase = Math.abs(a - b)
    return
  }
  press.value = { x: e.clientX, w0: props.window[0], moved: false, width: box.value!.getBoundingClientRect().width }
  samples = [{ t: e.timeStamp, x: e.clientX }]
}
function move(e: PointerEvent) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX)
  if (pointers.size === 2 && pinchBase > 0) {
    const [a, b] = [...pointers.values()]
    const ratio = Math.abs(a - b) / pinchBase
    if (ratio > 1.3 || ratio < 0.77) {
      zoomBy(ratio > 1 ? -1 : 1) // fingers apart zooms in
      pinchBase = Math.abs(a - b)
    }
    return
  }
  const p = press.value
  if (!p) return
  const dx = e.clientX - p.x
  if (Math.abs(dx) > 6) p.moved = true
  samples.push({ t: e.timeStamp, x: e.clientX })
  if (samples.length > 6) samples.shift()
  if (p.moved) emit('pan', Math.round(p.w0 - (dx / p.width) * span.value))
}
function up(e: PointerEvent) {
  pointers.delete(e.pointerId)
  const p = press.value
  press.value = null
  if (!p) return
  if (p.moved) return glide(p.width)
  // Pointer capture sends the event to the box, so find what is under the finger.
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-line]')
  if (hit) return emit('pick', Number(hit.getAttribute('data-line')))
  const r = box.value!.getBoundingClientRect()
  emit('seek', Math.round(props.window[0] + ((e.clientX - r.left) / r.width) * span.value))
}
function cancelPointer(e: PointerEvent) {
  pointers.delete(e.pointerId)
  press.value = null
}

// --- Momentum: after a flick the view glides on and slows down ---
// Velocity from the last ~100 ms of the drag; decays like iPhone scrolling
// (time constant 325 ms). Off when the system asks for reduced motion.
let frame = 0
function stopGlide() {
  cancelAnimationFrame(frame)
  frame = 0
}
function glide(width: number) {
  const recent = samples.filter((s) => samples[samples.length - 1].t - s.t <= 100)
  if (recent.length < 2) return
  const dt = recent[recent.length - 1].t - recent[0].t
  if (dt <= 0) return
  let v = (recent[recent.length - 1].x - recent[0].x) / dt // px per ms
  if (Math.abs(v) < 0.3) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const msPerPx = span.value / width
  const maxW0 = Math.max(0, (props.timing.durationMs || 0) - span.value)
  let w0 = props.window[0]
  let last = performance.now()
  const step = (now: number) => {
    const elapsed = Math.min(50, now - last)
    last = now
    w0 -= v * elapsed * msPerPx
    v *= Math.exp(-elapsed / 325)
    const clamped = Math.max(0, Math.min(w0, maxW0))
    emit('pan', Math.round(clamped))
    if (clamped !== w0 || Math.abs(v) < 0.02) return stopGlide()
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
// When the view goes back to following the playhead (the beat was moved), stop gliding.
watch(() => props.following, (f) => f && stopGlide())

onBeforeUnmount(() => {
  stopGlide()
  clearTimeout(flashTimer)
})
</script>
