import { computed, ref, shallowRef } from 'vue'

/**
 * Delete with an undo window (the Gmail pattern): the item disappears at once,
 * and the real delete runs only after `undoMs` unless the user undoes it.
 * Lyrics can't be recreated, so this replaces a confirm dialog: deleting stays
 * one tap, and a mistaken tap costs nothing.
 *
 * - One item is undoable at a time; deleting another commits the first now.
 * - flush() commits right away (call it when the list unmounts: leaving the
 *   page means the user moved on).
 * - If the delete fails, the item is no longer hidden, so it reappears.
 * - If the tab closes during the window, nothing is deleted (the safe side).
 */
export interface UndoableDeleteOptions<T extends { id: string }> {
  commit: (item: T) => Promise<void>
  onError?: (item: T, error: unknown) => void
  undoMs?: number
}

export function useUndoableDelete<T extends { id: string }>(options: UndoableDeleteOptions<T>) {
  const { commit, onError, undoMs = 5000 } = options

  const pending = shallowRef<T | null>(null)
  const committing = ref(new Set<string>())
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function run(item: T): Promise<void> {
    committing.value = new Set(committing.value).add(item.id)
    try {
      await commit(item)
    } catch (error) {
      onError?.(item, error)
    } finally {
      const next = new Set(committing.value)
      next.delete(item.id)
      committing.value = next
    }
  }

  /** Commit the pending delete now, if there is one. */
  async function flush(): Promise<void> {
    clearTimer()
    const item = pending.value
    if (!item) return
    pending.value = null
    await run(item)
  }

  function request(item: T): void {
    if (pending.value?.id === item.id || committing.value.has(item.id)) return
    void flush() // a previous pending delete is committed, not dropped
    pending.value = item
    timer = setTimeout(() => void flush(), undoMs)
  }

  function undo(): void {
    clearTimer()
    pending.value = null
  }

  /** Hidden from the list: waiting out the undo window, or being deleted. */
  const isHidden = computed(() => {
    const pendingId = pending.value?.id
    const deleting = committing.value
    return (id: string) => id === pendingId || deleting.has(id)
  })

  return { pending, isHidden, request, undo, flush }
}
