<template>
  <div class="p-4 max-w-3xl mx-auto pb-32">
    <!-- Offline indicator -->
    <div v-if="!isOnline" class="bg-amber-500/10 text-amber-400 text-xs px-3 py-1 rounded mb-2">
      Offline — changes saved locally
    </div>

    <!-- Back button -->
    <router-link to="/sessions" class="text-sm text-slate-400 hover:text-amber-500 transition-colors mb-2 inline-block">
      ← Back to Sessions
    </router-link>

    <!-- Error state -->
    <div v-if="lifecycleState === 'error'" class="text-center py-16">
      <p class="text-red-400 mb-4">Failed to load session</p>
      <button @click="retryLoad" class="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm">Retry</button>
    </div>

    <!-- Empty state -->
    <div v-else-if="lifecycleState === 'idle' && !route.params.id" class="text-center py-16">
      <p class="text-slate-400 mb-4">No Song Selected</p>
      <router-link to="/beats" class="text-amber-500 underline">Browse beats to start writing</router-link>
    </div>

    <!-- Loading state -->
    <div v-else-if="lifecycleState === 'loading'" class="text-center py-16">
      <p class="text-slate-400">Loading session...</p>
    </div>

    <!-- Editor (ready/editing/saving/saved states) -->
    <div v-else>
      <h1 class="text-xl font-bold text-slate-100">{{ session?.name }}</h1>

      <!-- Quill Editor -->
      <div ref="editorRef" data-testid="script-editor" class="bg-surface-elevated border border-slate-700 rounded-lg mt-4 min-h-[50vh] overflow-hidden" />

      <!-- Save Status (replaces old <p>) -->
      <SaveStatus
        :status="saveStatus"
        :lastSavedAt="lastSavedAt"
        :onRetry="handleRetry"
      />
    </div>

    <!-- Beat Player -->
    <BeatPlayer
      :beatUrl="session?.beatUrl"
      :initialPosition="resumeState?.beatPlaybackPosition"
      :initialVolume="resumeState?.beatVolume"
      :initialLoop="resumeState?.beatLooping"
      @beat-audible="onBeatAudible"
      @update:playbackState="onPlaybackStateUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { useSessionStore } from '@/stores/sessionStore'
import { useBeatStore } from '@/stores/beatStore'
import { useAutosave, type SaveStatus as SaveStatusType } from '@/composables/useAutosave'
import { useSessionLifecycle } from '@/composables/useSessionLifecycle'
import { useConnectivity } from '@/composables/useConnectivity'
import { useTimingMetrics } from '@/composables/useTimingMetrics'
import { localDraftService, type LocalDraft } from '@/services/localDraft'
import BeatPlayer from '@/components/BeatPlayer.vue'
import SaveStatus from '@/components/SaveStatus.vue'

const sessionStore = useSessionStore()
const beatStore = useBeatStore()
const route = useRoute()

// Composables
const { state: lifecycleState, transition } = useSessionLifecycle()
const { isOnline } = useConnectivity()
const { recordBeatAudible, recordEditorFocused, recordFirstSaveSuccess } = useTimingMetrics()

// Refs
const editorRef = ref<HTMLElement>()
const quill = ref<Quill>()
const session = ref<typeof sessionStore.activeSession>(null)
const currentDelta = ref<any>(null)
const resumeState = ref<LocalDraft | null>(null)

// Playback state tracking (for persist on save)
const latestPlaybackState = ref<{ position: number; volume: number; looping: boolean } | null>(null)

// Autosave integration
const { saveStatus, lastSavedAt, flush, destroy: destroyAutosave } = useAutosave({
  sessionId: computed(() => session.value?.id ?? ''),
  delta: currentDelta,
  saveFn: (id, delta) => sessionStore.saveScript(id, delta),
  getPlaybackState: () => ({
    cursorPosition: quill.value?.getSelection()?.index ?? 0,
    beatPlaybackPosition: latestPlaybackState.value?.position ?? 0,
    beatVolume: latestPlaybackState.value?.volume ?? 0.8,
    beatLooping: latestPlaybackState.value?.looping ?? true,
  }),
})

