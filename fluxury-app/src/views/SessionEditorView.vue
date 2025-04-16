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
      <select v-if="editMode" v-model="form.beat">
        <option v-for="b in beats" :value="b.id">{{ b.name }}</option>
      </select>
      <span v-else>{{ session?.beat }}</span>
    </div>

    <!-- Quill Editor -->
    <div ref="editorRef" class="bg-white border mt-4 min-h-[300px]" />

    <p class="text-sm text-green-500 mt-1 h-5">{{ saveStatus }}</p>

    <BeatPlayer />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Quill from 'quill'
import { getBeats } from '../services/api'
import {
  getSessionById,
  saveSessionMetadata,
  saveSessionScript,
  getSessionScript,
} from '../services/sessionApi'
import BeatPlayer from '../components/BeatPlayer.vue'

const route = useRoute()
const editorRef = ref()
const quill = ref<Quill>()
const beats = ref([])
const session = ref<any>()
const editMode = ref(false)
const form = reactive({ name: '', author: '', beat: '' })
const saveStatus = ref('')

let saveInterval: any = null

const backgroundStyle = computed(() => {
  if (!session.value?.image) return ''
  return {
    backgroundImage: `url(${session.value.image})`,
    backgroundSize: '100px 100px',
    backgroundRepeat: 'repeat',
  }
})

const loadSession = async () => {
  const id = route.params.id as string
  session.value = await getSessionById(id)
  Object.assign(form, session.value)
  const delta = await getSessionScript(id)
  quill.value = new Quill(editorRef.value, { theme: 'snow' })
  quill.value.setContents(delta)

  saveInterval = setInterval(() => {
    const delta = quill.value?.getContents()
    saveSessionScript(id, delta)
    saveStatus.value = 'Saved ✓'
    setTimeout(() => (saveStatus.value = ''), 2000)
  }, 5000)
}

const save = async () => {
  session.value = { ...session.value, ...form, modified: new Date().toISOString() }
  await saveSessionMetadata(session.value)
  editMode.value = false
}

const toggleEdit = () => {
  editMode.value = !editMode.value
}

onMounted(async () => {
  beats.value = await getBeats()
  await loadSession()
})

onUnmounted(() => clearInterval(saveInterval))
</script>
