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
      <!-- Editable session title -->
      <div class="flex items-center gap-2 mb-2">
        <input
          v-if="authStore.isAuthenticated && isEditingTitle"
          v-model="editableTitle"
          @blur="saveTitle"
          @keydown.enter="saveTitle"
          ref="titleInput"
          class="text-xl font-bold text-slate-100 bg-transparent border-b border-amber-500 outline-none w-full"
        />
        <h1
          v-else
          class="text-xl font-bold text-slate-100 cursor-pointer hover:text-amber-500 transition-colors"
          :class="{ 'cursor-default': !authStore.isAuthenticated }"
          @click="startEditTitle"
        >
          {{ session?.name }}
          <span v-if="authStore.isAuthenticated" class="text-xs text-slate-500 ml-1">✏️</span>
        </h1>
      </div>

      <!-- No beat indicator -->
      <div v-if="!sessionBeatUrl" class="bg-slate-800/50 border border-slate-700 border-dashed rounded-lg px-3 py-2 mb-3 text-sm text-slate-400 flex items-center gap-2">
        <span>🎵</span>
        <span>No beat selected</span>
        <router-link v-if="authStore.isAuthenticated" to="/beats" class="text-amber-500 hover:text-amber-400 ml-auto text-xs">
          Choose a beat →
        </router-link>
      </div>

      <!-- Quill Editor — click anywhere to focus -->
      <div
        @click="focusEditor"
        data-testid="script-editor"
        class="bg-surface-elevated border border-slate-700 rounded-lg mt-2 min-h-[50vh] overflow-hidden cursor-text"
      >
        <div ref="editorRef" />
      </div>

      <!-- Save Status -->
      <SaveStatus
        v-if="authStore.isAuthenticated"
        :status="saveStatus"
        :lastSavedAt="lastSavedAt"
        :onRetry="handleRetry"
      />
      <div v-else class="mt-3 text-center">
        <router-link to="/login" class="text-amber-500 text-sm hover:text-amber-400">Sign in to edit</router-link>
      </div>
    </div>

    <!-- Beat Player -->
    <BeatPlayer
      :beatUrl="sessionBeatUrl"
      :initialPosition="resumeState?.beatPlaybackPosition"
      :initialVolume="resumeState?.beatVolume"
      :initialLoop="resumeState?.beatLooping"
      @beat-audible="onBeatAudible"
      @update:playbackState="onPlaybackStateUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, computed, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { useSessionStore } from '@/stores/sessionStore'
import { storageApi } from '@/services/api'
import { useBeatStore } from '@/stores/beatStore'
import { useAuthStore } from '@/stores/authStore'
import { useAutosave, type SaveStatus as SaveStatusType } from '@/composables/useAutosave'
import { useSessionLifecycle } from '@/composables/useSessionLifecycle'
import { useConnectivity } from '@/composables/useConnectivity'
import { useTimingMetrics } from '@/composables/useTimingMetrics'
import { localDraftService, type LocalDraft } from '@/services/localDraft'
import { decodeServerScript, resolveResume } from '@/services/resume'
import BeatPlayer from '@/components/BeatPlayer.vue'
import SaveStatus from '@/components/SaveStatus.vue'

const sessionStore = useSessionStore()
const beatStore = useBeatStore()
const authStore = useAuthStore()
const route = useRoute()

// Composables
const { state: lifecycleState, transition } = useSessionLifecycle()
const { isOnline } = useConnectivity()
const { recordBeatAudible, recordEditorFocused, recordFirstSaveSuccess } = useTimingMetrics()

// Refs
const editorRef = ref<HTMLElement>()
// shallowRef, NOT ref: a deep reactive Proxy around Quill breaks its internal
// identity checks, so getSelection() throws "reading 'offset'" and the cursor
// jumps to 0 on the first edit.
const quill = shallowRef<Quill>()
const session = ref<typeof sessionStore.activeSession>(null)
const currentDelta = ref<any>(null)
const resumeState = ref<LocalDraft | null>(null)

// Title editing
const isEditingTitle = ref(false)
const editableTitle = ref('')
const titleInput = ref<HTMLInputElement>()

// Playback state tracking (for persist on save)
const latestPlaybackState = ref<{ position: number; volume: number; looping: boolean } | null>(null)

// Resolve beat audio URL from beat store by beatId
const sessionBeatUrl = computed(() => {
  const beatId = session.value?.beatId
  if (!beatId) return session.value?.beatUrl || '' // Legacy fallback
  const beat = beatStore.beats.find((b: any) => b.id === beatId)
  return beat?.path || ''
})

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

// --- Title editing ---
function startEditTitle() {
  if (!authStore.isAuthenticated) return
  editableTitle.value = session.value?.name || ''
  isEditingTitle.value = true
  nextTick(() => titleInput.value?.focus())
}

