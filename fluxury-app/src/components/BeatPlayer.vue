<template>
  <div
      v-if="beatUrl"
      class="fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-slate-700 p-4 shadow-2xl flex flex-col gap-2 transition-all z-40"
  >
    <!-- Loading and Error States -->
    <div v-if="isLoading" class="text-center text-amber-500">
      Loading audio...
    </div>
    <div v-if="loadError" class="text-center text-red-400 text-sm">
      {{ loadError }}
    </div>

    <!-- Main Player UI -->
    <div v-if="!isLoading && !loadError">
      <div class="flex justify-between items-center">
        <span class="text-sm font-medium text-slate-100">{{ filename }}</span>
        <span class="text-xs text-slate-400">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>

      <!-- Progress Bar -->
      <input
          type="range"
          min="0"
          :max="duration || 100"
          step="0.1"
          v-model.number="currentTime"
          @input="seekAudio"
          :disabled="duration === 0"
          class="w-full"
      />

      <!-- Controls -->
      <div class="flex gap-2 items-center flex-wrap">
        <button @click="skip(-5)" :disabled="!sound" class="px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">-5s</button>
        <button @click="togglePlay" :disabled="!sound || duration === 0" class="px-4 py-1.5 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-40 transition-colors">
          {{ isPlaying ? 'Pause' : 'Play' }}
        </button>
        <button @click="skip(5)" :disabled="!sound" class="px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">+5s</button>
        <button @click="toggleLoop" :disabled="!sound" class="px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {{ isLooping ? 'Loop ∞' : 'Loop Off' }}
        </button>

        <!-- Write button -->
        <button
          v-if="props.showWriteButton"
          @click="emit('start-session')"
          class="ml-auto px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors"
        >
          ✍️ Write
        </button>
      </div>

      <!-- Volume -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">Vol</span>
        <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            v-model.number="volume"
            @input="updateVolume"
            class="flex-1"
        />
        <span class="text-xs text-slate-400 w-8">{{ Math.round(volume * 100) }}%</span>
      </div>
    </div>
  </div>
  <div
      v-else
      class="fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-slate-700 p-4 text-center text-slate-500 z-40"
  >
    No Song Selected
  </div>
</template>

<script setup lang="ts">
import { Howl } from 'howler'
import { ref, watch, computed, onBeforeUnmount } from 'vue'

const props = defineProps<{
  beatUrl?: string
  initialPosition?: number    // seconds — seek to this on load, stay paused
  initialVolume?: number      // 0–1, overrides default 0.8
  initialLoop?: boolean       // overrides default true
  showWriteButton?: boolean   // show "Write" button in the player
}>()

const emit = defineEmits<{
  'beat-audible': []
  'update:playbackState': [state: { position: number; volume: number; looping: boolean }]
  'start-session': []
}>()

const sound = ref<Howl | null>(null)
const isPlaying = ref(false)
const isLooping = ref(props.initialLoop ?? true)
const currentTime = ref(0)
const duration = ref(0)
const updateInterval = ref<number | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const volume = ref(props.initialVolume ?? 0.8)

let beatAudibleEmitted = false
let isUserAction = true

const filename = computed(() => props.beatUrl?.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'Unknown')

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

function emitPlaybackState() {
  if (!isUserAction || !sound.value) return
  emit('update:playbackState', {
    position: sound.value.seek() as number,
    volume: volume.value,
    looping: isLooping.value,
  })
}

