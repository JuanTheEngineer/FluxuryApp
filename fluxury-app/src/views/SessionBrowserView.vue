<template>
  <div class="p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-slate-100">{{ authStore.isAuthenticated ? 'My Sessions' : 'Sessions' }}</h2>
      <RouterLink v-if="authStore.isAuthenticated" :to="{ path: '/beats', query: { new: '1' } }" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors">
        + New Session
      </RouterLink>
    </div>

    <!-- Resume card (auth only) -->
    <div v-if="authStore.isAuthenticated && visibleSessions.length > 0" class="bg-surface-elevated border border-slate-700 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-400">Continue where you left off</p>
        <p class="text-slate-100 font-medium">{{ visibleSessions[0]?.name }}</p>
      </div>
      <button
        @click="openSession(visibleSessions[0])"
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

          <!-- Delete: always visible (no hover-only controls on touch), undoable for 5s -->
          <button
            v-if="authStore.isAuthenticated"
            type="button"
            data-testid="delete-session"
            :aria-label="`Delete ${session.name}`"
            :title="`Delete ${session.name}`"
            @click.stop="deleter.request(session)"
            class="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/50 text-slate-200 flex items-center justify-center transition-colors hover:bg-red-500/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
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

    <!-- Undo bar for a just-deleted session, or why a delete failed -->
    <div
      v-if="deleter.pending.value || deleteError"
      role="status"
      aria-live="polite"
      data-testid="delete-status"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-700 bg-surface-elevated text-slate-100 shadow-2xl px-4 py-3 flex items-center gap-3"
    >
      <template v-if="deleter.pending.value">
        <p class="text-sm flex-1 min-w-0 truncate">Deleted “{{ deleter.pending.value.name }}”</p>
        <button
          type="button"
          data-testid="undo-delete"
          @click="deleter.undo()"
          class="text-sm font-semibold text-amber-400 hover:text-amber-300 px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Undo
        </button>
      </template>
      <p v-else class="text-sm flex-1 text-red-300">{{ deleteError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore'
import { useAuthStore } from '@/stores/authStore'
import { useUndoableDelete } from '@/composables/useUndoableDelete'
import type { SessionSummary } from '@/services/api'

const sessionStore = useSessionStore()
const authStore = useAuthStore()
const search = ref('')
const router = useRouter()

const sessions = computed(() => sessionStore.sessions)

// --- Delete with undo ---
const deleteError = ref<string | null>(null)
let deleteErrorTimer: ReturnType<typeof setTimeout> | null = null

const deleter = useUndoableDelete<SessionSummary>({
  commit: async (session) => {
    if (!(await sessionStore.deleteSession(session.id))) {
      throw new Error(sessionStore.error ?? 'Failed to delete session')
    }
  },
  onError: (session) => {
    deleteError.value = `Couldn't delete “${session.name}”. It's back in your list.`
    if (deleteErrorTimer) clearTimeout(deleteErrorTimer)
    deleteErrorTimer = setTimeout(() => { deleteError.value = null }, 6000)
  },
})

// Leaving the list means the user moved on: commit the pending delete now.
onBeforeUnmount(() => {
  void deleter.flush()
  if (deleteErrorTimer) clearTimeout(deleteErrorTimer)
})

const visibleSessions = computed(() => sessions.value.filter((s) => !deleter.isHidden.value(s.id)))

onMounted(async () => {
  await sessionStore.fetchSessions()
})

const sortedFilteredSessions = computed(() => {
  const filtered = visibleSessions.value.filter((s) =>
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
