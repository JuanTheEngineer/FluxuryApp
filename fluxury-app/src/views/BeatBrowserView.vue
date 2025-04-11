<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBeatStore } from '../stores/beatStore'
import { storeToRefs } from 'pinia'
import { downloadBeat } from '../services/api'
import BeatPlayer from '../components/BeatPlayer.vue'

const store = useBeatStore()
const { beats, selectedBeat } = storeToRefs(store)
const search = ref('')
const showForm = ref(false)
const url = ref('')
const customName = ref('')

const filteredBeats = computed(() =>
    beats.value.filter(b =>
        b.name.toLowerCase().includes(search.value.toLowerCase())
    )
)

const selectBeat = (beat: any) => {
  store.selectBeat(beat)
}

const submit = async () => {
  const res = await downloadBeat(url.value, customName.value)
  const beat = {
    name: customName.value || url.value,
    path: res.data.path
  }
  store.addBeat(beat)
  url.value = ''
  customName.value = ''
  showForm.value = false
}

onMounted(() => store.fetchBeats())
</script>

<template>
  <div class="p-4 space-y-4">
    <button
        @click="showForm = !showForm"
        class="bg-blue-600 text-white px-4 py-2 rounded"
    >
      {{ showForm ? 'Close' : 'Download Beat from YouTube' }}
    </button>

    <form v-if="showForm" @submit.prevent="submit" class="bg-white p-4 rounded shadow space-y-2">
      <input v-model="url" placeholder="YouTube URL" class="w-full border p-2" />
      <input v-model="customName" placeholder="Custom name" class="w-full border p-2" />
      <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded">Download</button>
    </form>

    <input v-model="search" placeholder="Search beats..." class="border p-2 w-full" />

    <div class="bg-white shadow rounded">
      <div
          v-for="beat in filteredBeats"
          :key="beat.path"
          @click="selectBeat(beat)"
          class="p-3 border-b cursor-pointer hover:bg-blue-100"
          :class="{ 'bg-blue-200': selectedBeat?.path === beat.path }"
      >
        {{ beat.name }}
      </div>
    </div>

    <BeatPlayer />
  </div>
</template>
