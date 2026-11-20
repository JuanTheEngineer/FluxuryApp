<template>
  <!-- Hidden until "Sections" is tapped: the writer checks or adds sections,
       then goes back to writing. Kept to two rows; the rarely used settings
       sit behind "More". -->
  <div v-if="open" data-testid="section-panel" class="mt-2">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="s in timing.sections"
        :key="s.id"
        type="button"
        data-testid="section-chip"
        class="text-[11px] px-2 py-1 rounded-full border transition-colors"
        :style="{ color: s.color, background: s.color + '26', borderColor: s.id === selectedId ? s.color : s.color + '55' }"
        :aria-pressed="s.id === selectedId"
        @click="emit('select', s)"
      >
        {{ s.name }}
      </button>
      <button
        type="button"
        data-testid="add-section"
        :disabled="timing.sections.length >= MAX_SECTIONS"
        class="text-[11px] px-2 py-1 rounded-full border border-dashed border-slate-500 text-slate-300 bg-slate-800 hover:border-violet-400 disabled:opacity-40"
        @click="emit('split')"
      >
        + section here
      </button>
    </div>

    <p v-if="timing.sections.length === 0" class="mt-2 text-xs text-slate-400">
      Play to where a part starts (a verse, the hook, a beat switch) and tap “+ section here”.
    </p>

    <div
      v-if="selected"
      data-testid="section-editor"
      class="mt-2 px-2.5 py-2 rounded-lg border bg-slate-900 text-slate-100 text-xs"
      :style="{ borderColor: selected.color + '88' }"
    >
      <div class="flex items-center gap-2">
        <input
          data-testid="section-name"
          :value="selected.name"
          maxlength="40"
          aria-label="Section name"
          class="min-w-0 flex-1 bg-slate-800 text-slate-100 border border-slate-600 rounded px-2 py-1 font-semibold"
          :style="{ color: selected.color }"
          @change="edit({ name: ($event.target as HTMLInputElement).value })"
        />
        <!-- Tempo is optional: it only makes Pin snap and shows bar numbers -->
        <div class="flex items-center rounded border border-slate-600 bg-slate-800 overflow-hidden" title="Tempo (optional)">
          <span class="pl-1.5 text-slate-400" aria-hidden="true">♩</span>
          <input
            data-testid="section-bpm"
            type="number"
            inputmode="decimal"
            :min="BPM_MIN"
            :max="BPM_MAX"
            step="0.1"
            :value="selected.bpm ?? ''"
            placeholder="—"
            aria-label="Tempo in BPM (optional)"
            class="w-12 bg-transparent text-slate-100 px-1 py-1 text-center tabular-nums"
            @change="onBpm(($event.target as HTMLInputElement).value)"
          />
          <button
            type="button"
            data-testid="tap-tempo"
            :aria-label="tapLabel"
            class="px-2 py-1 border-l border-slate-600 text-slate-200 active:bg-violet-500/40 tabular-nums"
            :class="{ 'bg-violet-500/20': tapping }"
            @click="tap"
          >
            {{ tapping ? `${Math.max(0, 4 - tapCount)}…` : 'Tap' }}
          </button>
        </div>
        <button
          type="button"
          data-testid="section-more"
          :aria-expanded="more"
          class="px-1.5 py-1 rounded text-slate-400 hover:text-slate-100"
          @click="more = !more"
        >
          More {{ more ? '▴' : '▾' }}
        </button>
      </div>

      <div v-if="more" class="mt-2 flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1 text-slate-300">
          Beats/bar
          <select
            data-testid="section-bpb"
            :value="selected.beatsPerBar"
            class="bg-slate-800 text-slate-100 border border-slate-600 rounded px-1 py-0.5"
            @change="edit({ beatsPerBar: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="n in BEATS_PER_BAR" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <span class="flex items-center gap-1.5">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            :aria-label="`Colour ${c}`"
            :aria-pressed="c === selected.color"
            class="w-5 h-5 rounded-full"
            :style="{ background: c, outline: c === selected.color ? '2px solid #f8fafc' : 'none', outlineOffset: '1px' }"
            @click="edit({ color: c })"
          />
        </span>
        <button
          type="button"
          data-testid="tempo-to-all"
          :disabled="timing.sections.length < 2 || selected.bpm == null"
          class="px-2 py-0.5 rounded border border-slate-600 text-slate-300 hover:border-violet-400 disabled:opacity-40"
          @click="emit('tempo-to-all', selected.id)"
        >
          Use this tempo everywhere
        </button>
        <button
          type="button"
          data-testid="remove-section"
          class="px-2 py-0.5 rounded text-red-300 hover:bg-red-500/10"
          @click="emit('remove', selected.id)"
        >
          Remove
        </button>
      </div>

      <p v-if="changes > WARN_TEMPO_CHANGES" class="mt-1.5 text-[11px] text-amber-300">
        {{ changes }} tempo changes. More than {{ WARN_TEMPO_CHANGES }} is hard to follow.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BEATS_PER_BAR, BPM_MAX, BPM_MIN, COLORS, MAX_SECTIONS, WARN_TEMPO_CHANGES,
  tapTempo, tempoChanges, type Section, type SectionEdit, type Timing,
} from '@/services/timing'

const props = defineProps<{ open: boolean; timing: Timing; selectedId: string | null }>()
const emit = defineEmits<{
  select: [section: Section]
  split: []
  edit: [id: string, edit: SectionEdit]
  tempo: [id: string, bpm: number | null]
  'tempo-to-all': [id: string]
  remove: [id: string]
}>()

const selected = computed(() => props.timing.sections.find((s) => s.id === props.selectedId) ?? null)
const changes = computed(() => tempoChanges(props.timing))
const more = ref(false)
const taps = ref<number[]>([])
let tapTimer: ReturnType<typeof setTimeout> | undefined
/** Taps in the current run (a pause over 2 s starts a new one). */
const tapCount = computed(() => {
  let n = 0
  for (let i = taps.value.length - 1; i >= 0; i--) {
    n++
    if (i > 0 && taps.value[i] - taps.value[i - 1] > 2000) break
  }
  return n
})
const tapping = computed(() => taps.value.length > 0 && tapCount.value < 4)
const tapLabel = computed(() => (tapping.value ? `Keep tapping, ${4 - tapCount.value} more` : 'Tap along with the beat to set the tempo'))
watch(() => props.selectedId, () => (taps.value = []))

function edit(e: SectionEdit) {
  if (selected.value) emit('edit', selected.value.id, e)
}
function onBpm(v: string) {
  if (selected.value) emit('tempo', selected.value.id, v.trim() === '' ? null : Number(v))
}
function tap() {
  const now = performance.now()
  taps.value = [...taps.value, now].slice(-9)
  const bpm = tapTempo(taps.value)
  if (bpm != null && selected.value) emit('tempo', selected.value.id, bpm)
  clearTimeout(tapTimer)
  tapTimer = setTimeout(() => (taps.value = []), 2500) // a new run next time
}
</script>
