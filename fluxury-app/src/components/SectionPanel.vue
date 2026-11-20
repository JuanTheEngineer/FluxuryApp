<template>
  <!-- Hidden until "Sections" is tapped: the writer checks or adds sections,
       then goes back to writing. -->
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
        @click="select(s)"
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
      class="mt-2 p-3 rounded-lg border bg-slate-900 text-slate-100 text-xs space-y-2"
      :style="{ borderColor: selected.color + '88' }"
    >
      <div class="flex flex-wrap items-center gap-3">
        <input
          data-testid="section-name"
          :value="selected.name"
          maxlength="40"
          aria-label="Section name"
          class="w-28 bg-slate-800 text-slate-100 border border-slate-600 rounded px-2 py-1 font-semibold"
          :style="{ color: selected.color }"
          @change="edit({ name: ($event.target as HTMLInputElement).value })"
        />
        <label class="flex items-center gap-1">
          Tempo
          <input
            data-testid="section-bpm"
            type="number"
            inputmode="decimal"
            :min="BPM_MIN"
            :max="BPM_MAX"
            step="0.1"
            :value="selected.bpm ?? ''"
            placeholder="BPM"
            class="w-16 bg-slate-800 text-slate-100 border border-slate-600 rounded px-1.5 py-1"
            @change="onBpm(($event.target as HTMLInputElement).value)"
          />
        </label>
        <button
          type="button"
          data-testid="tap-tempo"
          class="px-2.5 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200 active:bg-violet-500/40"
          @click="tap"
        >
          Tap {{ taps.length > 0 && taps.length < 4 ? `(${4 - taps.length} more)` : '' }}
        </button>
        <label class="flex items-center gap-1">
          Beats/bar
          <select
            data-testid="section-bpb"
            :value="selected.beatsPerBar"
            class="bg-slate-800 text-slate-100 border border-slate-600 rounded px-1 py-1"
            @change="edit({ beatsPerBar: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="n in BEATS_PER_BAR" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          :aria-label="`Colour ${c}`"
          :aria-pressed="c === selected.color"
          class="w-6 h-6 rounded-full"
          :style="{ background: c, outline: c === selected.color ? '2px solid #f8fafc' : 'none', outlineOffset: '1px' }"
          @click="edit({ color: c })"
        />
        <span class="flex-1" />
        <button
          type="button"
          data-testid="tempo-to-all"
          :disabled="timing.sections.length < 2"
          class="px-2 py-1 rounded border border-slate-600 text-slate-300 hover:border-violet-400 disabled:opacity-40"
          @click="emit('tempo-to-all', selected.id)"
        >
          Use this tempo everywhere
        </button>
        <button
          type="button"
          data-testid="remove-section"
          class="px-2 py-1 rounded text-red-300 hover:bg-red-500/10"
          @click="emit('remove', selected.id)"
        >
          Remove
        </button>
      </div>

      <p class="text-[11px]" :class="changes > WARN_TEMPO_CHANGES ? 'text-amber-300' : 'text-slate-400'">
        {{ timing.sections.length }}/{{ MAX_SECTIONS }} sections · {{ changes }} tempo change{{ changes === 1 ? '' : 's' }}<template v-if="changes > WARN_TEMPO_CHANGES">. More than {{ WARN_TEMPO_CHANGES }} is hard to follow.</template>
        <template v-if="selected.bpm == null"> · Set a tempo so Pin snaps to the beat.</template>
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
  'tempo-to-all': [id: string]
  remove: [id: string]
}>()

const selected = computed(() => props.timing.sections.find((s) => s.id === props.selectedId) ?? null)
const changes = computed(() => tempoChanges(props.timing))
const taps = ref<number[]>([])
watch(() => props.selectedId, () => (taps.value = []))

function select(s: Section) {
  emit('select', s)
}
function edit(e: SectionEdit) {
  if (selected.value) emit('edit', selected.value.id, e)
}
function onBpm(v: string) {
  edit({ bpm: v.trim() === '' ? null : Number(v) })
}
function tap() {
  const now = performance.now()
  taps.value = [...taps.value, now].slice(-9)
  const bpm = tapTempo(taps.value)
  if (bpm != null) edit({ bpm })
}
</script>
