<template>
  <!-- Covers the editor box. Draws nothing inside Quill's DOM (Quill treats
       changes there as edits), only on top of it, positioned from each line's
       measured box, so wrapped lines and scrolling stay aligned. -->
  <div ref="root" class="absolute inset-0 pointer-events-none" aria-hidden="false">
    <div
      v-if="band"
      data-testid="playing-band"
      class="absolute left-0 right-0 bg-amber-500/10 border-l-2 border-amber-500 transition-[top,height] duration-150 motion-reduce:transition-none"
      :style="{ top: band.top + 'px', height: band.height + 'px' }"
    />
    <div
      v-if="targetBox"
      data-testid="pin-target"
      class="absolute left-12 right-1 rounded ring-1 ring-violet-500/70"
      :style="{ top: targetBox.top + 'px', height: targetBox.height + 'px' }"
    />
    <button
      v-for="m in marks"
      :key="m.line"
      type="button"
      data-testid="line-time"
      class="pointer-events-auto absolute left-1 flex items-center gap-1 h-6 px-1 rounded text-[11px] tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      :class="m.line === playing ? 'text-amber-300 font-semibold' : 'text-violet-300 hover:text-violet-200'"
      :style="{ top: m.top + 'px' }"
      :aria-label="`Line ${m.line + 1} pinned at ${m.label}. Jump there`"
      @click="emit('jump', m.line)"
    >
      <span class="w-2 h-2 rounded-full" :class="m.line === playing ? 'bg-amber-400' : 'bg-violet-500'" />
      {{ m.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type Quill from 'quill'
import { readLineTimes } from '@/services/lineTime'

/** playing: line under the playhead. target: line that Pin will place. */
const props = defineProps<{ quill: Quill; playing: number | null; target: number | null }>()
const emit = defineEmits<{ jump: [line: number] }>()

const root = ref<HTMLElement>()
const marks = ref<{ line: number; top: number; label: string }[]>([])
const band = ref<{ top: number; height: number } | null>(null)
const targetBox = ref<{ top: number; height: number } | null>(null)

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`

function measure() {
  if (!root.value) return
  const base = root.value.getBoundingClientRect().top
  const lines = props.quill.getLines()
  const times = readLineTimes(props.quill)
  marks.value = times.flatMap((t, i) => {
    if (t.timeMs == null) return []
    const r = lines[i].domNode.getBoundingClientRect()
    return [{ line: i, top: r.top - base, label: fmt(t.timeMs) }]
  })
  const box = (i: number | null) => {
    const line = i == null ? null : lines[i]
    if (!line) return null
    const r = line.domNode.getBoundingClientRect()
    return { top: r.top - base, height: r.height }
  }
  band.value = box(props.playing)
  targetBox.value = box(props.target)
}

// Re-measure on the next frame too: right after a resize the layout can still
// be one row behind (measured 18 px off in the prototype).
let frame = 0
function schedule() {
  measure()
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  props.quill.on('text-change', schedule)
  window.addEventListener('resize', schedule)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(schedule)
    observer.observe(props.quill.root)
  }
  schedule()
})
onBeforeUnmount(() => {
  props.quill.off('text-change', schedule)
  window.removeEventListener('resize', schedule)
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
watch(() => [props.playing, props.target], measure)
defineExpose({ measure: schedule })
</script>
