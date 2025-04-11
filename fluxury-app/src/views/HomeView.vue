<template>
  <div class="p-4">
    <h1 class="text-xl mb-4">Fluxury Beat Player</h1>

    <form @submit.prevent="submitUrl" class="mb-4">
      <input v-model="url" placeholder="YouTube URL" class="border p-2 mr-2" />
      <button class="bg-blue-500 text-white px-3 py-2">Add Beat</button>
    </form>

    <div v-for="beat in beats" :key="beat.path">
      <BeatPlayer :beat="beat" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { downloadBeat } from '../services/api'
import { useBeatStore } from '../stores/beatStore'
import { storeToRefs } from 'pinia'
import BeatPlayer from '../components/BeatPlayer.vue'

const url = ref('')
const beatStore = useBeatStore()
const { beats } = storeToRefs(beatStore)

const submitUrl = async () => {
  const response = await downloadBeat(url.value)
  beatStore.addBeat({ name: url.value, path: response.data.path })
  url.value = ''
}

onMounted(() => {
  beatStore.fetchBeats()
})
</script>
