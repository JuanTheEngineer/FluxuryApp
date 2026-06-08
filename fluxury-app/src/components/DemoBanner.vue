<template>
  <div
    v-if="isDemoMode"
    class="bg-amber-500/10 text-amber-400 px-4 py-2 text-sm flex items-center justify-between"
  >
    <span>DEMO MODE — credentials are not real, data resets on reload</span>
    <button
      data-testid="reset-demo-data"
      :disabled="resetting"
      class="ml-4 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      @click="handleReset"
    >
      {{ resetting ? 'Resetting…' : 'Reset demo data' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { isDemoMode, resetMockBackend } from '@/services/api'

const resetting = ref(false)

async function handleReset() {
  resetting.value = true
  try {
    await resetMockBackend()
  } finally {
    resetting.value = false
  }
}
</script>
