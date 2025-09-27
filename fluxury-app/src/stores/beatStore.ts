import { defineStore } from 'pinia'
import { beatsApi } from '@/api/api-clients'
import type { ListBeatsResponseContent, BeatSummary } from '@/api/open-api/beat-client'

export const useBeatStore = defineStore('beatStore', {
  state: () => ({
    beats: [] as ListBeatsResponseContent['beats'],
    selectedBeat: null as BeatSummary | null,
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchBeats() {
      this.isLoading = true
      this.error = null
      try {
        const res = await beatsApi.listBeats()
        this.beats = res.data.beats
      } catch (err) {
        this.error = 'Failed to load beats'
        console.error(err)
      } finally {
        this.isLoading = false
      }
    },
    selectBeat(beat: BeatSummary | null) {
      this.selectedBeat = beat
    },
  },
})
