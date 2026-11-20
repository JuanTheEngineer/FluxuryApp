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

    <!-- Opening: a skeleton shaped like the editor, from the very first frame, so
         nothing flashes empty and nothing moves when the session arrives -->
    <div
      v-else-if="isOpening"
      data-testid="session-skeleton"
      aria-busy="true"
      class="animate-pulse motion-reduce:animate-none"
    >
      <span class="sr-only" role="status">Loading session</span>
      <div class="flex items-center gap-2 mb-2" aria-hidden="true">
        <div class="h-7 w-48 rounded-md bg-slate-700/60" />
        <div class="ml-auto w-10 h-10 rounded-full bg-slate-700/40" />
      </div>
      <div class="bg-surface-elevated border border-slate-700 rounded-lg mt-2 min-h-[50vh] overflow-hidden" aria-hidden="true">
        <div class="h-[42px] border-b border-slate-700 flex items-center gap-3 px-3">
          <div v-for="i in 5" :key="i" class="h-4 w-4 rounded bg-slate-700/60" />
        </div>
        <div class="p-4 space-y-3">
          <div v-for="(width, i) in skeletonLineWidths" :key="i" class="h-4 rounded bg-slate-700/50" :style="{ width }" />
        </div>
      </div>
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

        <!-- Classic / timeline view. Same lyrics either way; remembered on this device. -->
        <button
          v-if="authStore.isAuthenticated"
          type="button"
          data-testid="editor-mode-toggle"
          :aria-pressed="timelineOn"
          class="ml-auto flex-shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          :class="timelineOn
            ? 'border-slate-600 text-slate-300 hover:text-slate-100'
            : 'border-violet-500/60 text-violet-200 bg-violet-500/10 hover:bg-violet-500/20'"
          @click="toggleEditorMode"
        >
          {{ timelineOn ? 'Back to classic' : '✨ Try new' }}
        </button>

        <!-- Session options (⋯). Delete lives here, one tap away from the
             writing area rather than a bare trash icon next to it. -->
        <div v-if="authStore.isAuthenticated" ref="menuRoot" class="relative flex-shrink-0">
          <button
            type="button"
            data-testid="session-menu"
            aria-label="Session options"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click="toggleMenu"
            class="w-10 h-10 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          <div
            v-if="menuOpen"
            role="menu"
            aria-label="Session options"
            @keydown.esc.stop="closeMenu(true)"
            class="absolute right-0 mt-1 w-48 z-30 rounded-lg border border-slate-700 bg-surface-elevated text-slate-100 shadow-xl py-1"
          >
            <button
              ref="deleteItem"
              type="button"
              role="menuitem"
              data-testid="delete-session"
              @click="deleteThisSession"
              class="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 focus:outline-none flex items-center gap-2"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              Delete session
            </button>
          </div>
        </div>
      </div>

      <!-- No beat indicator: only once we know (see beatStatus) -->
      <div v-if="beatStatus === 'none'" class="bg-slate-800/50 border border-slate-700 border-dashed rounded-lg px-3 py-2 mb-3 text-sm text-slate-400 flex items-center gap-2">
        <span>🎵</span>
        <span>No beat selected</span>
        <router-link v-if="authStore.isAuthenticated" to="/beats" class="text-amber-500 hover:text-amber-400 ml-auto text-xs">
          Choose a beat →
        </router-link>
      </div>

      <!-- Deleted elsewhere: nothing is saved until the user keeps the lyrics -->
      <div
        v-if="inDeleted"
        role="alert"
        data-testid="deleted-banner"
        class="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 text-slate-100 p-3"
      >
        <p class="text-sm font-medium">This session was deleted in another tab or on another device.</p>
        <p class="text-xs text-slate-400 mt-0.5">Your lyrics are still here. Save them as a new session to keep writing.</p>
        <button
          data-testid="save-as-new"
          :disabled="restoringDeleted"
          @click="saveAsNewSession"
          class="mt-3 bg-amber-500 text-black px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40"
        >
          {{ restoringDeleted ? 'Saving…' : 'Save as a new session' }}
        </button>
        <p v-if="restoreError" class="text-xs text-red-400 mt-2">{{ restoreError }}</p>
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

      <!-- Quill Editor — click anywhere to focus. In the timeline view the
           overlay draws each line's time beside it, so the text shifts right. -->
      <div
        @click="focusEditor"
        data-testid="script-editor"
        class="relative bg-surface-elevated border border-slate-700 rounded-lg mt-2 min-h-[50vh] overflow-hidden cursor-text"
        :class="{ 'timeline-editor': timelineOn }"
      >
        <div ref="editorRef" />
        <LineTimeOverlay
          v-if="timelineOn && quill"
          :quill="quill"
          :playing="playingIdx"
          :target="targetLine"
          @jump="jumpToLine"
        />
      </div>

      <!-- Pin feedback with Undo (same pattern as session delete) -->
      <div
        v-if="pinToast"
        role="status"
        data-testid="pin-toast"
        class="fixed left-4 right-4 bottom-44 z-50 mx-auto max-w-md flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2 text-sm shadow-xl"
      >
        <span class="flex-1">{{ pinToast.text }}</span>
        <button type="button" data-testid="pin-undo" class="font-semibold text-violet-300 hover:text-violet-200 px-1" @click="undoPin">Undo</button>
      </div>

      <!-- Save Status -->
      <SaveStatus
        v-if="authStore.isAuthenticated && !inConflict && !inDeleted"
        :status="saveStatus"
        :lastSavedAt="lastSavedAt"
        :onRetry="handleRetry"
      />
      <div v-else-if="!authStore.isAuthenticated" class="mt-3 text-center">
        <router-link to="/login" class="text-amber-500 text-sm hover:text-amber-400">Sign in to edit</router-link>
      </div>
    </div>

    <!-- Beat Player: mounted once the beat is known. Until then a same-size
         placeholder, so the bar doesn't flash "No Song Selected" or change height.
         No bar at all for a session without a beat (the banner above says so). -->
    <BeatPlayer
      v-if="beatStatus === 'ready'"
      ref="playerRef"
      :beatUrl="sessionBeatUrl"
      :initialPosition="resumeState?.beatPlaybackPosition"
      :initialVolume="resumeState?.beatVolume"
      :initialLoop="resumeState?.beatLooping"
      @beat-audible="onBeatAudible"
      @update:playbackState="onPlaybackStateUpdate"
      @time="onPlayerTime"
    >
      <template v-if="timelineOn" #actions>
        <button
          v-if="targetIsPinned"
          type="button"
          data-testid="unpin-line"
          class="px-3 py-1.5 rounded-lg text-sm text-slate-300 border border-slate-600 hover:border-violet-400 hover:text-violet-200 transition-colors"
          @click="unpinTarget"
        >
          Unpin
        </button>
        <button
          type="button"
          data-testid="pin-line"
          :disabled="targetLine == null"
          :title="targetLine == null ? 'Write a line first' : 'Pin the outlined line where the beat is now'"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 disabled:opacity-40 transition-colors"
          @click="pinTarget"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path d="M5 3h14l-7 8z" fill="currentColor"/><path d="M12 11v10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          Pin
        </button>
      </template>
    </BeatPlayer>
    <div
      v-else-if="beatStatus === 'unknown' && lifecycleState !== 'error' && route.params.id"
      data-testid="player-skeleton"
      aria-hidden="true"
      class="fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-slate-700 p-4 shadow-2xl flex flex-col gap-2 z-40 animate-pulse motion-reduce:animate-none"
    >
      <div class="flex justify-between items-center">
        <div class="h-4 w-32 rounded bg-slate-700/60" />
        <div class="h-3 w-16 rounded bg-slate-700/50" />
      </div>
      <div class="h-1.5 w-full rounded bg-slate-700/60" />
      <div class="flex gap-2">
        <div class="h-8 w-11 rounded-lg bg-slate-700/60" />
        <div class="h-8 w-14 rounded-lg bg-slate-700/60" />
        <div class="h-8 w-11 rounded-lg bg-slate-700/60" />
        <div class="h-8 w-16 rounded-lg bg-slate-700/60" />
      </div>
      <div class="h-1.5 w-full rounded bg-slate-700/50" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, computed, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { useSessionStore } from '@/stores/sessionStore'
