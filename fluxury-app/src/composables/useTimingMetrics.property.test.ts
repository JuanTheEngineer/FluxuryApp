import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { useTimingMetrics, _resetTimingMetrics, _internals } from './useTimingMetrics'

// Tag: Feature: creative-core-loop, Property 14: Time-to-First-Lyric computation correctness

/**
 * **Validates: Requirements 12.5, 12.6, 12.7**
 *
 * Property 14: Time-to-First-Lyric computation correctness
 * For any pair of timestamps (app_load_start, first_save_success) where
 * first_save_success > app_load_start > 0, TTFL SHALL equal
 * first_save_success − app_load_start. For all other cases (null values,
 * first_save_success ≤ app_load_start), TTFL SHALL equal 0.
 */
describe('Property 14: TTFL computation correctness', () => {
  beforeEach(() => {
    _resetTimingMetrics()
    vi.restoreAllMocks()
  })

  it('TTFL = firstSaveSuccess - appLoadStart when both > 0 and save > start', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (start, additionalTime) => {
          _resetTimingMetrics()
          const saveTime = start + additionalTime // guaranteed > start

          vi.spyOn(performance, 'now')
            .mockReturnValueOnce(start)
            .mockReturnValueOnce(saveTime)

          const { recordAppLoadStart, recordFirstSaveSuccess, metrics } = useTimingMetrics()
          recordAppLoadStart()
          recordFirstSaveSuccess()

          const expected = saveTime - start
          expect(metrics.value.timeToFirstLyric).toBeCloseTo(expected, 2)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('TTFL = 0 when appLoadStart is null (not recorded)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (saveTime) => {
          _resetTimingMetrics()
          vi.spyOn(performance, 'now').mockReturnValue(saveTime)

          const { recordFirstSaveSuccess, metrics } = useTimingMetrics()
          // Don't record appLoadStart
          recordFirstSaveSuccess()

          expect(metrics.value.timeToFirstLyric).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('TTFL = 0 when firstSaveSuccess is null (not recorded)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (startTime) => {
          _resetTimingMetrics()
          vi.spyOn(performance, 'now').mockReturnValue(startTime)

          const { recordAppLoadStart, metrics } = useTimingMetrics()
          recordAppLoadStart()
          // Don't record firstSaveSuccess

          expect(metrics.value.timeToFirstLyric).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('TTFL = 0 when firstSaveSuccess <= appLoadStart (clock ordering issue)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (start, ratio) => {
          _resetTimingMetrics()
          // saveTime <= start (use ratio to get value between 0 and start)
          const saveTime = start * ratio

          vi.spyOn(console, 'warn').mockImplementation(() => {})
          vi.spyOn(performance, 'now')
            .mockReturnValueOnce(start)
            .mockReturnValueOnce(saveTime)

          const { recordAppLoadStart, recordFirstSaveSuccess, metrics } = useTimingMetrics()
          recordAppLoadStart()
          recordFirstSaveSuccess()

          expect(metrics.value.timeToFirstLyric).toBe(0)

          vi.restoreAllMocks()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('TTFL = 0 when both timestamps are null (nothing recorded)', () => {
    _resetTimingMetrics()
    const { metrics } = useTimingMetrics()
    expect(metrics.value.timeToFirstLyric).toBe(0)
  })

  it('TTFL computation is deterministic — same inputs produce same output', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 50000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 50000, noNaN: true, noDefaultInfinity: true }),
        (start, additional) => {
          const save = start + additional

          // First computation
          _resetTimingMetrics()
          vi.spyOn(performance, 'now')
            .mockReturnValueOnce(start)
            .mockReturnValueOnce(save)
          const m1 = useTimingMetrics()
          m1.recordAppLoadStart()
          m1.recordFirstSaveSuccess()
          const ttfl1 = m1.metrics.value.timeToFirstLyric

          // Second computation with same values
          _resetTimingMetrics()
          vi.spyOn(performance, 'now')
            .mockReturnValueOnce(start)
            .mockReturnValueOnce(save)
          const m2 = useTimingMetrics()
          m2.recordAppLoadStart()
          m2.recordFirstSaveSuccess()
          const ttfl2 = m2.metrics.value.timeToFirstLyric

          expect(ttfl1).toBeCloseTo(ttfl2, 5)
        }
      ),
      { numRuns: 100 }
    )
  })
})
