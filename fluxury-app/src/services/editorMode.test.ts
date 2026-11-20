import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getEditorMode, setEditorMode } from './editorMode'

describe('editor mode (per device)', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to classic', () => {
    expect(getEditorMode()).toBe('classic')
  })

  it('remembers the timeline view, and switching back', () => {
    setEditorMode('timeline')
    expect(getEditorMode()).toBe('timeline')
    setEditorMode('classic')
    expect(getEditorMode()).toBe('classic')
  })

  it('treats an unknown stored value as classic', () => {
    localStorage.setItem('fluxury.editorMode', 'banana')
    expect(getEditorMode()).toBe('classic')
  })

  it('falls back to classic when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getEditorMode()).toBe('classic')
    spy.mockRestore()
  })
})
