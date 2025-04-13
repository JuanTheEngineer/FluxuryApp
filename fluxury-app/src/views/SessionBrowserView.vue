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
        <option value="created">Created</option>
        <option value="modified">Modified</option>
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
          :class="['border rounded p-4 cursor-pointer transition', selected?.id === session.id ? 'border-green-500 bg-green-50' : 'hover:border-blue-300']"
      >
        <img :src="session.image || '/default-artwork.jpg'" class="w-full h-40 object-cover mb-2" />
        <h3 class="font-semibold">{{ session.name }}</h3>
        <p class="text-sm text-gray-500">by {{ session.author || 'Unknown' }}</p>
        <p class="text-xs text-gray-400">Last edited {{ formatDate(session.modified) }}</p>
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

    <BeatPlayer v-if="selected?.beat" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSessions } from '../services/api'
import BeatPlayer from '../components/BeatPlayer.vue'

const sessions = ref([])
const selected = ref(null)
const search = ref('')
const sortKey = ref('modified')
const ascending = ref(false)
const router = useRouter()

onMounted(async () => {
  sessions.value = await getSessions()
})

const sortedFilteredSessions = computed(() => {
  let filtered = sessions.value.filter((s) =>
      s.name.toLowerCase().includes(search.value.toLowerCase())
  )
  return filtered.sort((a, b) => {
    const valA = a[sortKey.value]
    const valB = b[sortKey.value]
    return ascending.value ? valA.localeCompare(valB) : valB.localeCompare(valA)
  })
})

const toggleSelect = (session: any) => {
  selected.value = selected.value?.id === session.id ? null : session
}

const loadSession = () => {
  if (selected.value) router.push(`/session/${selected.value.id}`)
}

const formatDate = (d: string) => new Date(d).toLocaleString()
</script>
