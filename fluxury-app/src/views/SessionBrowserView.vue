<template>
  <div class="p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-slate-100">My Sessions</h2>
      <RouterLink to="/session/new" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors">
        Create New Session
      </RouterLink>
    </div>

    <div v-if="sessions.length > 0" class="bg-surface-elevated border border-slate-700 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-400">Continue where you left off</p>
        <p class="text-slate-100 font-medium">{{ sessions[0]?.name }}</p>
      </div>
      <button
        @click="openSession(sessions[0])"
        class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors"
      >
        Resume
      </button>
    </div>

    <div class="flex items-center gap-3">
      <input v-model="search" placeholder="Search..." class="bg-surface-elevated border border-slate-700 text-slate-100 placeholder-slate-500 px-3 py-2 rounded-lg w-full focus:outline-none focus:border-amber-500" />
      <select v-model="sortKey" class="bg-surface-elevated border border-slate-700 text-slate-100 px-2 py-2 rounded-lg focus:outline-none focus:border-amber-500">
        <option value="name">Name</option>
        <option value="created">Created</option>
        <option value="modified">Modified</option>
      </select>
      <button @click="ascending = !ascending" class="text-sm text-amber-500 whitespace-nowrap">
        {{ ascending ? '↑ Asc' : '↓ Desc' }}
      </button>
    </div>

    <div class="flex flex-col gap-4">
      <div
          v-for="session in sortedFilteredSessions"
          :key="session.id"
          data-testid="session-card"
          @click="openSession(session)"
          class="rounded-xl overflow-hidden bg-surface-elevated border border-slate-700 cursor-pointer transition hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5"
      >
        <img
          :src="session.artworkUrl || '/default-artwork.jpg'"
          class="w-full aspect-[4/3] object-cover"
          @error="($event.target as HTMLImageElement).src = '/default-artwork.jpg'"
        />
        <div class="p-3">
          <h3 class="text-slate-100 font-semibold">{{ session.name }}</h3>
          <p class="text-slate-400 text-sm">{{ formatRelativeTime(session.modified) }}</p>
          <p v-if="session.beatUrl" class="text-xs text-amber-500/70 mt-1">
            🎵 {{ session.beatUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore'
import type { SessionSummary } from '@/services/api'

const sessionStore = useSessionStore()
const search = ref('')
const sortKey = ref<'name' | 'created' | 'modified'>('modified')
const ascending = ref(false)
const router = useRouter()

const sessions = computed(() => sessionStore.sessions)

onMounted(async () => {
  await sessionStore.fetchSessions()
})

const sortedFilteredSessions = computed(() => {
  const filtered = sessions.value.filter((s) =>
      s.name.toLowerCase().includes(search.value.toLowerCase())
  )
  return [...filtered].sort((a, b) => {
    const key = sortKey.value
    if (key === 'name') {
      return ascending.value
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    }
    const valA = new Date(a[key]).getTime()
    const valB = new Date(b[key]).getTime()
    return ascending.value ? valA - valB : valB - valA
  })
})

const openSession = (session: SessionSummary) => {
  router.push(`/session/${session.id}`)
}

const formatRelativeTime = (isoString: string): string => {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = now - then

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`

  const years = Math.floor(months / 12)
  return `${years} year${years > 1 ? 's' : ''} ago`
}
</script>
