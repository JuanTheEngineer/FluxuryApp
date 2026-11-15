<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useBeatStore } from '@/stores/beatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useAuthStore } from '@/stores/authStore'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import BeatPlayer from '@/components/BeatPlayer.vue'
import type { CreateBeatRequestContent } from '@/services/api'

const store = useBeatStore()
const sessionStore = useSessionStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { beats, selectedBeat } = storeToRefs(store)

// Arrived via "+ New Session": the page's job is picking a beat for a new session
const isNewSessionFlow = computed(() => route.query.new === '1')
const isCreating = ref(false)

const url = ref('')
const showForm = ref(false)
const search = ref('')
const isSubmitting = ref(false)
const showDeleteConfirm = ref<string | null>(null)

const filtered = computed(() =>
    beats.value.filter((b: any) =>
        b.name.toLowerCase().includes(search.value.toLowerCase())
    )
)

const submitUrl = async () => {
  isSubmitting.value = true
  try {
    const isLocal = window.location.hostname === 'localhost'
    if (isLocal) {
      const response = await fetch('http://localhost:3001/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.value }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Download failed')
      }
    } else {
      const { createAuthenticatedClient } = await import('@/api/auth-interceptor')
      const client = createAuthenticatedClient()
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
      await client.post(`${apiBase}/beats/from-url`, { url: url.value })
    }
    await store.fetchBeats()
    url.value = ''
    showForm.value = false
  } catch (err: any) {
    console.error('Failed to add beat:', err)
    alert(err.message || 'Error adding beat. Make sure it is a valid YouTube URL.')
  } finally {
    isSubmitting.value = false
  }
}

const select = (beat: any) => {
  if (beat.status === 'pending_download' || beat.status === 'downloading' || beat.status === 'failed') return
  store.selectBeat(selectedBeat.value?.id === beat.id ? null : beat)
}

const startSessionWithBeat = async () => {
  if (!selectedBeat.value || isCreating.value) return
  isCreating.value = true
  try {
    const id = await sessionStore.createSession({
      name: selectedBeat.value.name,
      beatId: selectedBeat.value.id,
    })
    if (id) router.push(`/session/${id}`)
  } finally {
    isCreating.value = false
  }
}

const startSessionWithoutBeat = async () => {
  if (isCreating.value) return
  isCreating.value = true
  try {
    const id = await sessionStore.createSession({ name: 'Untitled Session' })
    if (id) router.push(`/session/${id}`)
  } finally {
    isCreating.value = false
  }
}

const deleteBeat = async (beatId: string) => {
  try {
    const isLocal = window.location.hostname === 'localhost'
    if (isLocal) {
      await fetch(`http://localhost:3001/api/beats/${beatId}`, { method: 'DELETE' })
    } else {
      const { createAuthenticatedClient } = await import('@/api/auth-interceptor')
      const client = createAuthenticatedClient()
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
      await client.delete(`${apiBase}/beats/${beatId}`)
    }
    if (selectedBeat.value?.id === beatId) store.selectBeat(null)
    await store.fetchBeats()
    showDeleteConfirm.value = null
  } catch (err) {
    console.error('Failed to delete beat:', err)
  }
}

onMounted(() => {
  store.fetchBeats()
})
</script>

