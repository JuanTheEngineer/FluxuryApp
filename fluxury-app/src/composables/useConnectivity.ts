import { ref, type Ref, getCurrentScope, onScopeDispose } from 'vue'

export interface UseConnectivityReturn {
  isOnline: Ref<boolean>
  onReconnect: (callback: () => void) => void
  offReconnect: (callback: () => void) => void
}

// Shared singleton state
const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const reconnectCallbacks = new Set<() => void>()

let listenersAttached = false
let scopeCount = 0

function handleOnline(): void {
  const wasOffline = !isOnline.value
  isOnline.value = true
  if (wasOffline) {
    fireReconnectCallbacks()
  }
}

function handleOffline(): void {
  isOnline.value = false
}

function fireReconnectCallbacks(): void {
  reconnectCallbacks.forEach((cb) => {
    try {
      cb()
    } catch (e) {
      console.error('[useConnectivity] onReconnect callback error:', e)
    }
  })
}

function attachListeners(): void {
  if (listenersAttached) return
  if (typeof window === 'undefined') return
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  listenersAttached = true
}

function detachListeners(): void {
  if (!listenersAttached) return
  if (typeof window === 'undefined') return
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  listenersAttached = false
}

/**
 * Report a network error from an API request failure.
 * External code (e.g., API interceptors) calls this to signal connectivity loss.
 */
export function reportNetworkError(): void {
  isOnline.value = false
}

/**
 * Report a successful API response.
 * External code calls this to signal connectivity is healthy.
 * If previously offline, fires onReconnect callbacks.
 */
export function reportNetworkSuccess(): void {
  const wasOffline = !isOnline.value
  isOnline.value = true
  if (wasOffline) {
    fireReconnectCallbacks()
  }
}

/**
 * Composable for tracking network connectivity state.
 * Uses a singleton pattern — all consumers share the same reactive `isOnline` ref.
 * Registers/cleans up window event listeners based on active scope count.
 */
export function useConnectivity(): UseConnectivityReturn {
  attachListeners()
  scopeCount++

  const cleanup = (): void => {
    scopeCount--
    if (scopeCount <= 0) {
      scopeCount = 0
      detachListeners()
    }
  }

  // Cleanup listeners when the scope (component or effect scope) is disposed
  if (getCurrentScope()) {
    onScopeDispose(cleanup)
  }

  return {
    isOnline,
    onReconnect(callback: () => void): void {
      reconnectCallbacks.add(callback)
    },
    offReconnect(callback: () => void): void {
      reconnectCallbacks.delete(callback)
    },
  }
}
