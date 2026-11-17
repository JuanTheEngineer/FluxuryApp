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

      <!-- Conflict: another copy saved newer work; nothing is saved until the user chooses -->
      <div
        v-if="inConflict"
        role="alert"
        data-testid="conflict-banner"
        class="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-slate-100 p-3"
      >
        <p class="text-sm font-medium">This session was changed in another tab or on another device.</p>
        <p class="text-xs text-slate-400 mt-0.5">Saving is paused so nothing gets overwritten.</p>
        <div class="flex flex-wrap gap-2 mt-3">
          <button
            data-testid="conflict-keep-mine"
            :disabled="resolvingConflict"
            @click="keepMyVersion"
            class="bg-amber-500 text-black px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40"
          >
            Keep my version
          </button>
          <button
            data-testid="conflict-use-latest"
            :disabled="resolvingConflict"
            @click="useLatestVersion"
            class="border border-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm hover:border-amber-500 hover:text-amber-400 transition-colors disabled:opacity-40"
          >
            Use the latest version
          </button>
        </div>
        <p class="text-xs text-slate-400 mt-2">Using the latest keeps yours as a copy in My Sessions.</p>
        <p v-if="conflictError" class="text-xs text-red-400 mt-2">{{ conflictError }}</p>
      </div>
      <p v-else-if="conflictNote" data-testid="conflict-note" class="mt-2 text-xs text-slate-400">{{ conflictNote }}</p>

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
        v-if="authStore.isAuthenticated && !inConflict"
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
import { useBeatStore } from '@/stores/beatStore'
import { useAuthStore } from '@/stores/authStore'
import { useAutosave, type SaveStatus as SaveStatusType } from '@/composables/useAutosave'
import { useSessionLifecycle } from '@/composables/useSessionLifecycle'
import { useConnectivity } from '@/composables/useConnectivity'
import { useTimingMetrics } from '@/composables/useTimingMetrics'
import { localDraftService, type LocalDraft, type QuillDelta } from '@/services/localDraft'
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
    const server = decodeServerScript(await sessionStore.loadScript(id, session.value.script))
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

// --- Conflict: another copy saved newer work (saving is paused) ---
const inConflict = computed(() => !!session.value && sessionStore.conflictSessionId === session.value.id)
const resolvingConflict = ref(false)
const conflictError = ref<string | null>(null)
const conflictNote = ref<string | null>(null)

async function resolveConflict(action: () => Promise<void>) {
  resolvingConflict.value = true
  conflictError.value = null
  try {
    await action()
  } catch (e) {
    console.error('Failed to resolve conflict:', e)
    conflictError.value = "Couldn't reach the server. Your lyrics are still here; try again."
  } finally {
    resolvingConflict.value = false
  }
}

function keepMyVersion() {
  return resolveConflict(async () => {
    await sessionStore.resolveConflictKeepMine(session.value!.id)
    await flush() // retries the refused save, now based on the latest version
  })
}

function useLatestVersion() {
  return resolveConflict(async () => {
    const mine = quill.value!.getContents() as unknown as QuillDelta
    const { latest, copyName } = await sessionStore.resolveConflictUseLatest(session.value!.id, mine)
    // Load the latest into the editor. The resulting text-change autosaves it
    // once more against the new version, which also marks the draft synced.
    quill.value!.setContents(decodeServerScript(latest).delta as unknown as Parameters<Quill['setContents']>[0])
    conflictNote.value = `Your version was saved as "${copyName}".`
  })
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