import { useBeatStore } from '@/stores/beatStore'
import { useAuthStore } from '@/stores/authStore'
import { useSessionDeletionStore } from '@/stores/sessionDeletionStore'
import { useAutosave, type SaveStatus as SaveStatusType } from '@/composables/useAutosave'
import { useSessionLifecycle } from '@/composables/useSessionLifecycle'
import { useConnectivity } from '@/composables/useConnectivity'
import { useTimingMetrics } from '@/composables/useTimingMetrics'
import { localDraftService, type LocalDraft, type QuillDelta } from '@/services/localDraft'
import { decodeServerScript, resolveResume } from '@/services/resume'
import { registerLineTime, attachLineTimeGuards, readLineTimes, setLineTime, timeOrderTarget, moveLine, playingLine, nextUnplaced } from '@/services/lineTime'
import { getEditorMode, setEditorMode, type EditorMode } from '@/services/editorMode'
import LineTimeOverlay from '@/components/LineTimeOverlay.vue'
import BeatPlayer from '@/components/BeatPlayer.vue'
import SaveStatus from '@/components/SaveStatus.vue'

const sessionStore = useSessionStore()
const beatStore = useBeatStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const deletion = useSessionDeletionStore()

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
// GetSessionResponseContent lacks beatId (BACKLOG Batch D, one API contract):
// read it in this one place.
const sessionBeatId = computed(() => (session.value as { beatId?: string } | null)?.beatId)

