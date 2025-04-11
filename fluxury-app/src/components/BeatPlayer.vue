<template>
  <div class="my-4">
    <p>{{ beat.name }}</p>
    <div class="flex gap-2">
      <button @click="togglePlay">{{ isPlaying ? '⏸️ Pause' : '▶️ Play' }}</button>
      <button @click="seek(-5)">⏪ 5s</button>
      <button @click="seek(5)">5s ⏩</button>
      <button @click="toggleLoop">{{ isLooping ? '🔁 Looping' : '➡️ Once' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, onMounted } from 'vue'
import { Howl } from 'howler'

const props = defineProps<{ beat: { name: string, path: string } }>()

const sound = new Howl({
  src: [`http://localhost:3001${props.beat.path}`],
  format: ['wav'],
  loop: true,
  onplay: () => console.log('▶️ Playing'),
  onpause: () => console.log('⏸️ Paused'),
  onload: () => console.log('✅ Audio loaded'),
  onloaderror: (id, err) => console.error('❌ Load error', err),
  onplayerror: (id, err) => console.error('❌ Play error', err)
})

const isPlaying = ref(false)
const isLooping = ref(true)

const togglePlay = () => {
  console.log(`togglePlay called on ${sound.playing()}`)
  if (sound.playing()) {
    sound.pause()
    isPlaying.value = false
    console.log('Paused')
  } else {
    sound.play()
    isPlaying.value = true
    console.log('Playing')
  }
}

const toggleLoop = () => {
  const newLoop = !sound.loop()
  sound.loop(newLoop)
  isLooping.value = newLoop
  console.log(`Looping: ${newLoop}`)
}

const seek = (seconds: number) => {
  const current = sound.seek() as number
  sound.seek(current + seconds)
  console.log(`Seeked to: ${current + seconds}s`)
}

onMounted(() => {
  console.log('🔊 Initializing sound for:', props.beat.name)
})

onBeforeUnmount(() => {
  console.log('🧹 Unloading sound')
  sound.unload()
})
</script>
