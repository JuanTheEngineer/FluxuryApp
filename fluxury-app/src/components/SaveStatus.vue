<template>
  <div data-testid="save-status" class="flex items-center gap-2 text-xs h-5">
    <span v-if="status === 'saving'" class="text-amber-400">Saving…</span>
    <span v-else-if="status === 'saved'" class="text-slate-400">{{ elapsedLabel }}</span>
    <span v-else-if="status === 'offline_saved_locally'" class="text-amber-500">Offline — saved locally</span>
    <span v-else-if="status === 'error'" class="text-red-400">
      Save failed
      <button @click="onRetry" class="ml-2 underline hover:text-red-300">Retry</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { SaveStatus } from '@/composables/useAutosave'

interface Props {
  status: SaveStatus
  lastSavedAt: number | null
  onRetry?: () => void
}

const props = defineProps<Props>()

// --- Elapsed time computation ---

function computeElapsed(lastSavedAt: number | null): string {
  if (!lastSavedAt) return 'Saved · just now'
  const diff = Date.now() - lastSavedAt
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return 'Saved · just now'
  if (seconds < 60) return `Saved · ${seconds} seconds ago`
  const minutes = Math.floor(seconds / 60)
  return `Saved · ${minutes} minute${minutes > 1 ? 's' : ''} ago`
}

const elapsedLabel = ref(computeElapsed(props.lastSavedAt))

// --- 30-second interval to refresh elapsed label while saved ---

let intervalId: ReturnType<typeof setInterval> | null = null

function startInterval() {
  stopInterval()
  elapsedLabel.value = computeElapsed(props.lastSavedAt)
  intervalId = setInterval(() => {
    elapsedLabel.value = computeElapsed(props.lastSavedAt)
  }, 30000)
}

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

// --- Watch status to start/stop interval ---

watch(
  () => props.status,
  (newStatus) => {
    if (newStatus === 'saved') {
      startInterval()
    } else {
      stopInterval()
    }
  },
  { immediate: true }
)

// --- Watch lastSavedAt to recompute elapsed immediately ---

watch(
  () => props.lastSavedAt,
  () => {
    if (props.status === 'saved') {
      elapsedLabel.value = computeElapsed(props.lastSavedAt)
    }
  }
)

// --- Cleanup on unmount ---

onBeforeUnmount(() => {
  stopInterval()
})
</script>