async function saveTitle() {
  isEditingTitle.value = false
  const newTitle = editableTitle.value.trim()
  if (newTitle && session.value && newTitle !== session.value.name) {
    session.value.name = newTitle
    await sessionStore.updateSessionName(session.value.id, newTitle)
  }
}

// --- Focus editor helper ---
function focusEditor() {
  if (!quill.value || !authStore.isAuthenticated) return
  quill.value.focus()
}

// --- Session loading ---

/**
 * Raw contents of the session's script, or null for a session with no lyrics
 * yet. Demo mode inlines it as a data URL; real mode stores an s3:// pointer.
 * A malformed data URL yields null; an S3 download failure throws.
 */
async function fetchServerScript(script: string | undefined, id: string): Promise<unknown> {
  if (script?.startsWith('data:application/json;base64,')) {
    try {
      return JSON.parse(atob(script.split(',')[1]))
    } catch {
      return null
    }
  }
  if (script?.startsWith('s3://')) return (await storageApi.downloadSessionScript(id)).content
  return null
}

async function loadSession() {
  const id = route.params.id as string
  if (!id) return

  transition('loading')

  try {
    // Fetch from server
    await sessionStore.loadSession(id)
    session.value = sessionStore.activeSession
    if (!session.value || session.value.id !== id) {
      transition('error')
      return
    }

    // Fetch local draft for comparison
    const localDraft = await localDraftService.get(id)
    resumeState.value = localDraft

    // Pick server copy vs this browser's local draft (rules in services/resume.ts).
    // A failed S3 download throws to the outer handler -> error state with retry;
    // falling back to an empty document would let autosave overwrite saved lyrics.
    const server = decodeServerScript(await fetchServerScript(session.value.script, id))
    const resume = resolveResume(server, localDraft)
    const selectedDelta = resume.delta
    const cursorPosition = resume.cursorPosition

    // Transition to ready BEFORE mounting Quill so the v-else block renders the editor container
    transition('ready')
    await nextTick()

    // Initialize Quill with proper config for mobile
    const isReadOnly = !authStore.isAuthenticated
    quill.value = new Quill(editorRef.value!, {
      theme: 'snow',
      readOnly: isReadOnly,
      placeholder: isReadOnly ? '' : 'Start writing your lyrics...',
      modules: {
        toolbar: isReadOnly ? false : [
          ['bold', 'italic', 'underline'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          ['clean']
        ]
      }
    })

    // Set contents with selection disabled to prevent null offset crash
    // Quill 2.x fires selection-change during setContents which can crash on empty/complex deltas
    const safeDeltas = selectedDelta?.ops?.length > 0 ? selectedDelta : { ops: [{ insert: '\n' }] }
    quill.value.disable()
    // Our stored QuillDelta is plain JSON in Quill's Delta shape; Quill's own
    // Delta type is a class, so assert at this one boundary.
    quill.value.setContents(safeDeltas as unknown as Parameters<Quill['setContents']>[0])
    if (!isReadOnly) {
      quill.value.enable()
    }

    // If guest, skip autosave wiring
    if (isReadOnly) return

    // Defer cursor positioning to next tick to let DOM settle
    await nextTick()
    setTimeout(() => {
      if (!quill.value) return
      try {
        if (cursorPosition > 0) {
          quill.value.setSelection(cursorPosition, 0)
        } else {
          const length = quill.value.getLength()
          quill.value.setSelection(length > 0 ? length - 1 : 0, 0)
        }
        quill.value.focus()
        recordEditorFocused()
      } catch {
        // Quill selection can fail — non-critical
      }
    }, 100)

    // Wire Quill text-change to update currentDelta ref
    quill.value.on('text-change', () => {
      currentDelta.value = quill.value!.getContents()
    })

    // Expose test helper for E2E testing
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      ;(window as any).__simulateEdit = () => {
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

<style>
/* Make Quill editor match dark theme */
.ql-snow .ql-editor {
  color: #e2e8f0;
  font-size: 16px;
  line-height: 1.8;
  min-height: 45vh;
  padding: 1rem;
}
.ql-snow .ql-editor.ql-blank::before {
  color: #64748b;
  font-style: normal;
}
.ql-snow .ql-toolbar {
  border: none !important;
  border-bottom: 1px solid #334155 !important;
  background: #1e293b;
}
.ql-snow .ql-toolbar .ql-stroke {
  stroke: #94a3b8;
}
.ql-snow .ql-toolbar .ql-fill {
  fill: #94a3b8;
}
.ql-snow .ql-toolbar button:hover .ql-stroke {
  stroke: #f59e0b;
}
.ql-snow .ql-toolbar button:hover .ql-fill {
  fill: #f59e0b;
}
.ql-snow .ql-toolbar button.ql-active .ql-stroke {
  stroke: #f59e0b;
}
.ql-container.ql-snow {
  border: none !important;
}
</style>
