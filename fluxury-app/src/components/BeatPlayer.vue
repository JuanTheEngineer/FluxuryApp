<template>
  <div class="min-h-screen p-4 bg-gray-100">
    <h1 class="text-2xl font-bold mb-4">Fluxury Beats</h1>

    <!-- Download button -->
    <button
        @click="showDownloadForm = !showDownloadForm"
        class="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      {{ showDownloadForm ? 'Close' : 'Download Beat from YouTube' }}
    </button>

    <!-- Download form -->
    <form v-if="showDownloadForm" @submit.prevent="submitUrl" class="mb-4 bg-white p-4 rounded shadow">
      <input
          v-model="url"
          placeholder="YouTube URL"
          class="border p-2 w-full mb-2"
          required
      />
      <input
          v-model="customName"
          placeholder="Optional Name"
          class="border p-2 w-full mb-2"
      />
      <button class="bg-green-500 text-white px-3 py-2 rounded">Add Beat</button>
    </form>

    <!-- Search bar -->
    <input
        v-model="search"
        placeholder="Search beats..."
        class="border p-2 w-full mb-4"
    />

    <!-- Beat list -->
    <div class="bg-white rounded shadow divide-y">
      <div
          v-for="beat in filteredBeats"
          :key="beat.path"
          @click="selectBeat(beat)"
          class="p-3 cursor-pointer hover:bg-blue-50"
          :class="{ 'bg-blue-100': selectedBeat?.path === beat.path }"
      >
        {{ beat.name }}
      </div>
    </div>

    <!-- Player at bottom -->
    <div
        v-if="selectedBeat"
        class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg flex flex-col gap-2"
    >
      <div class="flex justify-between items-center">
        <strong>{{ selectedBeat.name }}</strong>
        <span>{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>
      <input
          type="range"
          min="0"
          :max="duration"
          step="0.1"
          v-model.number="currentTime"
          @input="seekAudio"
      />
      <div class="flex gap-2">
        <button @click="skip(-5)">⏪ 5s</button>
        <button @click="togglePlay">
          {{ isPlaying ? '⏸ Pause' : '▶️ Play' }}
        </button>
        <button @click="skip(5)">5s ⏩</button>
        <button @click="toggleLoop">
          {{ isLooping ? '🔁 Looping' : '⏭ Once' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted, watch, computed} from 'vue'
import { Howl } from 'howler'
import { getBeats, downloadBeat } from '../services/api'

const beats = ref<any[]>([])
const selectedBeat = ref<any | null>(null)
const sound = ref<Howl | null>(null)
const isPlaying = ref(false)
const isLooping = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const updateInterval = ref<number | null>(null)

const showDownloadForm = ref(false)
const url = ref('')
const customName = ref('')
const search = ref('')

const filteredBeats = computed(() =>
    beats.value.filter(b => b.name.toLowerCase().includes(search.value.toLowerCase()))
)

const formatTime = (s: number) => {
  const min = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

const updateTime = () => {
  if (sound.value) currentTime.value = sound.value.seek() as number
}

const clearIntervalIfNeeded = () => {
  if (updateInterval.value) clearInterval(updateInterval.value)
}

const selectBeat = (beat: any) => {
  if (sound.value) {
    sound.value.stop()
    sound.value.unload()
    clearIntervalIfNeeded()
  }
  selectedBeat.value = beat
  sound.value = new Howl({
    src: [`http://localhost:3001${beat.path}`],
    format: ['wav'],
    html5: true,
    loop: isLooping.value,
    onload: () => {
      duration.value = sound.value?.duration() || 0
    },
    onplay: () => {
      isPlaying.value = true
      updateInterval.value = setInterval(updateTime, 500)
    },
    onpause: () => (isPlaying.value = false),
    onend: () => (isPlaying.value = false)
  })
  sound.value.play()
}

const togglePlay = () => {
  if (!sound.value) return
  if (sound.value.playing()) {
    sound.value.pause()
  } else {
    sound.value.play()
  }
}

const seekAudio = () => {
  if (sound.value) sound.value.seek(currentTime.value)
}

const skip = (seconds: number) => {
  if (!sound.value) return
  const newTime = (sound.value.seek() as number) + seconds
  sound.value.seek(newTime)
  currentTime.value = newTime
}

const toggleLoop = () => {
  if (!sound.value) return
  const newLoop = !sound.value.loop()
  sound.value.loop(newLoop)
  isLooping.value = newLoop
}

const submitUrl = async () => {
  const response = await downloadBeat(url.value, customName.value)
  beats.value.push({ name: customName.value || url.value, path: response.data.path })
  url.value = ''
  customName.value = ''
  showDownloadForm.value = false
}

onMounted(async () => {
  const res = await getBeats()
  beats.value = res.data
})

watch(currentTime, (val) => {
  if (sound.value && Math.abs((sound.value.seek() as number) - val) > 1) {
    sound.value.seek(val)
  }
})
</script>

<style scoped>
button {
  @apply px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600;
}
</style>
