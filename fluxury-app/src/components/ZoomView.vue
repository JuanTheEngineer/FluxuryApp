<template>
  <!-- A few bars around the playhead: the beat grid and the placed lines as
       blocks. Drag a block to move its line in time (snaps to the beat); tap a
       block to pick that line; tap empty space to move the beat there. -->
  <!-- No instructions, like the strip: the blocks look draggable and the grip cursor says so.
       The hide button sits in its own column, so it never covers a line. -->
  <div class="mt-2 flex items-stretch gap-1">
    <div
      ref="box"
      data-testid="zoom-view"
      class="relative flex-1 min-w-0 h-[72px] rounded-lg bg-[#111c33] overflow-hidden touch-none select-none cursor-pointer"
      @pointerdown="downEmpty"
    >
      <!-- section colour along the top -->
      <div
        v-for="s in bands"
        :key="'c' + s.id"
        class="absolute top-0 h-1"
        :style="{ left: pct(s.a) + '%', width: pct(s.z) - pct(s.a) + '%', background: s.color }"
      />
      <!-- the grid -->
      <template v-for="k in ticks" :key="'t' + k.ms">
        <div
          class="absolute bottom-0 w-px"
          :class="k.major ? 'top-1.5 bg-slate-500/80' : 'top-[56px] bg-slate-600/80'"
          :style="{ left: pct(k.ms) + '%' }"
        />
        <span
          v-if="k.label"
          class="absolute top-1.5 pl-1 text-[10px] leading-none whitespace-nowrap pointer-events-none"
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
        :aria-label="`${b.text || 'Line'}: drag to move it, tap to pick it`"
        class="absolute top-[20px] h-8 rounded-md px-1.5 flex items-center text-[12px] text-white overflow-hidden whitespace-nowrap cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        :style="{
          left: `calc(${pct(b.from)}% + 2px)`,
          width: `max(24px, calc(${pct(b.to) - pct(b.from)}% - 4px))`,
          background: b.color,
          opacity: b.line === playingLine || b.line === dragLine ? 0.95 : 0.55,
          outline: b.line === targetLine ? '1.5px solid #f8fafc' : 'none',
          zIndex: b.line === dragLine ? 2 : 1,
        }"
        @pointerdown.stop="grab($event, b)"
        @pointermove="drag"
        @pointerup="drop"
        @pointercancel="cancel"
        @keydown.enter.prevent="emit('pick', b.line)"
      >
        {{ b.text }}
      </div>
      <div class="absolute top-0 bottom-0 w-0.5 bg-slate-50 pointer-events-none" :style="{ left: pct(nowMs) + '%' }" />
    </div>
    <button
      type="button"
      data-testid="zoom-toggle"
      :aria-expanded="true"
      aria-label="Hide the zoomed-in view"
      title="Hide the zoomed-in view"
      class="flex-none w-7 rounded-lg text-[12px] text-slate-400 bg-[#111c33] hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      @click="emit('hide')"
    >
      ▴
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { snap, type GridTick, type Timing } from '@/services/timing'

type Block = { line: number; start: number; end: number; color: string; text: string }
const props = defineProps<{
  timing: Timing
  window: [number, number]
  ticks: GridTick[]
  blocks: Block[]
  nowMs: number
  targetLine: number | null
  playingLine: number | null
}>()
const emit = defineEmits<{
  pick: [line: number]
  move: [line: number, ms: number]
  seek: [ms: number]
  hide: []
}>()

const box = ref<HTMLElement>()
const span = computed(() => Math.max(1, props.window[1] - props.window[0]))
const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - props.window[0]) / span.value) * 100))

const bands = computed(() =>
  props.timing.sections
    .map((s) => ({ id: s.id, color: s.color, a: Math.max(s.startMs, props.window[0]), z: Math.min(s.endMs, props.window[1]) }))
    .filter((s) => s.z > s.a),
)

// While dragging, the block is drawn at the preview time; the line itself
// only changes on release (one undoable edit, not one per pixel).
const dragLine = ref<number | null>(null)
const preview = ref(0)
let press: { x: number; start: number; moved: boolean; width: number } | null = null

const shown = computed(() =>
  props.blocks
    .map((b) => {
      if (b.line !== dragLine.value) return { ...b, from: b.start, to: b.end }
      const len = b.end - b.start
      return { ...b, from: preview.value, to: preview.value + len }
    })
    .filter((b) => b.to > props.window[0] && b.from < props.window[1]),
)

function grab(e: PointerEvent, b: Block) {
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  press = { x: e.clientX, start: b.start, moved: false, width: box.value!.getBoundingClientRect().width }
  dragLine.value = b.line
  preview.value = b.start
}
function drag(e: PointerEvent) {
  if (!press) return
  const dx = e.clientX - press.x
  if (Math.abs(dx) > 6) press.moved = true
  if (!press.moved) return
  const end = props.timing.durationMs || Infinity
  const raw = Math.min(end - 1, Math.max(0, press.start + (dx / press.width) * span.value))
  preview.value = props.timing.sections.length ? snap(props.timing, raw) : Math.round(raw)
}
function drop() {
  if (!press || dragLine.value == null) return
  const line = dragLine.value
  const moved = press.moved && preview.value !== press.start
  const wasTap = !press.moved
  press = null
  dragLine.value = null
  if (moved) emit('move', line, preview.value)
  else if (wasTap) emit('pick', line)
}
function cancel() {
  press = null
  dragLine.value = null
}

function downEmpty(e: PointerEvent) {
  const r = box.value!.getBoundingClientRect()
  emit('seek', Math.round(props.window[0] + ((e.clientX - r.left) / r.width) * span.value))
}
</script>
