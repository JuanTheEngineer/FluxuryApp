import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SaveStatus from './SaveStatus.vue'
import type { SaveStatus as SaveStatusType } from '@/composables/useAutosave'

describe('SaveStatus.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountComponent(props: {
    status: SaveStatusType
    lastSavedAt?: number | null
    onRetry?: () => void
  }) {
    return mount(SaveStatus, {
      props: {
        lastSavedAt: null,
        onRetry: () => {},
        ...props,
      },
    })
  }

  // --- Label state rendering ---

  it('idle status renders no visible text', () => {
    const wrapper = mountComponent({ status: 'idle' })
    expect(wrapper.text()).toBe('')
  })

  it('dirty status renders no visible text', () => {
    const wrapper = mountComponent({ status: 'dirty' })
    expect(wrapper.text()).toBe('')
  })

  it('saving status renders "Saving…"', () => {
    const wrapper = mountComponent({ status: 'saving' })
    expect(wrapper.text()).toBe('Saving…')
  })

  it('saved status with recent lastSavedAt renders "Saved · just now"', () => {
    const now = Date.now()
    const wrapper = mountComponent({ status: 'saved', lastSavedAt: now })
    expect(wrapper.text()).toBe('Saved · just now')
  })

  it('saved status with lastSavedAt 30+ seconds ago renders seconds elapsed', () => {
    const now = Date.now()
    const thirtySecondsAgo = now - 30000
    const wrapper = mountComponent({ status: 'saved', lastSavedAt: thirtySecondsAgo })
    expect(wrapper.text()).toBe('Saved · 30 seconds ago')
  })

  it('saved status with lastSavedAt 2+ minutes ago renders minutes elapsed', () => {
    const now = Date.now()
    const twoMinutesAgo = now - 120000
    const wrapper = mountComponent({ status: 'saved', lastSavedAt: twoMinutesAgo })
    expect(wrapper.text()).toBe('Saved · 2 minutes ago')
  })

  it('offline_saved_locally status renders "Offline — saved locally"', () => {
    const wrapper = mountComponent({ status: 'offline_saved_locally' })
    expect(wrapper.text()).toBe('Offline — saved locally')
  })

  it('error status renders "Save failed" and a Retry button', () => {
    const wrapper = mountComponent({ status: 'error' })
    expect(wrapper.text()).toContain('Save failed')
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('Retry')
  })

  // --- Retry button behavior ---

  it('retry button fires onRetry callback when clicked', async () => {
    const onRetry = vi.fn()
    const wrapper = mountComponent({ status: 'error', onRetry })

    await wrapper.find('button').trigger('click')

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('retry button is NOT rendered for non-error statuses', () => {
    const nonErrorStatuses: SaveStatusType[] = ['idle', 'dirty', 'saving', 'saved', 'offline_saved_locally']

    for (const status of nonErrorStatuses) {
      const wrapper = mountComponent({ status, lastSavedAt: Date.now() })
      expect(wrapper.find('button').exists()).toBe(false)
    }
  })

  // --- Elapsed time interval updates ---

  it('30-second interval updates the elapsed label', async () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const wrapper = mountComponent({ status: 'saved', lastSavedAt: now })
    expect(wrapper.text()).toBe('Saved · just now')

    // Advance 30 seconds — the interval should fire and update the label
    vi.advanceTimersByTime(30000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toBe('Saved · 30 seconds ago')

    // Advance another 30 seconds (total 60s = 1 minute)
    vi.advanceTimersByTime(30000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toBe('Saved · 1 minute ago')
  })

  // --- Interval cleanup on unmount ---

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const now = Date.now()
    vi.setSystemTime(now)

    const wrapper = mountComponent({ status: 'saved', lastSavedAt: now })

    wrapper.unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