// Watch for first save success → record timing metric
watch(saveStatus, (status) => {
  if (status === 'saved') {
    recordFirstSaveSuccess()
  }
})

function onPlaybackStateUpdate(state: { position: number; volume: number; looping: boolean }) {
  latestPlaybackState.value = state
}

function onBeatAudible() {
  recordBeatAudible()
}

// --- Session loading with Last_Write_Wins ---
async function loadSession() {
  const id = route.params.id as string
  if (!id) return

  transition('loading')

  try {
    // Fetch from server
    await sessionStore.loadSession(id)
    session.value = sessionStore.activeSession
    if (!session.value) {
      transition('error')
      return
    }

    // Fetch local draft for comparison
    const localDraft = await localDraftService.get(id)
    resumeState.value = localDraft

    // Parse server delta
    let serverDelta: any = { ops: [{ insert: '\n' }] }
    let serverTimestamp = 0
    try {
      if (session.value.script?.startsWith('data:application/json;base64,')) {
        const base64Data = session.value.script.split(',')[1]
        const scriptData = atob(base64Data)
        const parsed = JSON.parse(scriptData)
        if (parsed.delta) {
          serverDelta = parsed.delta
          serverTimestamp = parsed.editTimestamp || 0
        } else {
          serverDelta = parsed
        }
      }
    } catch {
      serverDelta = { ops: [{ insert: 'Welcome to FluxuryApp!\n\nStart writing your lyrics here...\n' }] }
    }

    // Last_Write_Wins: pick newer of server vs local draft
    let selectedDelta = serverDelta
    let cursorPosition = 0
    if (localDraft && localDraft.editTimestamp > serverTimestamp) {
      selectedDelta = localDraft.delta
      cursorPosition = localDraft.cursorPosition || 0
    }

    // Transition to ready BEFORE mounting Quill so the v-else block renders the editor container
    transition('ready')
    await nextTick()

    // Initialize Quill
    quill.value = new Quill(editorRef.value!, { theme: 'snow' })
    quill.value.setContents(selectedDelta)

    // Set cursor position (wrapped in try/catch — Quill may not be ready for selection immediately)
    try {
      if (cursorPosition > 0) {
        quill.value.setSelection(cursorPosition, 0)
      } else {
        const length = quill.value.getLength()
        quill.value.setSelection(length - 1, 0)
      }
    } catch {
      // Quill selection can fail if DOM isn't fully ready; cursor will default to start
    }

    // Auto-focus the editor
    quill.value.focus()
    recordEditorFocused()

    // Wire Quill text-change to update currentDelta ref
    quill.value.on('text-change', () => {
      currentDelta.value = quill.value!.getContents()
    })

    // Expose test helper for E2E testing (Quill 2.x has selection issues in headless browsers)
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      ;(window as any).__simulateEdit = () => {
        // Directly set the delta ref to simulate a user edit triggering autosave
        currentDelta.value = { ops: [{ insert: 'e2e test content\n' }] }
      }
    }

  } catch (error) {
    console.error('Failed to load session:', error)
    transition('error')
  }
}

// --- Retry ---
function retryLoad() {
  loadSession()
}

function handleRetry() {
  flush()
}

// --- Space-key for BeatPlayer toggle ---
function handleKeydown(e: KeyboardEvent) {
  if (e.code === 'Space' && !editorRef.value?.contains(document.activeElement)) {
    e.preventDefault()
    // BeatPlayer handles its own play/pause via its UI;
    // this prevents page scroll when editor is not focused
  }
}

// --- Route leave flush ---
onBeforeRouteLeave(async () => {
  await flush()
})

// --- Lifecycle ---
onMounted(async () => {
  await beatStore.fetchBeats()
  await loadSession()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  destroyAutosave()
  document.removeEventListener('keydown', handleKeydown)
})
</script>
