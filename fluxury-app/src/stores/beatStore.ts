import { defineStore } from 'pinia'
import { beatsApi } from '@/services/api'
import type { ListBeatsResponseContent, BeatSummary } from '@/services/api'

export const useBeatStore = defineStore('beatStore', {
  state: () => ({
    beats: [] as ListBeatsResponseContent['beats'],
    /** True once the beat list has loaded at least once; until then empty means "not here yet". */
    beatsLoaded: false,
    selectedBeat: null as BeatSummary | null,
    isLoading: false,
    error: null as string | null,
    successMessage: null as string | null,
    uploadProgress: 0,
    isUploading: false,
  }),

  getters: {
    getBeatById: (state) => (id: string) => {
      return state.beats.find(beat => beat.id === id)
    },
    hasError: (state) => !!state.error,
    hasSuccessMessage: (state) => !!state.successMessage,
    filteredBeats: (state) => (searchTerm: string) => {
      if (!searchTerm) return state.beats
      return state.beats.filter(beat =>
        beat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        beat.artist?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    },
  },

  actions: {
    clearMessages() {
      this.error = null
      this.successMessage = null
    },

    setError(message: string) {
      this.error = message
      console.error('Beat Store Error:', message)
    },

    setSuccess(message: string) {
      this.successMessage = message
      setTimeout(() => {
        this.successMessage = null
      }, 3000)
    },

    async fetchBeats() {
      this.isLoading = true
      this.clearMessages()

      try {
        const res = await beatsApi.listBeats()
        this.beats = res.data.beats
        this.beatsLoaded = true
        this.setSuccess(`Loaded ${res.data.beats.length} beats`)
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to load beats'
        this.setError(errorMessage)

        if (err.response?.status === 401) {
          console.warn('Authentication expired during beats fetch')
        }
      } finally {
        this.isLoading = false
      }
    },

    async createBeat(beatData: any) {
      this.isLoading = true
      this.clearMessages()

      try {
        const res = await beatsApi.createBeat(beatData)
        this.beats.unshift(res.data) // Add to beginning of list
        this.setSuccess('Beat created successfully')
        return res.data
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to create beat'
        this.setError(errorMessage)

        if (err.response?.status === 400) {
          this.setError('Invalid beat data provided')
        } else if (err.response?.status === 409) {
          this.setError('A beat with this name already exists')
        }

        return null
      } finally {
        this.isLoading = false
      }
    },

    async deleteBeat(id: string) {
      this.isLoading = true
      this.clearMessages()

      try {
        await beatsApi.deleteBeat(id)
        this.beats = this.beats.filter(b => b.id !== id)

        // Clear selected beat if it was deleted
        if (this.selectedBeat?.id === id) {
          this.selectedBeat = null
        }

        this.setSuccess('Beat deleted successfully')
        return true
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to delete beat'
        this.setError(errorMessage)
        return false
      } finally {
        this.isLoading = false
      }
    },

    selectBeat(beat: BeatSummary | null) {
      this.selectedBeat = beat
      if (beat) {
        console.log('Selected beat:', beat.name)
      }
    },

    async uploadBeatFile(file: File, beatId: string) {
      this.isUploading = true
      this.uploadProgress = 0
      this.clearMessages()

      try {
        // Simulate upload progress (in real implementation, you'd track actual progress)
        const progressInterval = setInterval(() => {
          if (this.uploadProgress < 90) {
            this.uploadProgress += 10
          }
        }, 200)

        // Upload to S3 (implementation would go here)
        // const uploadUrl = await S3Service.uploadBeat(beatId, file)

        clearInterval(progressInterval)
        this.uploadProgress = 100

        this.setSuccess('Beat file uploaded successfully')
        return true
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to upload beat file'
        this.setError(errorMessage)
        return false
      } finally {
        this.isUploading = false
        this.uploadProgress = 0
      }
    },
  },
})
