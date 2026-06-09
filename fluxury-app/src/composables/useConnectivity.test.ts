import { describe, it, expect, vi, afterEach } from 'vitest'
import { useConnectivity, reportNetworkError, reportNetworkSuccess } from './useConnectivity'

describe('useConnectivity', () => {
  afterEach(() => {
    // Reset singleton state: ensure isOnline is true for next test
    window.dispatchEvent(new Event('online'))
  })

  it('isOnline starts as true (navigator.onLine defaults to true in jsdom)', () => {
    const { isOnline } = useConnectivity()
    expect(isOnline.value).toBe(true)
  })

  it('dispatching window offline event sets isOnline to false', () => {
    const { isOnline } = useConnectivity()

    window.dispatchEvent(new Event('offline'))

    expect(isOnline.value).toBe(false)
  })

  it('dispatching window online event sets isOnline to true', () => {
    const { isOnline } = useConnectivity()

    // First go offline
    window.dispatchEvent(new Event('offline'))
    expect(isOnline.value).toBe(false)

    // Then go online
    window.dispatchEvent(new Event('online'))
    expect(isOnline.value).toBe(true)
  })

  it('onReconnect callback fires when transitioning from offline to online', () => {
    const { onReconnect, offReconnect } = useConnectivity()
    const callback = vi.fn()

    onReconnect(callback)

    // Go offline first
    window.dispatchEvent(new Event('offline'))
    expect(callback).not.toHaveBeenCalled()

    // Transition back to online
    window.dispatchEvent(new Event('online'))
    expect(callback).toHaveBeenCalledTimes(1)

    // Cleanup
    offReconnect(callback)
  })

  it('onReconnect does NOT fire if already online and online event dispatches', () => {
    const { isOnline, onReconnect, offReconnect } = useConnectivity()
    const callback = vi.fn()

    onReconnect(callback)

    // Confirm we're already online
    expect(isOnline.value).toBe(true)

    // Dispatch online event without going offline first
    window.dispatchEvent(new Event('online'))

    expect(callback).not.toHaveBeenCalled()

    // Cleanup
    offReconnect(callback)
  })

  it('offReconnect removes the callback so it does not fire on future transitions', () => {
    const { onReconnect, offReconnect } = useConnectivity()
    const callback = vi.fn()

    onReconnect(callback)
    offReconnect(callback)

    // Go offline then online — callback should not fire
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))

    expect(callback).not.toHaveBeenCalled()
  })

  it('reportNetworkError sets isOnline to false', () => {
    const { isOnline } = useConnectivity()
    expect(isOnline.value).toBe(true)

    reportNetworkError()

    expect(isOnline.value).toBe(false)
  })

  it('reportNetworkSuccess sets isOnline to true and fires reconnect callbacks if was offline', () => {
    const { isOnline, onReconnect, offReconnect } = useConnectivity()
    const callback = vi.fn()

    onReconnect(callback)

    // Go offline first
    reportNetworkError()
    expect(isOnline.value).toBe(false)

    // Report success — should transition to online and fire callback
    reportNetworkSuccess()
    expect(isOnline.value).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)

    // Cleanup
    offReconnect(callback)
  })

  it('reportNetworkSuccess does NOT fire reconnect callbacks if was already online', () => {
    const { isOnline, onReconnect, offReconnect } = useConnectivity()
    const callback = vi.fn()

    onReconnect(callback)

    // Already online
    expect(isOnline.value).toBe(true)

    // Report success — no transition, should not fire callback
    reportNetworkSuccess()
    expect(isOnline.value).toBe(true)
    expect(callback).not.toHaveBeenCalled()

    // Cleanup
    offReconnect(callback)
  })
})
