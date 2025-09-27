<template>
  <div class="p-6 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-2xl font-bold">My Sessions</h2>
      <RouterLink to="/session/new" class="bg-indigo-600 text-white px-4 py-2 rounded">
        Create New Session
      </RouterLink>
    </div>

    <div class="flex items-center gap-4">
      <input v-model="search" placeholder="Search..." class="border px-3 py-2 rounded w-full" />
      <select v-model="sortKey" class="border px-2 py-1 rounded">
        <option value="name">Name</option>
        <option value="createdTime">Created</option>
        <option value="modifiedTime">Modified</option>
      </select>
      <button @click="ascending = !ascending" class="text-sm text-blue-600 underline">
        {{ ascending ? '↑ Asc' : '↓ Desc' }}
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
          v-for="session in sortedFilteredSessions"
          :key="session.id"
          @click="toggleSelect(session)"
          :class="[
          'border rounded p-4 cursor-pointer transition',
          selected?.id === session.id ? 'border-green-500 bg-green-50' : 'hover:border-blue-300',
        ]"
      >
        <img :src="session.artworkUrl || '/default-artwork.jpg'" class="w-full h-40 object-cover mb-2" />
        <h3 class="font-semibold">{{ session.name }}</h3>
        <p class="text-xs text-gray-400">Last edited {{ formatDate(session.modifiedTime) }}</p>
      </div>
    </div>

    <button
        :disabled="!selected"
        @click="loadSession"
        class="px-4 py-2 rounded text-white"
        :class="selected ? 'bg-green-600 hover:bg-green-700' : 'bg-green-300 cursor-not-allowed'"
    >
      Load Session
    </button>

    <BeatPlayer :beatUrl="selected?.beatUrl" v-if="selected?.beatUrl" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { sessionsApi } from '@/api/api-clients'
import BeatPlayer from '@/components/BeatPlayer.vue'
import type { SessionSummary, GetSessionResponseContent } from '@/api/open-api/session-client'

const sessions = ref<SessionSummary[]>([])
const selected = ref<GetSessionResponseContent | null>(null)
const search = ref('')
const sortKey = ref<'name' | 'createdTime' | 'modifiedTime'>('modifiedTime')
const ascending = ref(false)
const router = useRouter()

onMounted(async () => {
  try {
    const res = await sessionsApi.listSessions()
    sessions.value = res.data.sessions
  } catch (err) {
    console.error('Failed to load sessions:', err)
  }
})

const sortedFilteredSessions = computed(() => {
  const filtered = sessions.value.filter((s) =>
      s.name.toLowerCase().includes(search.value.toLowerCase())
  )
  return [...filtered].sort((a, b) => {
    const valA = a[sortKey.value]
    const valB = b[sortKey.value]
    return ascending.value ? valA - valB : valB - valA
  })
})

const toggleSelect = async (session: SessionSummary) => {
  if (selected.value?.id === session.id) {
    selected.value = null
  } else {
    try {
      const res = await sessionsApi.getSession(session.id)
      selected.value = res.data
    } catch (err) {
      console.error('Failed to load session details:', err)
    }
  }
}

const loadSession = () => {
  if (selected.value) router.push(`/session/${selected.value.id}`)
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString()
</script>
