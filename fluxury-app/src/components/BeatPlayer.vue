<template>
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
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, watch } from 'vue'
import { useBeatStore } from '../stores/beatStore'
import { storeToRefs } from 'pinia'
import { Howl } from 'howler'

const { selectedBeat } = storeToRefs(useBeatStore())

const sound = ref<Howl | null>(null)
const isPlaying = ref(false)
const isLooping = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const updateInterval = ref<number | null>(null)

const formatTime = (s: number) => {
  const min = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

const clearIntervalIfNeeded = () => {
  if (updateInterval.value) {
    clearInterval(updateInterval.value)
    updateInterval.value = null
  }
}

watch(selectedBeat, (beat) => {
  if (!beat) return

  if (sound.value) {
    sound.value.stop()
    sound.value.unload()
    clearIntervalIfNeeded()
  }

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
      updateInterval.value = setInterval(() => {
        if (sound.value) currentTime.value = sound.value.seek() as number
      }, 500)
    },
    onpause: () => (isPlaying.value = false),
    onend: () => (isPlaying.value = false),
  })

  sound.value.play()
})

const togglePlay = () => {
  if (!sound.value) return
  sound.value.playing() ? sound.value.pause() : sound.value.play()
}

const seekAudio = () => {
  if (!sound.value) return

  let newTime = currentTime.value

  if (!isLooping.value && (newTime < 0 || newTime > duration.value)) {
    sound.value.seek(0.0)
    currentTime.value = 0.0
    return
  }

  if (isLooping.value) {
    if (newTime < 0) {
      const overflow = Math.abs(newTime)
      newTime = duration.value - (overflow % duration.value)
    } else if (newTime > duration.value) {
      const overflow = newTime - duration.value
      newTime = overflow % duration.value
    }
  }

  sound.value.seek(newTime)
  currentTime.value = newTime
}

const skip = (seconds: number) => {
  if (!sound.value) return
  const newTime = (sound.value.seek() as number) + seconds
  currentTime.value = newTime
  seekAudio()
}

const toggleLoop = () => {
  if (!sound.value) return
  const newLoop = !sound.value.loop()
  sound.value.loop(newLoop)
  isLooping.value = newLoop
}

onBeforeUnmount(() => {
  if (sound.value) sound.value.unload()
  clearIntervalIfNeeded()
})
</script>

<style scoped>
button {
  @apply px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600;
}
</style>
