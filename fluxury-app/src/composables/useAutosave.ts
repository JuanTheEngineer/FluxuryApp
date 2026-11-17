import { ref, watch, type Ref } from 'vue'
import { localDraftService, type QuillDelta, type LocalDraft } from '@/services/localDraft'
import { useConnectivity, reportNetworkError, reportNetworkSuccess } from './useConnectivity'

// --- Types ---

export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'offline_saved_locally'
  | 'error'

export interface PlaybackStateSnapshot {
  cursorPosition: number
  beatPlaybackPosition: number
  beatVolume: number
  beatLooping: boolean
}

export interface UseAutosaveOptions {
  sessionId: Ref<string>
  delta: Ref<QuillDelta | null>
  saveFn: (id: string, delta: QuillDelta) => Promise<string | null>
  debounceMs?: number        // default: 1500
  periodicFlushMs?: number   // default: 15000
  localWriteMs?: number      // default: 500
  getPlaybackState?: () => PlaybackStateSnapshot
}

export interface UseAutosaveReturn {
  saveStatus: Ref<SaveStatus>
  lastSavedAt: Ref<number | null>
  lastLocalSaveAt: Ref<number | null>
  flush: () => Promise<void>
  destroy: () => void
}

// --- Valid state transitions for Save Status ---

export const VALID_SAVE_TRANSITIONS: Record<SaveStatus, SaveStatus[]> = {
  idle: ['dirty'],
  dirty: ['saving'],
  saving: ['saved', 'dirty', 'offline_saved_locally', 'error'],
  saved: ['dirty'],
  offline_saved_locally: ['saving'],
  error: ['saving'],
}

export function isValidSaveTransition(from: SaveStatus, to: SaveStatus): boolean {
  return VALID_SAVE_TRANSITIONS[from].includes(to)
}

// --- Network error detection ---

function isNetworkError(error: unknown): boolean {
  // TypeError from fetch indicates network failure (DNS, connection refused, etc.)
  if (error instanceof TypeError) return true

  // Axios-style errors: no response means network didn't complete
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    // No response property or response is null/undefined → network error
    if ('response' in err && err.response == null) return true
    // Explicit network error code from axios
    if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true
  }

  return false
}

// --- Composable ---

