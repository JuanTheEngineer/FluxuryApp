import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useTimingMetrics,
  _resetTimingMetrics,
  _internals,
} from './useTimingMetrics'

describe('useTimingMetrics', () => {
  beforeEach(() => {
    _resetTimingMetrics()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    _resetTimingMetrics()
  })

  describe('recordAppLoadStart', () => {
    it('records performance.now() on first call', () => {
      vi.spyOn(performance, 'now').mockReturnValue(100)
      const { recordAppLoadStart } = useTimingMetrics()

      recordAppLoadStart()

      expect(_internals.appLoadStart.value).toBe(100)
    })

    it('ignores subsequent calls (first-wins)', () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200)
      const { recordAppLoadStart } = useTimingMetrics()

      recordAppLoadStart()
      recordAppLoadStart()

      expect(_internals.appLoadStart.value).toBe(100)
    })
  })

  describe('recordBeatAudible', () => {
    it('records performance.now() on first call', () => {
      vi.spyOn(performance, 'now').mockReturnValue(250)
      const { recordBeatAudible } = useTimingMetrics()

      recordBeatAudible()

      expect(_internals.beatAudible.value).toBe(250)
    })

    it('ignores subsequent calls (first-wins)', () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(250).mockReturnValueOnce(500)
      const { recordBeatAudible } = useTimingMetrics()

      recordBeatAudible()
      recordBeatAudible()

      expect(_internals.beatAudible.value).toBe(250)
    })
  })

  describe('recordEditorFocused', () => {
    it('records performance.now() on first call', () => {
      vi.spyOn(performance, 'now').mockReturnValue(300)
      const { recordEditorFocused } = useTimingMetrics()

      recordEditorFocused()

      expect(_internals.editorFocused.value).toBe(300)
    })

    it('ignores subsequent calls (first-wins)', () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(300).mockReturnValueOnce(600)
      const { recordEditorFocused } = useTimingMetrics()

      recordEditorFocused()
      recordEditorFocused()

      expect(_internals.editorFocused.value).toBe(300)
    })
  })

  describe('recordFirstSaveSuccess', () => {
    it('records performance.now() on first call', () => {
      vi.spyOn(performance, 'now').mockReturnValue(5000)
      const { recordFirstSaveSuccess } = useTimingMetrics()

      recordFirstSaveSuccess()

      expect(_internals.firstSaveSuccess.value).toBe(5000)
    })

    it('ignores subsequent calls (first-wins)', () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(5000).mockReturnValueOnce(8000)
      const { recordFirstSaveSuccess } = useTimingMetrics()

      recordFirstSaveSuccess()
      recordFirstSaveSuccess()

      expect(_internals.firstSaveSuccess.value).toBe(5000)
    })
  })

  describe('timeToFirstLyric computation', () => {
    it('returns difference when firstSaveSuccess > appLoadStart', () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(4600)
      const { recordAppLoadStart, recordFirstSaveSuccess, metrics } = useTimingMetrics()

      recordAppLoadStart()
      recordFirstSaveSuccess()

      expect(metrics.value.timeToFirstLyric).toBe(4500)
    })

    it('returns 0 when appLoadStart is null', () => {
      vi.spyOn(performance, 'now').mockReturnValue(5000)
      const { recordFirstSaveSuccess, metrics } = useTimingMetrics()

      recordFirstSaveSuccess()

      expect(metrics.value.timeToFirstLyric).toBe(0)
    })

    it('returns 0 when firstSaveSuccess is null', () => {
      vi.spyOn(performance, 'now').mockReturnValue(100)
      const { recordAppLoadStart, metrics } = useTimingMetrics()

      recordAppLoadStart()

      expect(metrics.value.timeToFirstLyric).toBe(0)
    })

    it('returns 0 and logs warning when firstSaveSuccess <= appLoadStart', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(performance, 'now').mockReturnValueOnce(5000).mockReturnValueOnce(100)
      const { recordAppLoadStart, recordFirstSaveSuccess, metrics } = useTimingMetrics()

      recordAppLoadStart() // 5000
      recordFirstSaveSuccess() // 100

      expect(metrics.value.timeToFirstLyric).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith('[useTimingMetrics] clock-ordering warning')
    })

    it('returns 0 and logs warning when firstSaveSuccess equals appLoadStart', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(performance, 'now').mockReturnValue(500)
      const { recordAppLoadStart, recordFirstSaveSuccess, metrics } = useTimingMetrics()

      recordAppLoadStart()
      recordFirstSaveSuccess()

      expect(metrics.value.timeToFirstLyric).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith('[useTimingMetrics] clock-ordering warning')
    })
  })

  describe('metrics reactive ref', () => {
    it('exposes all timestamps and computed TTFL', () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(300)
        .mockReturnValueOnce(4500)

      const { recordAppLoadStart, recordBeatAudible, recordEditorFocused, recordFirstSaveSuccess, metrics } =
        useTimingMetrics()

      recordAppLoadStart()
      recordBeatAudible()
      recordEditorFocused()
      recordFirstSaveSuccess()

      expect(metrics.value).toEqual({
        appLoadStart: 10,
        beatAudible: 200,
        editorFocused: 300,
        firstSaveSuccess: 4500,
        timeToFirstLyric: 4490,
      })
    })
  })

  describe('singleton behavior', () => {
    it('shares state across multiple useTimingMetrics() calls', () => {
      vi.spyOn(performance, 'now').mockReturnValue(42)
      const instance1 = useTimingMetrics()
      const instance2 = useTimingMetrics()

      instance1.recordAppLoadStart()

      expect(instance2.metrics.value.appLoadStart).toBe(42)
    })
  })

  describe('window.__fluxury_metrics', () => {
    it('exposes metrics on window object', () => {
      vi.spyOn(performance, 'now').mockReturnValue(77)
      const { recordAppLoadStart } = useTimingMetrics()

      recordAppLoadStart()

      expect(window.__fluxury_metrics?.appLoadStart).toBe(77)
    })
  })
})
