import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUndoableDelete } from './useUndoableDelete'

type Item = { id: string; name: string }
const a: Item = { id: 'a', name: 'A' }
const b: Item = { id: 'b', name: 'B' }

function setup(commit = vi.fn<(item: Item) => Promise<void>>().mockResolvedValue(undefined)) {
  const onError = vi.fn()
  const del = useUndoableDelete<Item>({ commit, onError, undoMs: 5000 })
  return { ...del, commit, onError }
}

describe('useUndoableDelete', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('hides the item immediately but does not delete it yet', () => {
    const d = setup()
    d.request(a)
    expect(d.isHidden.value('a')).toBe(true)
    expect(d.isHidden.value('b')).toBe(false)
    expect(d.pending.value).toBe(a)
    expect(d.commit).not.toHaveBeenCalled()
  })

  it('deletes once the undo window passes', async () => {
    const d = setup()
    d.request(a)
    await vi.advanceTimersByTimeAsync(4999)
    expect(d.commit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(d.commit).toHaveBeenCalledWith(a)
    expect(d.pending.value).toBeNull()
  })

  it('undo restores the item and never deletes it', async () => {
    const d = setup()
    d.request(a)
    d.undo()
    expect(d.isHidden.value('a')).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(d.commit).not.toHaveBeenCalled()
  })

  it('deleting a second item commits the first right away', async () => {
    const d = setup()
    d.request(a)
    d.request(b)
    await vi.advanceTimersByTimeAsync(0)
    expect(d.commit).toHaveBeenCalledTimes(1)
    expect(d.commit).toHaveBeenCalledWith(a)
    expect(d.pending.value).toBe(b)
  })

  it('undo after a second delete only restores the second', async () => {
    const d = setup()
    d.request(a)
    d.request(b)
    d.undo()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(d.commit).toHaveBeenCalledTimes(1)
    expect(d.commit).toHaveBeenCalledWith(a)
  })

  it('flush commits the pending delete now (leaving the page)', async () => {
    const d = setup()
    d.request(a)
    await d.flush()
    expect(d.commit).toHaveBeenCalledWith(a)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(d.commit).toHaveBeenCalledTimes(1)
  })

  it('keeps the item hidden while the delete is in flight', async () => {
    let finish!: () => void
    const d = setup(vi.fn(() => new Promise<void>((r) => { finish = r })))
    d.request(a)
    await vi.advanceTimersByTimeAsync(5000)
    expect(d.pending.value).toBeNull()
    expect(d.isHidden.value('a')).toBe(true)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(d.isHidden.value('a')).toBe(false) // the caller's list has removed it by now
  })

  it('a failed delete reports the error and un-hides the item', async () => {
    const error = new Error('500')
    const d = setup(vi.fn().mockRejectedValue(error))
    d.request(a)
    await vi.advanceTimersByTimeAsync(5000)
    expect(d.onError).toHaveBeenCalledWith(a, error)
    expect(d.isHidden.value('a')).toBe(false)
  })

  it('ignores a repeat request for the same item (double tap)', async () => {
    const d = setup()
    d.request(a)
    d.request(a)
    await vi.advanceTimersByTimeAsync(5000)
    expect(d.commit).toHaveBeenCalledTimes(1)
  })
})
