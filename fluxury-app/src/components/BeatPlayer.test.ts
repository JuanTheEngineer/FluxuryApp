import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import BeatPlayer from './BeatPlayer.vue'

// Mock howler — Web Audio API is not available in jsdom
vi.mock('howler', () => {
  const mockHowl = vi.fn().mockImplementation((config: any) => {
    const instance = {
      play: vi.fn(() => { config.onplay?.() }),
      pause: vi.fn(() => { config.onpause?.() }),
      stop: vi.fn(() => { config.onstop?.() }),
      seek: vi.fn((pos?: number) => pos ?? 0),
      volume: vi.fn((v?: number) => v ?? config.volume ?? 0.8),
      loop: vi.fn((l?: boolean) => l ?? config.loop ?? true),
      duration: vi.fn(() => 200),
      playing: vi.fn(() => false),
      unload: vi.fn(),
    }
    // Trigger onload after a tick so the component processes it
    setTimeout(() => config.onload?.(), 0)
    return instance
  })
  return { Howl: mockHowl }
})

// Import after mock so we can inspect Howl calls
import { Howl } from 'howler'
const MockedHowl = vi.mocked(Howl)

describe('BeatPlayer enhancements', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockedHowl.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper to mount and wait for Howl onload
  async function mountPlayer(props: Record<string, unknown> = {}) {
    const wrapper = mount(BeatPlayer, {
      props: {
        beatUrl: '/beats/test.wav',
        ...props,
      },
    })
    // Advance timers to trigger the setTimeout onload callback
    vi.advanceTimersByTime(1)
    await flushPromises()
    await nextTick()
    return wrapper
  }

  function getHowlInstance() {
    const calls = MockedHowl.mock.results
    return calls[calls.length - 1]?.value as any
  }

  describe('beat-audible event', () => {
    it('fires exactly once on first play trigger', async () => {
      const wrapper = await mountPlayer()
      const howlInstance = getHowlInstance()

      // Simulate user pressing play
      howlInstance.playing.mockReturnValue(false)
      await wrapper.find('button').findAll('button')
      // Find the Play button and click it
      const playButton = wrapper.findAll('button').find(b => b.text() === 'Play')
      expect(playButton).toBeDefined()
      await playButton!.trigger('click')

      expect(wrapper.emitted('beat-audible')).toHaveLength(1)
    })

    it('does NOT fire on second play trigger (same session)', async () => {
      const wrapper = await mountPlayer()
      const howlInstance = getHowlInstance()

      // First play
      howlInstance.playing.mockReturnValue(false)
      const playButton = wrapper.findAll('button').find(b => b.text() === 'Play')
      await playButton!.trigger('click')

      // After first play, the button text changes to 'Pause'
      await nextTick()

      // Pause then play again
      howlInstance.playing.mockReturnValue(true)
      const pauseButton = wrapper.findAll('button').find(b => b.text() === 'Pause')
      if (pauseButton) {
        await pauseButton.trigger('click')
      }
      await nextTick()

      // Play again
      howlInstance.playing.mockReturnValue(false)
      const playButton2 = wrapper.findAll('button').find(b => b.text() === 'Play')
      if (playButton2) {
        await playButton2.trigger('click')
      }

      // Should still only have emitted once
      expect(wrapper.emitted('beat-audible')).toHaveLength(1)
    })

    it('resets when beatUrl prop changes (new session)', async () => {
      const wrapper = await mountPlayer()
      const firstHowl = getHowlInstance()

      // First play
      firstHowl.playing.mockReturnValue(false)
      const playButton = wrapper.findAll('button').find(b => b.text() === 'Play')
      await playButton!.trigger('click')

      expect(wrapper.emitted('beat-audible')).toHaveLength(1)

      // Change the beat URL (new session)
      await wrapper.setProps({ beatUrl: '/beats/another.wav' })
      vi.advanceTimersByTime(1)
      await flushPromises()
      await nextTick()

      // Play on the new beat
      const secondHowl = getHowlInstance()
      secondHowl.playing.mockReturnValue(false)
      const newPlayButton = wrapper.findAll('button').find(b => b.text() === 'Play')
      await newPlayButton!.trigger('click')

      // Should have fired again for the new session
      expect(wrapper.emitted('beat-audible')).toHaveLength(2)
    })
  })

  describe('initialPosition prop', () => {
    it('seeks to initialPosition on load without playing', async () => {
      const wrapper = await mountPlayer({ initialPosition: 45 })
      const howlInstance = getHowlInstance()

      // Seek should have been called with the initial position
      expect(howlInstance.seek).toHaveBeenCalledWith(45)

      // Should NOT have called play — component stays paused
      expect(howlInstance.play).not.toHaveBeenCalled()

      // The button should say 'Play' (not playing)
      const playButton = wrapper.findAll('button').find(b => b.text() === 'Play')
      expect(playButton).toBeDefined()
    })
  })

  describe('initialVolume prop', () => {
    it('Howl is constructed with the provided volume', async () => {
      await mountPlayer({ initialVolume: 0.5 })

      // Verify the Howl constructor was called with the provided volume
      const calls = MockedHowl.mock.calls
      const constructorCall = calls[calls.length - 1][0] as any
      expect(constructorCall.volume).toBe(0.5)
    })

    it('defaults to 0.8 when initialVolume is not provided', async () => {
      await mountPlayer()

      const calls = MockedHowl.mock.calls
      const constructorCall = calls[calls.length - 1][0] as any
      expect(constructorCall.volume).toBe(0.8)
    })
  })

  describe('initialLoop prop', () => {
    it('Howl is constructed with the provided loop state', async () => {
      await mountPlayer({ initialLoop: false })

      const calls = MockedHowl.mock.calls
      const constructorCall = calls[calls.length - 1][0] as any
      expect(constructorCall.loop).toBe(false)
    })

    it('Howl is constructed with loop=true when initialLoop=true is provided', async () => {
      await mountPlayer({ initialLoop: true })

      const calls = MockedHowl.mock.calls
      const constructorCall = calls[calls.length - 1][0] as any
      expect(constructorCall.loop).toBe(true)
    })
  })

  describe('update:playbackState event', () => {
    it('emits when user changes volume', async () => {
      const wrapper = await mountPlayer()
      const howlInstance = getHowlInstance()
      howlInstance.seek.mockReturnValue(10)

      // Find the volume range input and change it
      const volumeInput = wrapper.findAll('input[type="range"]').find(
        input => input.attributes('max') === '1'
      )
      expect(volumeInput).toBeDefined()

      await volumeInput!.setValue(0.5)
      await volumeInput!.trigger('input')
      await nextTick()

      const emitted = wrapper.emitted('update:playbackState')
      expect(emitted).toBeDefined()
      expect(emitted!.length).toBeGreaterThanOrEqual(1)

      // Check the emitted payload contains volume info
      const lastPayload = emitted![emitted!.length - 1][0] as any
      expect(lastPayload).toHaveProperty('volume')
      expect(lastPayload).toHaveProperty('position')
      expect(lastPayload).toHaveProperty('looping')
    })

    it('emits when user toggles loop', async () => {
      const wrapper = await mountPlayer()
      const howlInstance = getHowlInstance()
      howlInstance.seek.mockReturnValue(10)
      // mock loop() to return current state then toggled state
      howlInstance.loop.mockReturnValue(true)

      // Find the loop toggle button
      const loopButton = wrapper.findAll('button').find(b => b.text().includes('Loop'))
      expect(loopButton).toBeDefined()
      await loopButton!.trigger('click')
      await nextTick()

      const emitted = wrapper.emitted('update:playbackState')
      expect(emitted).toBeDefined()
      expect(emitted!.length).toBeGreaterThanOrEqual(1)

      const lastPayload = emitted![emitted!.length - 1][0] as any
      expect(lastPayload).toHaveProperty('looping')
    })

    it('does NOT emit during programmatic seek on mount (initialPosition)', async () => {
      await mountPlayer({ initialPosition: 30 })

      // The component should NOT have emitted update:playbackState
      // because seeking on mount is a non-user (programmatic) action
      const wrapper = mount(BeatPlayer, {
        props: {
          beatUrl: '/beats/resume.wav',
          initialPosition: 30,
        },
      })
      vi.advanceTimersByTime(1)
      await flushPromises()
      await nextTick()

      const emitted = wrapper.emitted('update:playbackState')
      // Should not emit during programmatic operations on mount
      expect(emitted).toBeUndefined()
    })
  })
})
