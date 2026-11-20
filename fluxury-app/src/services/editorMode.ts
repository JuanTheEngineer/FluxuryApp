/**
 * Which lyrics editor this device shows: the classic one, or the timeline
 * ("Try new"). Per device, not per session or account: it is a preference
 * about this screen, and both editors read and write the same document.
 */
export type EditorMode = 'classic' | 'timeline'

const KEY = 'fluxury.editorMode'

export function getEditorMode(): EditorMode {
  try {
    return localStorage.getItem(KEY) === 'timeline' ? 'timeline' : 'classic'
  } catch {
    return 'classic' // storage blocked (private mode): fall back to classic
  }
}

export function setEditorMode(mode: EditorMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Not remembered on this device; the switch still applies to this visit.
  }
}
