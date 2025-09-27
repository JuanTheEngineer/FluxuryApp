<template>
  <div class="relative p-8" :style="backgroundStyle">
    <div class="flex justify-between items-center mb-4">
      <input v-if="editMode" v-model="form.name" class="text-2xl font-bold border px-2" />
      <h2 v-else class="text-2xl font-bold">{{ session?.name }}</h2>

      <div>
        <button @click="toggleEdit" class="bg-blue-500 text-white px-3 py-1 rounded">
          {{ editMode ? 'Cancel' : 'Edit' }}
        </button>
        <button
            v-if="editMode"
            @click="save"
            class="ml-2 bg-green-600 text-white px-3 py-1 rounded"
        >
          Save
        </button>
      </div>
    </div>

    <p class="italic">
      by
      <input v-if="editMode" v-model="form.author" class="border px-2 py-1" />
      <span v-else>{{ session?.author || 'Unknown' }}</span>
    </p>

    <div class="my-2">
      <span class="mr-2">🎵</span>
      <select v-if="editMode" v-model="form.beatUrl">
        <option v-for="b in beats" :value="b.path">{{ b.name }}</option>
      </select>
      <span v-else>{{ session?.beatUrl }}</span>
    </div>

    <!-- Quill Editor -->
    <div ref="editorRef" class="bg-white border mt-4 min-h-[300px]" />

    <p class="text-sm text-green-500 mt-1 h-5">{{ saveStatus }}</p>

    <BeatPlayer :beatUrl="session?.beatUrl" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Quill from 'quill'
import { beatsApi, sessionsApi } from '@/api/api-clients'
import type { GetSessionResponseContent, UpdateSessionRequestContent } from '@/api/open-api/session-client'
import type { BeatSummary } from '@/api/open-api/beat-client'
import BeatPlayer from '@/components/BeatPlayer.vue'

const route = useRoute()
const editorRef = ref()
const quill = ref<Quill>()
const beats = ref<BeatSummary[]>([])
const session = ref<GetSessionResponseContent | null>(null)
const editMode = ref(false)
const form = reactive<{ name: string; author: string; beatUrl: string }>({
  name: '',
  author: '',
  beatUrl: '',
})
const saveStatus = ref('')
let saveInterval: any = null

const backgroundStyle = computed(() => {
  if (!session.value?.artworkUrl) return ''
  return {
    backgroundImage: `url(${session.value.artworkUrl})`,
    backgroundSize: '100px 100px',
    backgroundRepeat: 'repeat',
  }
})

const loadSession = async () => {
  const id = route.params.id as string
  const res = await sessionsApi.getSession(id)
  session.value = res.data
  Object.assign(form, res.data)

  quill.value = new Quill(editorRef.value, { theme: 'snow' })
  const scriptRes = await fetch(res.data.script)
  const delta = await scriptRes.json()
  quill.value.setContents(delta)

  saveInterval = setInterval(() => {
    const delta = quill.value?.getContents()
    if (delta && session.value) {
      const blob = new Blob([JSON.stringify(delta)], { type: 'application/json' })
      const file = new File([blob], 'script.json')
      // TODO: Replace this with your actual S3 upload logic and update URL
      console.log('Would upload file:', file)
      saveStatus.value = 'Saved ✓'
      setTimeout(() => (saveStatus.value = ''), 2000)
    }
  }, 5000)
}

const save = async () => {
  if (!session.value) return
  const id = session.value.id
  const payload: UpdateSessionRequestContent = {
    name: form.name,
    artworkUrl: session.value.artworkUrl,
    script: session.value.script, // assume unchanged for now
    beatUrl: form.beatUrl,
  }
  const res = await sessionsApi.updateSession(id, payload)
  session.value = res.data
  editMode.value = false
}

const toggleEdit = () => {
  editMode.value = !editMode.value
}

onMounted(async () => {
  const beatsRes = await beatsApi.listBeats()
  beats.value = beatsRes.data.beats
  await loadSession()
})

onUnmounted(() => clearInterval(saveInterval))
</script>