<template>
  <transition name="slide-up">
    <div
        v-if="selectedBeat"
        class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg flex flex-col gap-2 z-50"
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
        <button @click="togglePlay">{{ isPlaying ? '⏸ Pause' : '▶️ Play' }}</button>
        <button @click="skip(5)">5s ⏩</button>
        <button @click="toggleLoop">{{ isLooping ? '🔁 Looping' : '⏭ Once' }}</button>
      </div>
    </div>
  </transition>
  <div v-else class="fixed bottom-0 left-0 right-0 bg-gray-100 text-center py-4 text-sm text-gray-500">
    No Song Selected
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
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

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const clearIntervalIfNeeded = () => updateInterval.value && clearInterval(updateInterval.value)

watch(selectedBeat, (beat) => {
  if (!beat) return
  if (sound.value) { sound.value.stop(); sound.value.unload(); clearIntervalIfNeeded() }

  sound.value = new Howl({
    src: [`http://localhost:3001${beat.path}`],
    format: ['wav'],
    html5: true,
    loop: isLooping.value,
    onload: () => (duration.value = sound.value?.duration() || 0),
    onplay: () => {
      isPlaying.value = true
      updateInterval.value = setInterval(() => {
        if (sound.value) currentTime.value = sound.value.seek() as number
      }, 500)
    },
    onpause: () => (isPlaying.value = false),
    onend: () => (isPlaying.value = false)
  })

  sound.value.play()
})

const togglePlay = () => sound.value?.playing() ? sound.value.pause() : sound.value?.play()
const seekAudio = () => {
  if (!sound.value) return
  let newTime = currentTime.value
  if (!isLooping.value && (newTime < 0 || newTime > duration.value)) return (currentTime.value = 0, sound.value.seek(0))
  if (isLooping.value) {
    if (newTime < 0) newTime = duration.value - (Math.abs(newTime) % duration.value)
    else if (newTime > duration.value) newTime = (newTime - duration.value) % duration.value
  }
  sound.value.seek(newTime)
  currentTime.value = newTime
}
const skip = (s: number) => {
  if (!sound.value) return
  currentTime.value = (sound.value.seek() as number) + s
  seekAudio()
}
const toggleLoop = () => {
  if (!sound.value) return
  isLooping.value = !sound.value.loop()
  sound.value.loop(isLooping.value)
}
onBeforeUnmount(() => { sound.value?.unload(); clearIntervalIfNeeded() })
</script>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.3s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}
</style>