const sessionBeatUrl = computed(() => {
  const beatId = sessionBeatId.value
  if (!beatId) return session.value?.beatUrl || '' // Legacy fallback
  const beat = beatStore.beats.find((b: any) => b.id === beatId)
  return beat?.path || ''
})

// --- Opening without flashes ---

// The beat list loads in parallel with the session (onMounted). Until it
// settles, "this session's beat" and "no beat" look the same.
const beatsLoaded = ref(false)

/** 'unknown' until we can tell; drives the banner and the player area. */
const beatStatus = computed<'unknown' | 'none' | 'ready'>(() => {
  if (!session.value) return 'unknown'
  if (sessionBeatUrl.value) return 'ready'
  if (sessionBeatId.value && !beatsLoaded.value) return 'unknown'
  return 'none' // no beat, or its beat no longer exists
})

// The lifecycle starts 'idle' and only becomes 'loading' inside loadSession,
// so treat "idle with a session id" as opening too: skeleton from frame one.
const isOpening = computed(() =>
  lifecycleState.value === 'loading' || (lifecycleState.value === 'idle' && !!route.params.id),
)
const skeletonLineWidths = ['35%', '80%', '72%', '86%', '64%', '0%', '30%', '78%', '70%']

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

// --- Timeline view ("Try new"): line times, Pin, playing-line highlight ---
// Same Quill document as the classic view; only extra UI on top of it.

const editorMode = ref<EditorMode>(getEditorMode())
const timelineOn = computed(() => editorMode.value === 'timeline' && authStore.isAuthenticated)
const playerRef = ref<{ getPosition: () => number; seekTo: (s: number) => void } | null>(null)
const nowMs = ref(0)
const lineTimes = shallowRef<{ text: string; timeMs: number | null }[]>([])
/** The line Pin will place: the one last tapped, or the next unplaced line. */
const targetLine = ref<number | null>(null)
const pinToast = ref<{ text: string } | null>(null)
let pinToastTimer: ReturnType<typeof setTimeout> | undefined

const playingIdx = computed(() => playingLine(lineTimes.value, nowMs.value))
const targetIsPinned = computed(() => targetLine.value != null && lineTimes.value[targetLine.value]?.timeMs != null)

function toggleEditorMode() {
  editorMode.value = timelineOn.value ? 'classic' : 'timeline'
  setEditorMode(editorMode.value)
  if (timelineOn.value) refreshLines(true)
}

function onPlayerTime(seconds: number) {
  nowMs.value = Math.round(seconds * 1000)
}

/** Re-read line times; pick a target if none (or it no longer exists). */
function refreshLines(pickTarget = false) {
  if (!quill.value) return
  lineTimes.value = readLineTimes(quill.value)
  const t = targetLine.value
  if (pickTarget || t == null || t >= lineTimes.value.length) {
    targetLine.value = nextUnplaced(lineTimes.value, -1) ?? (t != null && t < lineTimes.value.length ? t : null)
  }
}

function onSelectionChange(range: { index: number } | null) {
  if (!range || !timelineOn.value) return
  targetCursorLine(range.index)
}

/** Make the line holding the cursor the Pin target (a tap, or typing a line). */
function targetCursorLine(index?: number) {
  const q = quill.value
  if (!q || !timelineOn.value) return
  const at = index ?? q.getSelection()?.index
  if (at == null) return
  const [line] = q.getLine(at)
  if (line) targetLine.value = q.getLines().indexOf(line)
}

const fmtMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`

/** A lyric's first words, for messages ("Pinned “Woke up with the…” at 0:42"). */
const snippet = (text = '') => (text.trim().length > 24 ? text.trim().slice(0, 23) + '…' : text.trim())

function showPinToast(text: string) {
  pinToast.value = { text }
  clearTimeout(pinToastTimer)
  pinToastTimer = setTimeout(() => (pinToast.value = null), 5000)
}

/** Pin the target line at the playhead, keep placed lines in time order, move on. */
function pinTarget() {
  const q = quill.value
  const from = targetLine.value
  if (!q || from == null || !playerRef.value) return
  const ms = Math.round(playerRef.value.getPosition() * 1000)
  // One Undo reverts exactly this pin (and its move), never earlier typing.
  q.history.cutoff()
  setLineTime(q, from, ms)
  const to = timeOrderTarget(readLineTimes(q), from)
  moveLine(q, from, to)
  q.history.cutoff()
  refreshLines()
  const at = to > from + 1 ? to - 1 : to === from + 1 ? from : to
  // Move on down the song, so a verse can be pinned line after line.
  targetLine.value = nextUnplaced(lineTimes.value, at) ?? at
  showPinToast(`Pinned “${snippet(lineTimes.value[at]?.text)}” at ${fmtMs(ms)}.`)
}

function unpinTarget() {
  const q = quill.value
  const i = targetLine.value
  if (!q || i == null) return
  q.history.cutoff()
  setLineTime(q, i, null)
  q.history.cutoff()
  refreshLines()
  showPinToast(`Unpinned “${snippet(lineTimes.value[i]?.text)}”.`)
}

function undoPin() {
  quill.value?.history.undo()
  pinToast.value = null
  refreshLines()
}

/** Tap a line's time: hear it from there, and make it the Pin target. */
function jumpToLine(i: number) {
  const ms = lineTimes.value[i]?.timeMs
  if (ms == null) return
  playerRef.value?.seekTo(ms / 1000)
  targetLine.value = i
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
    // Line times (timed lyrics): this editor doesn't show them, but must keep
    // them. Without the registration Quill drops them and autosave erases them.
    registerLineTime()
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

    // Lyrics keyboard: no autocorrect. Rap spelling is often deliberately
    // "wrong" and auto-replacing words breaks the flow. Keyboard suggestions
    // stay on: spellcheck is left alone because spellcheck="false" can also
    // hide the iPhone's suggestion bar (BACKLOG Release 1.1: verify on device).
    quill.value.root.setAttribute('autocorrect', 'off')
    attachLineTimeGuards(quill.value)

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
    quill.value.on('text-change', (_d: unknown, _o: unknown, source: string) => {
      currentDelta.value = quill.value!.getContents()
      refreshLines()
      if (source === 'user') targetCursorLine() // the line being written is the one to pin
    })
    quill.value.on('selection-change', onSelectionChange)
    // A tap where the cursor already is fires no selection-change.
    quill.value.root.addEventListener('click', () => targetCursorLine())
    refreshLines(true)

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

// --- Deleted elsewhere (saving is paused) ---
const inDeleted = computed(() => !!session.value && sessionStore.deletedSessionId === session.value.id)
const restoringDeleted = ref(false)
const restoreError = ref<string | null>(null)

async function saveAsNewSession() {
  if (!session.value || !quill.value) return
  restoringDeleted.value = true
  restoreError.value = null
  try {
    const mine = quill.value.getContents() as unknown as QuillDelta
    const created = await sessionStore.saveDeletedAsNewSession(session.value.id, mine)
    // replace: the deleted session's URL shouldn't stay in Back history
    await router.replace(`/session/${created.id}`)
  } catch (e) {
    console.error('Failed to save lyrics as a new session:', e)
    restoreError.value = "Couldn't reach the server. Your lyrics are still here; try again."
  } finally {
    restoringDeleted.value = false
  }
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

// --- Route leave flush ---
onBeforeRouteLeave(async () => {
  await flush()
})

// --- Lifecycle ---
// --- Session options menu (⋯) ---
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement>()
const deleteItem = ref<HTMLButtonElement>()

function onPointerDownOutside(e: PointerEvent) {
  if (!menuRoot.value?.contains(e.target as Node)) closeMenu()
}

async function toggleMenu() {
  if (menuOpen.value) return closeMenu()
  menuOpen.value = true
  document.addEventListener('pointerdown', onPointerDownOutside)
  await nextTick()
  deleteItem.value?.focus() // keyboard users land on the first item
}

function closeMenu(restoreFocus = false) {
  if (!menuOpen.value) return
  menuOpen.value = false
  document.removeEventListener('pointerdown', onPointerDownOutside)
  if (restoreFocus) menuRoot.value?.querySelector<HTMLButtonElement>('[data-testid="session-menu"]')?.focus()
}

/**
 * Back to the list, where the session disappears and "Deleted … · Undo" shows
 * for 5 seconds (sessionDeletionStore). Leaving the editor flushes autosave
 * first (onBeforeRouteLeave), so an Undo restores the latest lyrics.
 */
function deleteThisSession() {
  closeMenu()
  if (!session.value) return
  deletion.request({ id: session.value.id, name: session.value.name })
  router.push('/sessions')
}

onMounted(async () => {
  // In parallel: the lyrics never wait for the beat list (fetchBeats handles
  // its own errors; a failure just means the beat shows as missing).
  const beats = beatStore.fetchBeats().catch(() => {}).finally(() => { beatsLoaded.value = true })
  await Promise.all([beats, loadSession()])
})

onUnmounted(() => {
  destroyAutosave()
  document.removeEventListener('pointerdown', onPointerDownOutside)
  clearTimeout(pinToastTimer)
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
/* Timeline view: room on the left for each line's time (LineTimeOverlay) */
.timeline-editor .ql-snow .ql-editor {
  padding-left: 3.5rem;
}
.timeline-editor .ql-snow .ql-editor.ql-blank::before {
  left: 3.5rem;
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
