<template>
  <div class="p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-slate-100">{{ authStore.isAuthenticated ? 'My Sessions' : 'Sessions' }}</h2>
      <RouterLink v-if="authStore.isAuthenticated" to="/session/new" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors">
        + New Session
      </RouterLink>
    </div>

    <!-- Resume card (auth only) -->
    <div v-if="authStore.isAuthenticated && sessions.length > 0" class="bg-surface-elevated border border-slate-700 rounded-xl p-4 flex items-center justify-between">
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

    <!-- Search -->
    <input v-model="search" placeholder="Search sessions..." class="bg-surface-elevated border border-slate-700 text-slate-100 placeholder-slate-500 px-3 py-2 rounded-lg w-full focus:outline-none focus:border-amber-500" />

    <!-- Empty state -->
    <div v-if="sortedFilteredSessions.length === 0" class="text-center py-16">
      <p class="text-slate-400 mb-2">No sessions yet</p>
      <RouterLink v-if="authStore.isAuthenticated" to="/beats" class="text-amber-500 text-sm hover:text-amber-400">
        Browse beats to start writing →
      </RouterLink>
    </div>

    <!-- Session cards -->
    <div class="flex flex-col gap-4">
      <div
          v-for="session in sortedFilteredSessions"
          :key="session.id"
          data-testid="session-card"
          @click="openSession(session)"
          class="rounded-xl overflow-hidden bg-surface-elevated border border-slate-700 cursor-pointer transition hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5"
      >
        <!-- Artwork or gradient placeholder -->
        <div class="w-full aspect-[3/1] relative overflow-hidden">
          <img
            v-if="session.artworkUrl"
            :src="session.artworkUrl"
            class="w-full h-full object-cover"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div v-else class="w-full h-full bg-gradient-to-br from-slate-800 via-slate-700 to-amber-900/30 flex items-center justify-center">
            <span class="text-3xl opacity-30">🎤</span>
          </div>
        </div>
        <div class="p-3">
          <h3 class="text-slate-100 font-semibold">{{ session.name }}</h3>
          <p class="text-slate-400 text-sm">{{ formatRelativeTime(session.modified) }}</p>
          <p v-if="session.beatId" class="text-xs text-amber-500/70 mt-1">
            🎵 {{ session.beatId.replace('beat-', '').replace(/-/g, ' ') }}
          </p>
          <p v-else class="text-xs text-slate-500 mt-1">No beat selected</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore'
import { useAuthStore } from '@/stores/authStore'
import type { SessionSummary } from '@/services/api'

const sessionStore = useSessionStore()
const authStore = useAuthStore()
const search = ref('')
const router = useRouter()

const sessions = computed(() => sessionStore.sessions)

onMounted(async () => {
  await sessionStore.fetchSessions()
})

const sortedFilteredSessions = computed(() => {
  const filtered = sessions.value.filter((s) =>
      s.name.toLowerCase().includes(search.value.toLowerCase())
  )
  // Sort by modified date, most recent first
  return [...filtered].sort((a, b) => {
    const valA = new Date(a.modified || a.created).getTime()
    const valB = new Date(b.modified || b.created).getTime()
    return valB - valA
  })
})

const openSession = (session: SessionSummary) => {
  router.push(`/session/${session.id}`)
}

const getBeatDisplayName = (beatUrl: string): string => {
  if (!beatUrl) return ''
  // Handle presigned S3 URLs — extract the beat name from the path
  try {
    const url = new URL(beatUrl)
    const pathParts = url.pathname.split('/')
    const beatFolder = pathParts.find(p => p.startsWith('beat-'))
    if (beatFolder) return beatFolder.replace('beat-', '').replace(/-/g, ' ')
  } catch {}
  // Fallback: just get filename
  return beatUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Beat'
}

const formatRelativeTime = (isoString: string): string => {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = now - then

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
</script>
