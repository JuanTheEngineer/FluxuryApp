import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUndoableDelete } from '@/composables/useUndoableDelete'
import { useSessionStore } from './sessionStore'

export interface DeletableSession {
  id: string
  name: string
}

/**
 * The one pending, undoable session delete (see useUndoableDelete).
 *
 * Lives in a store, not a view, because a delete starts in the editor and its
 * Undo bar is shown on the session list: the state has to survive the editor
 * unmounting and the list mounting.
 */
export const useSessionDeletionStore = defineStore('sessionDeletion', () => {
  const sessionStore = useSessionStore()

  /** Why the last delete failed, shown on the list for a few seconds. */
  const error = ref<string | null>(null)
  let errorTimer: ReturnType<typeof setTimeout> | null = null

  const deleter = useUndoableDelete<DeletableSession>({
    commit: async (session) => {
      if (!(await sessionStore.deleteSession(session.id))) {
        throw new Error(sessionStore.error ?? 'Failed to delete session')
      }
    },
    onError: (session) => {
      error.value = `Couldn't delete “${session.name}”. It's back in your list.`
      if (errorTimer) clearTimeout(errorTimer)
      errorTimer = setTimeout(() => { error.value = null }, 6000)
    },
  })

  function request(session: DeletableSession) {
    error.value = null
    deleter.request({ id: session.id, name: session.name })
  }

  return {
    pending: deleter.pending,
    isHidden: deleter.isHidden,
    error,
    request,
    undo: deleter.undo,
    flush: deleter.flush,
  }
})
