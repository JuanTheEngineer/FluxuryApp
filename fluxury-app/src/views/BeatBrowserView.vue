<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { beatsApi } from '@/api/api-clients'
import { useBeatStore } from '@/stores/beatStore'
import { storeToRefs } from 'pinia'
import BeatPlayer from '@/components/BeatPlayer.vue'
import type { CreateBeatRequestContent } from '@/api/open-api/beat-client'

const store = useBeatStore()
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
    const res = await beatsApi.createBeat(payload)
    await store.fetchBeats()
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

onMounted(() => {
  store.fetchBeats()
})
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Fluxury Beats</h1>

    <button
        @click="showForm = !showForm"
        class="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      {{ showForm ? 'Close' : 'Download Beat from YouTube' }}
    </button>

    <form v-if="showForm" @submit.prevent="submitUrl" class="mb-4 bg-white p-4 rounded shadow">
      <input v-model="url" placeholder="YouTube URL" class="border p-2 w-full mb-2" required />
      <input v-model="customName" placeholder="Optional Name" class="border p-2 w-full mb-2" />
      <button :disabled="isSubmitting" class="bg-green-500 text-white px-3 py-2 rounded">
        {{ isSubmitting ? 'Adding...' : 'Add Beat' }}
      </button>
    </form>

    <input v-model="search" placeholder="Search beats..." class="border p-2 w-full mb-4" />

    <div class="bg-white rounded shadow divide-y">
      <div
          v-for="beat in filtered"
          :key="beat.path"
          @click="select(beat)"
          class="p-3 cursor-pointer hover:bg-blue-50"
          :class="{ 'bg-blue-100': selectedBeat?.path === beat.path }"
      >
        {{ beat.name }}
      </div>
    </div>

    <BeatPlayer :beatUrl="selectedBeat?.beatUrl" />
  </div>
</template>
