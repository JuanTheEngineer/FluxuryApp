import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface TimingMetrics {
  appLoadStart: number | null
  beatAudible: number | null
  editorFocused: number | null
  firstSaveSuccess: number | null
  timeToFirstLyric: number // computed
}

export interface UseTimingMetricsReturn {
  metrics: Readonly<Ref<TimingMetrics>>
  recordAppLoadStart: () => void
  recordBeatAudible: () => void
  recordEditorFocused: () => void
  recordFirstSaveSuccess: () => void
}

// Singleton state — shared across all consumers
const appLoadStart = ref<number | null>(null)
const beatAudible = ref<number | null>(null)
const editorFocused = ref<number | null>(null)
const firstSaveSuccess = ref<number | null>(null)

const timeToFirstLyric: ComputedRef<number> = computed(() => {
  const start = appLoadStart.value
  const save = firstSaveSuccess.value

  if (start === null || save === null) {
    return 0
  }

  if (start <= 0 || save <= 0) {
    return 0
  }

  if (save <= start) {
    console.warn('[useTimingMetrics] clock-ordering warning')
    return 0
  }

  return save - start
})

const metrics = computed<TimingMetrics>(() => ({
  appLoadStart: appLoadStart.value,
  beatAudible: beatAudible.value,
  editorFocused: editorFocused.value,
  firstSaveSuccess: firstSaveSuccess.value,
  timeToFirstLyric: timeToFirstLyric.value,
}))

// Expose on window for debugging — no third-party transmission
declare global {
  interface Window {
    __fluxury_metrics?: TimingMetrics
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__fluxury_metrics', {
    get: () => metrics.value,
    configurable: true,
  })
}

function recordAppLoadStart(): void {
  if (appLoadStart.value !== null) return // first-wins
  appLoadStart.value = performance.now()
}

function recordBeatAudible(): void {
  if (beatAudible.value !== null) return // first-wins
  beatAudible.value = performance.now()
}

function recordEditorFocused(): void {
  if (editorFocused.value !== null) return // first-wins
  editorFocused.value = performance.now()
}

function recordFirstSaveSuccess(): void {
  if (firstSaveSuccess.value !== null) return // first-wins
  firstSaveSuccess.value = performance.now()
}

/**
 * Composable for tracking timing metrics for the creative core loop.
 * Uses a singleton pattern — all consumers share the same reactive metrics.
 * All timestamps use `performance.now()` (high-resolution, monotonic).
 * Each record* function only fires once (first-wins semantics).
 * Exposed via `window.__fluxury_metrics` for debugging.
 */
export function useTimingMetrics(): UseTimingMetricsReturn {
  return {
    metrics,
    recordAppLoadStart,
    recordBeatAudible,
    recordEditorFocused,
    recordFirstSaveSuccess,
  }
}

/**
 * Reset all metrics. Exported for testing purposes only.
 */
export function _resetTimingMetrics(): void {
  appLoadStart.value = null
  beatAudible.value = null
  editorFocused.value = null
  firstSaveSuccess.value = null
}

/**
 * Directly expose singleton refs for testing.
 */
export const _internals = {
  appLoadStart,
  beatAudible,
  editorFocused,
  firstSaveSuccess,
  timeToFirstLyric,
}
