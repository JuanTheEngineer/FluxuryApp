<template>
  <div class="p-4 max-w-3xl mx-auto pb-32">
    <router-link to="/sessions" class="text-sm text-slate-400 hover:text-amber-500 transition-colors mb-2 inline-block">
      ← Back to Sessions
    </router-link>
    <h1 class="text-xl font-bold text-slate-100">{{ session?.name }}</h1>

    <!-- Quill Editor -->
    <div ref="editorRef" data-testid="script-editor" class="bg-surface-elevated border border-slate-700 rounded-lg mt-4 min-h-[50vh] overflow-hidden" />

    <p data-testid="autosave-status" class="text-xs text-slate-400 mt-2 h-5">{{ saveStatus }}</p>

    <BeatPlayer :beatUrl="session?.beatUrl" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { useSessionStore } from '@/stores/sessionStore'
import { useBeatStore } from '@/stores/beatStore'
import BeatPlayer from '@/components/BeatPlayer.vue'

const sessionStore = useSessionStore()
const beatStore = useBeatStore()

const route = useRoute()
const editorRef = ref()
const quill = ref<Quill>()
const session = ref<typeof sessionStore.activeSession>(null)
const saveStatus = ref('')
let saveInterval: any = null

const loadSession = async () => {
  const id = route.params.id as string
  await sessionStore.loadSession(id)
  session.value = sessionStore.activeSession
  if (!session.value) return

  quill.value = new Quill(editorRef.value, { theme: 'snow' })

  // Load script content
  let delta = {}
  try {
    if (session.value.script && session.value.script.startsWith('data:application/json;base64,')) {
      const base64Data = session.value.script.split(',')[1]
      const scriptData = atob(base64Data)
      delta = JSON.parse(scriptData)
    } else if (session.value.script) {
      // Fetch script content from URL (works for both mock and real paths)
      const scriptRes = await fetch(session.value.script)
      delta = await scriptRes.json()
    }
  } catch (error) {
    console.warn('Failed to load script, starting with empty content:', error)
    delta = { ops: [{ insert: 'Welcome to FluxuryApp!\n\nStart writing your lyrics here...\n' }] }
  }

  quill.value.setContents(delta)

  saveInterval = setInterval(async () => {
    const delta = quill.value?.getContents()
    if (delta && session.value) {
      try {
        saveStatus.value = 'Saving...'

        await sessionStore.saveScript(session.value.id, delta)

        saveStatus.value = 'Saved ✓'
        setTimeout(() => (saveStatus.value = ''), 2000)
      } catch (error) {
        console.error('Auto-save failed:', error)
        saveStatus.value = 'Save failed ✗'
        setTimeout(() => (saveStatus.value = ''), 3000)
      }
    }
  }, 10000) // Increased to 10 seconds to reduce API calls
}

onMounted(async () => {
  await beatStore.fetchBeats()
  await loadSession()
})

onUnmounted(() => clearInterval(saveInterval))
</script>