export function useAutosave(options: UseAutosaveOptions): UseAutosaveReturn {
  const {
    sessionId,
    delta,
    saveFn,
    debounceMs = 1500,
    periodicFlushMs = 15000,
    localWriteMs = 500,
    getPlaybackState,
  } = options

  // Reactive state
  const saveStatus = ref<SaveStatus>('idle')
  const lastSavedAt = ref<number | null>(null)
  const lastLocalSaveAt = ref<number | null>(null)

  // Version counter to track edits during save
  let editVersion = 0
  let saveStartVersion = 0

  // Timer handles
  let localWriteTimer: ReturnType<typeof setTimeout> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let periodicFlushInterval: ReturnType<typeof setInterval> | null = null

  // Track whether a save is in-flight to prevent concurrent saves
  let isSaving = false

  // Connectivity integration
  const { isOnline, onReconnect, offReconnect } = useConnectivity()

  // --- Internal helpers ---

  function transitionStatus(target: SaveStatus): void {
    const current = saveStatus.value
    if (current === target) return
    if (isValidSaveTransition(current, target)) {
      saveStatus.value = target
    } else {
      console.warn('[useAutosave] invalid save-status transition', {
        from: current,
        to: target,
      })
    }
  }

  /**
   * Write the current delta to the local draft store.
   * `synced` = true only right after a server save that matches this content;
   * a synced draft is a cache and never overrides the server on reopen.
   */
  async function writeLocalDraft(synced = false): Promise<void> {
    const currentDelta = delta.value
    const currentSessionId = sessionId.value
    if (!currentDelta || !currentSessionId) return

    const playback = getPlaybackState?.() ?? {
      cursorPosition: 0,
      beatPlaybackPosition: 0,
      beatVolume: 0.8,
      beatLooping: false,
    }

    const draft: LocalDraft = {
      sessionId: currentSessionId,
      delta: currentDelta,
      editTimestamp: Date.now(),
      cursorPosition: playback.cursorPosition,
      beatPlaybackPosition: playback.beatPlaybackPosition,
      beatVolume: playback.beatVolume,
      beatLooping: playback.beatLooping,
      synced,
    }

    try {
      await localDraftService.set(draft)
      lastLocalSaveAt.value = Date.now()
    } catch (e) {
      console.error('[useAutosave] failed to write local draft:', e)
    }
  }

  /**
   * Attempt a server write of the current delta.
   */
  async function attemptServerWrite(): Promise<void> {
    const currentDelta = delta.value
    const currentSessionId = sessionId.value
    if (!currentDelta || !currentSessionId) return
    if (isSaving) return

    isSaving = true
    saveStartVersion = editVersion

    transitionStatus('saving')

    try {
      await saveFn(currentSessionId, currentDelta)

      // Success
      reportNetworkSuccess()

      if (editVersion > saveStartVersion) {
        // New edits arrived during the save — still dirty
        transitionStatus('dirty')
      } else {
        // No new edits — fully saved
        transitionStatus('saved')
        lastSavedAt.value = Date.now()
        // The draft now matches the server: mark it so it can't later
        // override newer work saved from another tab, window or device.
        await writeLocalDraft(true)
      }
    } catch (error) {
      if (isNetworkError(error)) {
        reportNetworkError()
        // Confirm local draft is written before setting offline status
        await writeLocalDraft()
        transitionStatus('offline_saved_locally')
      } else {
        transitionStatus('error')
      }
    } finally {
      isSaving = false
    }
  }

  // --- Scheduling ---

  /**
   * Schedule a local draft write within localWriteMs.
   * Resets the timer on every call (batching rapid edits).
   */
  function scheduleLocalWrite(): void {
    if (localWriteTimer !== null) {
      clearTimeout(localWriteTimer)
    }
    localWriteTimer = setTimeout(() => {
      localWriteTimer = null
      writeLocalDraft()
    }, localWriteMs)
  }

  /**
   * Schedule a debounced server write.
   * Resets the timer on every call.
   */
  function scheduleDebounce(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (saveStatus.value === 'dirty' && isOnline.value) {
        attemptServerWrite()
      }
    }, debounceMs)
  }

  /**
   * Handle a delta change: mark dirty, schedule local write & debounce.
   */
  function onDeltaChange(): void {
    editVersion++

    // Transition to dirty (valid from idle, saved, or stay in dirty)
    const current = saveStatus.value
    if (current === 'idle' || current === 'saved' || current === 'dirty') {
      transitionStatus('dirty')
    }
    // If currently saving, the version counter handles the dirty transition on save-end

    scheduleLocalWrite()
    scheduleDebounce()
  }

  // --- Periodic flush ---

  function startPeriodicFlush(): void {
    if (periodicFlushInterval !== null) return
    periodicFlushInterval = setInterval(() => {
      if (
        (saveStatus.value === 'dirty') &&
        isOnline.value &&
        !isSaving
      ) {
        attemptServerWrite()
      }
    }, periodicFlushMs)
  }

  // --- Flush triggers ---

  /**
   * Exposed flush: immediately write to server if there are unsaved changes.
   */
  async function flush(): Promise<void> {
    // Cancel pending debounce since we're flushing now
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (saveStatus.value === 'dirty' && !isSaving) {
      await attemptServerWrite()
    }
  }

  /**
   * beforeunload handler: write local draft synchronously (best effort).
   * Since IndexedDB is async, we write to localStorage directly as a last resort.
   */
  function handleBeforeUnload(): void {
    const currentDelta = delta.value
    const currentSessionId = sessionId.value
    if (!currentDelta || !currentSessionId) return

    const playback = getPlaybackState?.() ?? {
      cursorPosition: 0,
      beatPlaybackPosition: 0,
      beatVolume: 0.8,
      beatLooping: false,
    }

    // Best-effort synchronous write to localStorage
    try {
      const draft: LocalDraft = {
        sessionId: currentSessionId,
        delta: currentDelta,
        editTimestamp: Date.now(),
        cursorPosition: playback.cursorPosition,
        beatPlaybackPosition: playback.beatPlaybackPosition,
        beatVolume: playback.beatVolume,
        beatLooping: playback.beatLooping,
        synced: saveStatus.value === 'saved',
      }
      localStorage.setItem(
        `fluxury-draft-${currentSessionId}`,
        JSON.stringify(draft)
      )
    } catch {
      // Nothing more we can do in beforeunload
    }
  }

  // --- Connectivity recovery ---

  function handleReconnect(): void {
    if (saveStatus.value === 'offline_saved_locally') {
      attemptServerWrite()
    }
  }

  // --- Watcher ---

  const stopWatch = watch(delta, (newVal, oldVal) => {
    if (newVal !== oldVal && newVal !== null) {
      onDeltaChange()
    }
  })

  // --- Setup ---

  startPeriodicFlush()
  onReconnect(handleReconnect)

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  // --- Destroy ---

  function destroy(): void {
    // Stop the delta watcher
    stopWatch()

    // Clear all timers
    if (localWriteTimer !== null) {
      clearTimeout(localWriteTimer)
      localWriteTimer = null
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (periodicFlushInterval !== null) {
      clearInterval(periodicFlushInterval)
      periodicFlushInterval = null
    }

    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }

    // Remove connectivity callback
    offReconnect(handleReconnect)
  }

  return {
    saveStatus,
    lastSavedAt,
    lastLocalSaveAt,
    flush,
    destroy,
  }
}
