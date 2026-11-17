<template>
  <div class="p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-slate-100">{{ authStore.isAuthenticated ? 'My Sessions' : 'Sessions' }}</h2>
      <RouterLink v-if="authStore.isAuthenticated" :to="{ path: '/beats', query: { new: '1' } }" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors">
        + New Session
      </RouterLink>
    </div>

    <!-- Resume card (auth only) -->
    <div v-if="authStore.isAuthenticated && lastEditedSession" class="bg-surface-elevated border border-slate-700 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-400">Continue where you left off</p>
        <p class="text-slate-100 font-medium">{{ lastEditedSession.name }}</p>
      </div>
      <button
        @click="openSession(lastEditedSession)"
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

    <!-- Undo bar for a session just deleted from the editor, or why a delete failed -->
    <div
      v-if="deletion.pending || deletion.error"
      role="status"
      aria-live="polite"
      data-testid="delete-status"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-700 bg-surface-elevated text-slate-100 shadow-2xl px-4 py-3 flex items-center gap-3"
    >
      <template v-if="deletion.pending">
        <p class="text-sm flex-1 min-w-0 truncate">Deleted “{{ deletion.pending.name }}”</p>
        <button
          type="button"
          data-testid="undo-delete"
          @click="deletion.undo()"
          class="text-sm font-semibold text-amber-400 hover:text-amber-300 px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Undo
        </button>
      </template>
      <p v-else class="text-sm flex-1 text-red-300">{{ deletion.error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore'
import { useAuthStore } from '@/stores/authStore'
import { useSessionDeletionStore } from '@/stores/sessionDeletionStore'
import type { SessionSummary } from '@/services/api'

const sessionStore = useSessionStore()
const authStore = useAuthStore()
const deletion = useSessionDeletionStore()
const search = ref('')
const router = useRouter()

const sessions = computed(() => sessionStore.sessions)

// Deletes start in the editor (⋯ menu); this list shows their Undo bar.
// Leaving the list means the user moved on: commit a pending delete now.
onBeforeUnmount(() => {
  void deletion.flush()
})

const visibleSessions = computed(() => sessions.value.filter((s) => !deletion.isHidden(s.id)))

const editedAt = (s: SessionSummary) => new Date(s.modified || s.created).getTime()

// Most recently edited first. The resume card and the list both read this, so
// "Continue where you left off" is always the top card (ignoring search).
const recentSessions = computed(() => [...visibleSessions.value].sort((a, b) => editedAt(b) - editedAt(a)))
const lastEditedSession = computed(() => recentSessions.value[0] ?? null)

onMounted(async () => {
  await sessionStore.fetchSessions()
})

const sortedFilteredSessions = computed(() => {
  const query = search.value.toLowerCase()
  return recentSessions.value.filter((s) => s.name.toLowerCase().includes(query))
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
