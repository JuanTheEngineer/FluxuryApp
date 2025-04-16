import { defineStore } from 'pinia'
import { getBeats } from '../services/api'

interface Beat {
  name: string
  path: string
}

export const useBeatStore = defineStore('beats', {
  state: () => ({
    beats: [] as Beat[],
    selectedBeat: null as Beat | null,
  }),
  actions: {
    async fetchBeats() {
      const res = await getBeats()
      this.beats = res.data
    },
    addBeat(beat: Beat) {
      this.beats.push(beat)
    },
    selectBeat(beat: Beat) {
      this.selectedBeat = beat
    },
  },
})
