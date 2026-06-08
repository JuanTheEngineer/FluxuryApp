<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useBeatStore } from '@/stores/beatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import BeatPlayer from '@/components/BeatPlayer.vue'
import type { CreateBeatRequestContent } from '@/services/api'

const store = useBeatStore()
const sessionStore = useSessionStore()
const router = useRouter()
const { beats, selectedBeat } = storeToRefs(store)

const url = ref('')
const customName = ref('')
const showForm = ref(false)
const search = ref('')
const isSubmitting = ref(false)

const filtered = computed(() =>
    beats.value.filter((b) =>
        b.name.toLowerCase().includes(search.value.toLowerCase())
    )
)

const submitUrl = async () => {
  isSubmitting.value = true
  try {
    const payload: CreateBeatRequestContent = {
      url: url.value,
      name: customName.value || url.value,
      creator: 'Unknown', // or allow the user to input this
    }
    await store.createBeat(payload)
    url.value = ''
    customName.value = ''
    showForm.value = false
  } catch (err) {
    console.error('Failed to add beat:', err)
    alert('Error adding beat')
  } finally {
    isSubmitting.value = false
  }
}

const select = (beat: any) => {
  store.selectBeat(selectedBeat.value?.path === beat.path ? null : beat)
}

const startSessionWithBeat = async () => {
  if (!selectedBeat.value) return
  const id = await sessionStore.createSession({
    name: selectedBeat.value.name,
    beatUrl: selectedBeat.value.path,
  })
  if (id) router.push(`/session/${id}`)
}

onMounted(() => {
  store.fetchBeats()
})
</script>

<template>
  <div class="p-4">
    <h1 class="text-xl font-bold text-slate-100 mb-4">Fluxury Beats</h1>

    <button
        @click="showForm = !showForm"
        class="mb-4 bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors"
    >
      {{ showForm ? 'Close' : 'Download Beat from YouTube' }}
    </button>

    <form v-if="showForm" @submit.prevent="submitUrl" class="mb-4 bg-surface-elevated border border-slate-700 p-4 rounded-xl">
      <input v-model="url" placeholder="YouTube URL" class="bg-surface border border-slate-700 text-slate-100 placeholder-slate-500 p-2 w-full mb-2 rounded-lg focus:outline-none focus:border-amber-500" required />
      <input v-model="customName" placeholder="Optional Name" class="bg-surface border border-slate-700 text-slate-100 placeholder-slate-500 p-2 w-full mb-2 rounded-lg focus:outline-none focus:border-amber-500" />
      <button :disabled="isSubmitting" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40">
        {{ isSubmitting ? 'Adding...' : 'Add Beat' }}
      </button>
    </form>

    <input v-model="search" placeholder="Search beats..." class="bg-surface-elevated border border-slate-700 text-slate-100 placeholder-slate-500 p-2 w-full mb-4 rounded-lg focus:outline-none focus:border-amber-500" />

    <div class="bg-surface-elevated rounded-xl border border-slate-700 divide-y divide-slate-700">
      <div
          v-for="beat in filtered"
          :key="beat.path"
          @click="select(beat)"
          class="p-3 cursor-pointer hover:bg-slate-700/50 text-slate-200 transition-colors"
          :class="{ 'bg-amber-500/10 border-l-2 border-amber-500 text-amber-400': selectedBeat?.path === beat.path }"
      >
        {{ beat.name }}
      </div>
    </div>

    <button
      v-if="selectedBeat"
      @click="startSessionWithBeat"
      class="mt-4 w-full bg-amber-500 text-black py-3 rounded-lg font-medium hover:bg-amber-400 transition-colors"
    >
      Write to this beat
    </button>

    <BeatPlayer :beatUrl="selectedBeat?.path" />
  </div>
</template>
