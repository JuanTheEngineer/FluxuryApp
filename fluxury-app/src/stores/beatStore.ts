import { defineStore } from 'pinia'
import { getBeats } from '../services/api'

interface Beat {
    name: string
    path: string
}

export const useBeatStore = defineStore('beats', {
    state: () => ({
        beats: [] as Beat[]
    }),
    actions: {
        async fetchBeats() {
            const res = await getBeats()
            console.log('🔁 Loaded beats from server:', res.data)
            this.beats = res.data
        },
        addBeat(beat: Beat) {
            console.log('🎵 Added beat:', beat)
            this.beats.push(beat)
        }
    }
})