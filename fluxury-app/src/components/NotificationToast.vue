<template>
  <div
    v-if="visible"
    :class="[
      'fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300',
      typeClasses,
      visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    ]"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center">
        <span class="mr-2">{{ typeIcon }}</span>
        <p class="text-sm font-medium">{{ message }}</p>
      </div>
      <button
        @click="close"
        class="ml-4 text-white hover:text-gray-200 focus:outline-none"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  duration: 5000,
  visible: false
})

const emit = defineEmits<{
  close: []
}>()

const visible = ref(props.visible)

const typeClasses = computed(() => {
  switch (props.type) {
    case 'success':
      return 'bg-green-500 text-white'
    case 'error':
      return 'bg-red-500 text-white'
    case 'warning':
      return 'bg-yellow-500 text-white'
    case 'info':
      return 'bg-blue-500 text-white'
    default:
      return 'bg-gray-500 text-white'
  }
})

const typeIcon = computed(() => {
  switch (props.type) {
    case 'success':
      return '✓'
    case 'error':
      return '✗'
    case 'warning':
      return '⚠'
    case 'info':
      return 'ℹ'
    default:
      return ''
  }
})

const close = () => {
  visible.value = false
  setTimeout(() => {
    emit('close')
  }, 300)
}

// Auto-close after duration
let autoCloseTimer: number | null = null

watch(() => props.visible, (newVisible) => {
  visible.value = newVisible

  if (newVisible && props.duration > 0) {
    // Clear existing timer
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer)
    }

    // Set new timer
    autoCloseTimer = setTimeout(() => {
      close()
    }, props.duration)
  }
}, { immediate: true })

// Clean up timer on unmount
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
  }
})
</script>