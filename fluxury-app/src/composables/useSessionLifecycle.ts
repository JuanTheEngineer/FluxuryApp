import { ref } from 'vue'
import type { Ref } from 'vue'

/**
 * Session lifecycle states for the Session Editor view.
 * At any point, the editor is in exactly one of these states.
 */
export type SessionLifecycleState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'editing'
  | 'saving'
  | 'saved'
  | 'error'

/**
 * Valid state transitions map.
 * Each key is a source state; the value is the list of allowed target states.
 */
export const VALID_TRANSITIONS: Record<SessionLifecycleState, SessionLifecycleState[]> = {
  idle: ['loading'],
  loading: ['ready', 'error'],
  ready: ['editing'],
  editing: ['saving'],
  saving: ['saved', 'error', 'editing'],
  saved: ['editing'],
  error: ['loading'],
}

/**
 * Pure function to check if a transition from one state to another is valid.
 */
export function isValidTransition(
  from: SessionLifecycleState,
  to: SessionLifecycleState
): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export interface UseSessionLifecycleReturn {
  state: Ref<SessionLifecycleState>
  transition: (target: SessionLifecycleState) => boolean
}

/**
 * Composable that manages the session lifecycle state machine.
 * Returns a reactive state ref and a transition function that enforces valid transitions.
 */
export function useSessionLifecycle(
  initialState: SessionLifecycleState = 'idle'
): UseSessionLifecycleReturn {
  const state = ref<SessionLifecycleState>(initialState)

  function transition(target: SessionLifecycleState): boolean {
    const current = state.value

    if (isValidTransition(current, target)) {
      state.value = target
      return true
    }

    console.warn('state-machine-violation', {
      current,
      attempted: target,
    })
    return false
  }

  return {
    state,
    transition,
  }
}