<template>
  <div class="p-4 pb-48">
    <div class="flex justify-between items-start gap-3 mb-4">
      <div>
        <h1 class="text-xl font-bold text-slate-100">{{ isNewSessionFlow ? 'Pick a beat' : 'Beats' }}</h1>
        <p v-if="isNewSessionFlow" class="text-sm text-slate-400 mt-0.5">for your new session</p>
      </div>
      <button
        v-if="isNewSessionFlow && authStore.isAuthenticated"
        @click="startSessionWithoutBeat"
        :disabled="isCreating"
        class="text-sm text-slate-300 border border-slate-600 px-3 py-2 rounded-lg hover:border-amber-500 hover:text-amber-400 transition-colors disabled:opacity-40 flex-shrink-0"
      >
        {{ isCreating ? 'Creating…' : 'Write without a beat' }}
      </button>
    </div>

    <!-- Add beat button -->
    <button
        v-if="authStore.isAuthenticated"
        @click="showForm = !showForm"
        class="mb-4 bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors"
    >
      {{ showForm ? 'Close' : '+ Add Beat from YouTube' }}
    </button>

    <!-- Add beat form -->
    <form v-if="showForm" @submit.prevent="submitUrl" class="mb-4 bg-surface-elevated border border-slate-700 p-4 rounded-xl">
      <input v-model="url" placeholder="Paste YouTube URL..." class="bg-surface border border-slate-700 text-slate-100 placeholder-slate-500 p-2 w-full mb-2 rounded-lg focus:outline-none focus:border-amber-500" required />
      <p class="text-xs text-slate-500 mb-2">Works best when running locally (npm start in fluxury-server)</p>
      <button :disabled="isSubmitting" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40">
        {{ isSubmitting ? 'Downloading...' : 'Add Beat' }}
      </button>
    </form>

    <!-- Search -->
    <input v-model="search" placeholder="Search beats..." class="bg-surface-elevated border border-slate-700 text-slate-100 placeholder-slate-500 p-2 w-full mb-4 rounded-lg focus:outline-none focus:border-amber-500" />

    <!-- Beat list -->
    <div class="bg-surface-elevated rounded-xl border border-slate-700 divide-y divide-slate-700">
      <div
          v-for="beat in filtered"
          :key="beat.id"
          @click="select(beat)"
          class="p-3 transition-colors flex items-center gap-3 relative"
          :class="{
            'bg-amber-500/10 border-l-2 border-amber-500 cursor-pointer': selectedBeat?.id === beat.id,
            'opacity-50 cursor-not-allowed': beat.status === 'pending_download' || beat.status === 'downloading' || beat.status === 'failed',
            'cursor-pointer hover:bg-slate-700/50': beat.status !== 'pending_download' && beat.status !== 'downloading' && beat.status !== 'failed'
          }"
      >
        <!-- Thumbnail -->
        <img
          v-if="beat.thumbnailUrl"
          :src="beat.thumbnailUrl"
          class="w-12 h-12 rounded object-cover flex-shrink-0"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
        <div v-else class="w-12 h-12 rounded bg-slate-700 flex items-center justify-center flex-shrink-0">
          <span class="text-lg">🎵</span>
        </div>

        <!-- Info -->
        <div class="min-w-0 flex-1">
          <p class="text-slate-200 font-medium truncate" :class="{ 'text-amber-400': selectedBeat?.id === beat.id }">{{ beat.name }}</p>
          <p v-if="beat.creator" class="text-xs text-slate-500 truncate">
            <a v-if="beat.creatorUrl" :href="beat.creatorUrl" target="_blank" @click.stop class="hover:text-amber-500">{{ beat.creator }}</a>
            <span v-else>{{ beat.creator }}</span>
          </p>
          <p v-if="beat.duration" class="text-xs text-slate-600">{{ Math.floor(beat.duration / 60) }}:{{ String(beat.duration % 60).padStart(2, '0') }}</p>
          <p v-if="beat.status === 'pending_download' || beat.status === 'downloading'" class="text-xs text-amber-500">⏳ Downloading audio...</p>
          <p v-else-if="beat.status === 'failed'" class="text-xs text-red-400">❌ Download failed</p>
        </div>

        <!-- Delete button -->
        <button
          v-if="authStore.isAuthenticated"
          @click.stop="showDeleteConfirm = showDeleteConfirm === beat.id ? null : beat.id"
          class="text-slate-600 hover:text-red-400 p-1 transition-colors flex-shrink-0"
        >
          ✕
        </button>

        <!-- Delete confirmation -->
        <div
          v-if="showDeleteConfirm === beat.id"
          class="absolute right-2 top-1/2 -translate-y-1/2 bg-surface border border-red-500/50 rounded-lg px-3 py-2 flex gap-2 items-center shadow-lg z-10"
          @click.stop
        >
          <span class="text-xs text-slate-300">Delete?</span>
          <button @click="deleteBeat(beat.id)" class="text-xs bg-red-500 text-white px-2 py-1 rounded">Yes</button>
          <button @click="showDeleteConfirm = null" class="text-xs text-slate-400">No</button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="filtered.length === 0" class="text-center py-8 text-slate-500">
      <p>No beats yet</p>
      <p v-if="authStore.isAuthenticated" class="text-sm mt-1">Add beats from YouTube to get started</p>
    </div>

    <!-- Write to this beat button (fixed above player) — REMOVED, moved to BeatPlayer -->

    <!-- Beat Player with write action -->
    <BeatPlayer :beatUrl="selectedBeat?.path" :showWriteButton="!!selectedBeat && authStore.isAuthenticated" @start-session="startSessionWithBeat" />
  </div>
</template>
