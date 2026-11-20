<template>
  <!-- A few bars around the playhead: the beat grid and the placed lines as
       blocks. Drag anywhere to look along the song (the playhead stays put);
       tap a block to pick that line; tap empty space to move the beat there.
       Lines can't be dragged: moving them by hand mixes them up too easily.
       To change a line's time, pick it and Pin it again. -->
  <!-- No instructions, like the strip: the blocks look draggable and the grip cursor says so.
       The hide button sits in its own column, so it never covers a line. -->
  <div class="mt-2 flex items-stretch gap-1">
    <div
      ref="box"
      data-testid="zoom-view"
      class="relative flex-1 min-w-0 h-[72px] rounded-lg bg-[#111c33] overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="press = null"
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
import type { GridTick, Timing } from '@/services/timing'

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
  seek: [ms: number]
  /** Look along the song: show from `w0` on. The playhead doesn't move. */
  pan: [w0: number]
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

const shown = computed(() => props.blocks.filter((b) => b.end > props.window[0] && b.start < props.window[1]))

// A press is a tap (pick a line, or move the beat there) unless it moves
// more than 6 px: then it's a drag that slides the view along the song.
const press = ref<{ x: number; w0: number; moved: boolean; width: number } | null>(null)

function down(e: PointerEvent) {
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  press.value = { x: e.clientX, w0: props.window[0], moved: false, width: box.value!.getBoundingClientRect().width }
}
function move(e: PointerEvent) {
  const p = press.value
  if (!p) return
  const dx = e.clientX - p.x
  if (Math.abs(dx) > 6) p.moved = true
  if (p.moved) emit('pan', Math.round(p.w0 - (dx / p.width) * span.value))
}
function up(e: PointerEvent) {
  const p = press.value
  press.value = null
  if (!p || p.moved) return
  // Pointer capture sends the event to the box, so find what is under the finger.
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-line]')
  if (hit) return emit('pick', Number(hit.getAttribute('data-line')))
  const r = box.value!.getBoundingClientRect()
  emit('seek', Math.round(props.window[0] + ((e.clientX - r.left) / r.width) * span.value))
}
</script>
