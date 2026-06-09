import { describe, it, expect, vi } from 'vitest'
import {
  useSessionLifecycle,
  isValidTransition,
  VALID_TRANSITIONS,
  type SessionLifecycleState,
} from './useSessionLifecycle'

describe('isValidTransition', () => {
  it('returns true for valid transitions', () => {
    expect(isValidTransition('idle', 'loading')).toBe(true)
    expect(isValidTransition('loading', 'ready')).toBe(true)
    expect(isValidTransition('loading', 'error')).toBe(true)
    expect(isValidTransition('ready', 'editing')).toBe(true)
    expect(isValidTransition('editing', 'saving')).toBe(true)
    expect(isValidTransition('saving', 'saved')).toBe(true)
    expect(isValidTransition('saving', 'error')).toBe(true)
    expect(isValidTransition('saving', 'editing')).toBe(true)
    expect(isValidTransition('saved', 'editing')).toBe(true)
    expect(isValidTransition('error', 'loading')).toBe(true)
  })

  it('returns false for invalid transitions', () => {
    expect(isValidTransition('idle', 'ready')).toBe(false)
    expect(isValidTransition('idle', 'editing')).toBe(false)
    expect(isValidTransition('ready', 'saving')).toBe(false)
    expect(isValidTransition('saved', 'idle')).toBe(false)
    expect(isValidTransition('error', 'saved')).toBe(false)
  })
})

describe('VALID_TRANSITIONS', () => {
  it('covers all states as keys', () => {
    const allStates: SessionLifecycleState[] = [
      'idle', 'loading', 'ready', 'editing', 'saving', 'saved', 'error',
    ]
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(allStates.sort())
  })
})

describe('useSessionLifecycle', () => {
  it('starts in idle state by default', () => {
    const { state } = useSessionLifecycle()
    expect(state.value).toBe('idle')
  })

  it('accepts a custom initial state', () => {
    const { state } = useSessionLifecycle('loading')
    expect(state.value).toBe('loading')
  })

  it('transitions to a valid target and returns true', () => {
    const { state, transition } = useSessionLifecycle('idle')

    const result = transition('loading')

    expect(result).toBe(true)
    expect(state.value).toBe('loading')
  })

  it('rejects an invalid transition, returns false, and leaves state unchanged', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { state, transition } = useSessionLifecycle('idle')

    const result = transition('saved')

    expect(result).toBe(false)
    expect(state.value).toBe('idle')
    warnSpy.mockRestore()
  })

  it('logs state-machine-violation on invalid transition', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { transition } = useSessionLifecycle('idle')

    transition('saved')

    expect(warnSpy).toHaveBeenCalledWith('state-machine-violation', {
      current: 'idle',
      attempted: 'saved',
    })
    warnSpy.mockRestore()
  })

  it('supports a full valid lifecycle path', () => {
    const { state, transition } = useSessionLifecycle()

    expect(transition('loading')).toBe(true)
    expect(state.value).toBe('loading')

    expect(transition('ready')).toBe(true)
    expect(state.value).toBe('ready')

    expect(transition('editing')).toBe(true)
    expect(state.value).toBe('editing')

    expect(transition('saving')).toBe(true)
    expect(state.value).toBe('saving')

    expect(transition('saved')).toBe(true)
    expect(state.value).toBe('saved')

    expect(transition('editing')).toBe(true)
    expect(state.value).toBe('editing')
  })

  it('supports error recovery path', () => {
    const { state, transition } = useSessionLifecycle('loading')

    expect(transition('error')).toBe(true)
    expect(state.value).toBe('error')

    expect(transition('loading')).toBe(true)
    expect(state.value).toBe('loading')
  })

  it('supports editing during save transition', () => {
    const { state, transition } = useSessionLifecycle('saving')

    expect(transition('editing')).toBe(true)
    expect(state.value).toBe('editing')
  })
})
