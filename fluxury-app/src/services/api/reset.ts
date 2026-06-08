// Canonical reset surface — repo-stabilization task 1.11.
//
// Provides the user-visible Reset_Action that the DemoBanner reset button
// invokes. Reseeds the in-memory mock backend by swapping the `_storage`
// instance for a fresh, deterministically seeded one, then refreshes the
// active Pinia stores so the UI reflects the new state without a page reload.

import { useSessionStore } from '@/stores/sessionStore'
import { useBeatStore } from '@/stores/beatStore'
import { __resetMockStorage } from './mock'

/**
 * Reseed the in-memory mock backend and refresh the active Pinia stores.
 *
 * Required by Requirement 7.4 (no `window.location.reload()`) and
 * Requirement 7.5 (consecutive resets produce identical observable state).
 *
 * @throws if either store refresh fails after the reseed; callers should
 *   surface a "Reset failed" state to the user.
 */
export async function resetMockBackend(): Promise<void> {
  __resetMockStorage()
  const sessionStore = useSessionStore()
  const beatStore = useBeatStore()
  await Promise.all([sessionStore.fetchSessions(), beatStore.fetchBeats()])
  const errors = [sessionStore.error, beatStore.error].filter(Boolean) as string[]
  if (errors.length > 0) {
    throw new Error(`Reset failed: ${errors.join('; ')}`)
  }
}