watch(() => props.beatUrl, (url) => {
  beatAudibleEmitted = false

  if (!url) {
    // Clear everything when no URL is provided
    if (sound.value) {
      sound.value.stop()
      sound.value.unload()
      clearIntervalIfNeeded()
    }
    sound.value = null
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
    loadError.value = null
    return
  }

  // Clean up previous sound
  if (sound.value) {
    sound.value.stop()
    sound.value.unload()
    clearIntervalIfNeeded()
  }

  isLoading.value = true
  loadError.value = null

  // Apply initial props for the new sound
  volume.value = props.initialVolume ?? 0.8
  isLooping.value = props.initialLoop ?? true

  // Detect audio format from URL
  const audioFormats = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac']
  const urlFormat = url.split('.').pop()?.toLowerCase()
  const format = audioFormats.includes(urlFormat || '') ? [urlFormat!] : ['mp3', 'wav'] // Default fallback

  sound.value = new Howl({
    src: [url],
    format: format,
    html5: true,
    loop: props.initialLoop ?? true,
    volume: props.initialVolume ?? 0.8,
    preload: true,
    onload: () => {
      isLoading.value = false
      duration.value = sound.value?.duration() || 0
      console.log('Audio loaded successfully:', url)

      // Seek to initial position if provided, stay paused
      if (props.initialPosition != null && props.initialPosition > 0 && sound.value) {
        isUserAction = false
        sound.value.seek(props.initialPosition)
        currentTime.value = props.initialPosition
        isUserAction = true
      }
    },
    onloaderror: (id, error) => {
      isLoading.value = false
      loadError.value = 'Failed to load audio file'
      console.error('Audio load error:', error, url)
    },
    onplay: () => {
      // Emit beat-audible on first play per session load
      if (!beatAudibleEmitted) {
        beatAudibleEmitted = true
        emit('beat-audible')
      }

      isPlaying.value = true
      clearIntervalIfNeeded() // Clear any existing interval
      updateInterval.value = setInterval(() => {
        if (sound.value && sound.value.playing()) {
          currentTime.value = sound.value.seek() as number
        }
      }, 100) // More frequent updates for smoother progress
    },
    onpause: () => {
      isPlaying.value = false
      clearIntervalIfNeeded()
    },
    onend: () => {
      isPlaying.value = false
      clearIntervalIfNeeded()
      if (!isLooping.value) {
        currentTime.value = 0
      }
    },
    onstop: () => {
      isPlaying.value = false
      clearIntervalIfNeeded()
    }
  })

  // Don't auto-play when loading - wait for user interaction
  // sound.value.play()
}, { immediate: true })

const togglePlay = () => {
  if (!sound.value) return
  sound.value.playing() ? sound.value.pause() : sound.value.play()
  emitPlaybackState()
}

const seekAudio = () => {
  if (!sound.value || duration.value === 0) return

  let newTime = currentTime.value

  // Clamp time to valid range
  if (newTime < 0) {
    newTime = 0
  } else if (newTime > duration.value) {
    newTime = duration.value
  }

  // Handle looping edge cases
  if (isLooping.value) {
    if (newTime < 0) {
      // Wrap to end of track
      newTime = duration.value + newTime
    } else if (newTime >= duration.value) {
      // Wrap to beginning
      newTime = newTime % duration.value
    }
  } else {
    // Non-looping mode - clamp to bounds
    newTime = Math.max(0, Math.min(newTime, duration.value - 0.1))
  }

  try {
    sound.value.seek(newTime)
    currentTime.value = newTime
  } catch (error) {
    console.warn('Seek operation failed:', error)
    // Reset to safe position
    currentTime.value = sound.value.seek() as number
  }
  emitPlaybackState()
}

const skip = (seconds: number) => {
  if (!sound.value || duration.value === 0) return

  const currentSeek = sound.value.seek() as number
  let newTime = currentSeek + seconds

  // Handle boundaries
  if (isLooping.value) {
    // Wrap around for looping
    if (newTime < 0) {
      newTime = duration.value + newTime
    } else if (newTime >= duration.value) {
      newTime = newTime % duration.value
    }
  } else {
    // Clamp for non-looping
    newTime = Math.max(0, Math.min(newTime, duration.value - 0.1))
  }

  currentTime.value = newTime
  seekAudio()
  emitPlaybackState()
}

const updateVolume = () => {
  if (sound.value) {
    sound.value.volume(volume.value)
  }
  emitPlaybackState()
}

const toggleLoop = () => {
  if (!sound.value) return
  const newLoop = !sound.value.loop()
  sound.value.loop(newLoop)
  isLooping.value = newLoop
  emitPlaybackState()
}

onBeforeUnmount(() => {
  if (sound.value) sound.value.unload()
  clearIntervalIfNeeded()
})
</script>
