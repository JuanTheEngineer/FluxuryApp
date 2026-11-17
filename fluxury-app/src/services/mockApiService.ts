// Mock API service for local development demo

import { ScriptConflictError, type ExpectedVersion } from './scriptConflict'
import {
  mockSessions,
  mockBeats,
  mockUser,
  simulateDelay,
  generateMoreSessions
} from '@/data/mockData'

// Simulate local storage for session state
export class MockStorage {
  private sessions = [...mockSessions, ...generateMoreSessions(7)]
  private beats = [...mockBeats]
  private user = mockUser
  private authenticated = true

  // Session operations
  async getSessions() {
    await simulateDelay()
    return {
      data: {
        sessions: this.sessions.map(session => ({
          id: session.id,
          name: session.name,
          author: session.author,
          created: session.created,
          modified: session.modified,
          artworkUrl: session.artworkUrl,
          beatUrl: session.beatUrl
        }))
      }
    }
  }

  async getSession(id: string) {
    await simulateDelay()
    const session = this.sessions.find(s => s.id === id)
    if (!session) {
      throw new Error('Session not found')
    }

    // Parse script from JSON string to actual Quill delta
    let script = session.script
    try {
      script = typeof session.script === 'string' ? JSON.parse(session.script) : session.script
    } catch (e) {
      script = { ops: [{ insert: 'Error loading script content\n' }] }
    }

    return {
      data: {
        ...session,
        script: `data:application/json;base64,${btoa(JSON.stringify(script))}`
      }
    }
  }

  async createSession(payload: any) {
    await simulateDelay()
    const newSession = {
      id: `session-${Date.now()}`,
      name: payload.name || 'Untitled Session',
      author: payload.author || this.user.name,
      beatUrl: payload.beatUrl || '',
      artworkUrl: payload.artworkUrl || `https://picsum.photos/300/300?random=${Date.now()}`,
      script: JSON.stringify({ ops: [{ insert: '\n' }] }),
      userId: this.user.sub,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }

    this.sessions.unshift(newSession)
    return { data: newSession }
  }

  async updateSession(id: string, payload: any) {
    await simulateDelay()
    const sessionIndex = this.sessions.findIndex(s => s.id === id)
    if (sessionIndex === -1) {
      throw new Error('Session not found')
    }

    this.sessions[sessionIndex] = {
      ...this.sessions[sessionIndex],
      ...payload,
      modified: new Date().toISOString()
    }

    return { data: this.sessions[sessionIndex] }
  }

  async deleteSession(id: string) {
    await simulateDelay()
    const sessionIndex = this.sessions.findIndex(s => s.id === id)
    if (sessionIndex === -1) {
      throw new Error('Session not found')
    }

    this.sessions.splice(sessionIndex, 1)
    return { data: { success: true } }
  }

  // Beat operations
  async getBeats() {
    await simulateDelay()
    return {
      data: {
        beats: this.beats
      }
    }
  }

  async createBeat(payload: any) {
    await simulateDelay()
    const newBeat = {
      id: `beat-${Date.now()}`,
      name: payload.name || 'Untitled Beat',
      artist: payload.artist || 'Unknown Artist',
      path: payload.path || 'https://www.soundjay.com/misc/sounds-for-games/beep-07a.wav',
      duration: payload.duration || 180,
      bpm: payload.bpm || 120,
      genre: payload.genre || 'Hip Hop',
      tags: payload.tags || [],
      artworkUrl: payload.artworkUrl || `https://picsum.photos/200/200?random=${Date.now()}`,
      created: new Date().toISOString()
    }

    this.beats.unshift(newBeat)
    return { data: newBeat }
  }

  async deleteBeat(id: string) {
    await simulateDelay()
    const beatIndex = this.beats.findIndex(b => b.id === id)
    if (beatIndex === -1) {
      throw new Error('Beat not found')
    }

    this.beats.splice(beatIndex, 1)
    return { data: { success: true } }
  }

  // User operations
  async getCurrentUser() {
    await simulateDelay(200)
    if (!this.authenticated) {
      throw new Error('Not authenticated')
    }
    return this.user
  }

  async login(username: string, password: string) {
    await simulateDelay(800)
    // Simulate login success for demo
    this.authenticated = true
    return {
      success: true,
      user: this.user
    }
  }

  async logout() {
    await simulateDelay(300)
    this.authenticated = false
    return { success: true }
  }

  async isAuthenticated() {
    return this.authenticated
  }
}

// Module-private storage instance.
// Swappable at runtime via __resetMockStorage() so resetMockBackend()
// (src/services/api/reset.ts) can reseed mock data without a page reload.
// The double-underscore prefix marks this as an internal escape hatch — only
// reset.ts should call it.
let _storage = new MockStorage()

// Versions mirror S3 ETags so the mock honours the same conditional-write
// contract as the real service (StorageApiContract.uploadSessionScript).
const _scriptVersions = new Map<string, number>()
const _versionTag = (n: number) => `"mock-v${n}"`

/**
 * Replace the module-level mock storage with a fresh `MockStorage` instance.
 * After this returns, every subsequent call through `mockSessionsApi`,
 * `mockBeatsApi`, `mockAuthService`, or `mockS3Service` hits the new instance.
 *
 * @internal — call sites outside `src/services/api/reset.ts` are not supported.
 */
export function __resetMockStorage(): void {
  _storage = new MockStorage()
  _scriptVersions.clear()
}

// Mock API clients that match the real API interface.
// Each method looks up `_storage` at call time, so __resetMockStorage()
// transparently swaps the backend for all subsequent calls.
export const mockSessionsApi = {
  listSessions: () => _storage.getSessions(),
  getSession: (id: string) => _storage.getSession(id),
  createSession: (payload: any) => _storage.createSession(payload),
  updateSession: (id: string, payload: any) => _storage.updateSession(id, payload),
  deleteSession: (id: string) => _storage.deleteSession(id)
}

export const mockBeatsApi = {
  listBeats: () => _storage.getBeats(),
  createBeat: (payload: any) => _storage.createBeat(payload),
  deleteBeat: (id: string) => _storage.deleteBeat(id)
}

// Mock S3 Service

export const mockS3Service = {
  async uploadSessionScript(sessionId: string, scriptData: any, expectedVersion?: ExpectedVersion) {
    await simulateDelay(1000) // Simulate upload time
    console.log('📁 Mock S3: Uploading script for session', sessionId)

    const current = _scriptVersions.get(sessionId)
    const currentTag = current === undefined ? null : _versionTag(current)
    if (expectedVersion !== undefined && expectedVersion !== currentTag) {
      throw new ScriptConflictError(sessionId)
    }

    // Simulate successful upload
    const scriptUrl = `data:application/json;base64,${btoa(JSON.stringify(scriptData))}`

    // Update the session in mock storage
    await _storage.updateSession(sessionId, {
      script: JSON.stringify(scriptData)
    })

    const next = (current ?? 0) + 1
    _scriptVersions.set(sessionId, next)
    return { url: scriptUrl, version: _versionTag(next) }
  },

  async downloadSessionScript(sessionId: string) {
    await simulateDelay(500)
    console.log('📁 Mock S3: Downloading script for session', sessionId)

    // Get from mock storage
    const session = await _storage.getSession(sessionId)
    const content = typeof session.data.script === 'string'
      ? JSON.parse(session.data.script)
      : session.data.script
    const current = _scriptVersions.get(sessionId)
    return { content, version: current === undefined ? null : _versionTag(current) }
  },

  async uploadArtwork(sessionId: string, file: File) {
    await simulateDelay(1500)
    console.log('📁 Mock S3: Uploading artwork for session', sessionId)

    // Create a fake URL for the uploaded artwork
    const artworkUrl = `https://picsum.photos/300/300?random=${Date.now()}`

    return artworkUrl
  },

  async uploadBeat(beatId: string, file: File) {
    await simulateDelay(2000)
    console.log('📁 Mock S3: Uploading beat file for beat', beatId)

    // Create a fake URL for the uploaded beat
    const beatUrl = 'https://www.soundjay.com/misc/sounds-for-games/beep-07a.wav'

    return beatUrl
  }
}

// Mock auth functions
export const mockAuthService = {
  async getCurrentUser() {
    return _storage.getCurrentUser()
  },

  async isAuthenticated() {
    return _storage.isAuthenticated()
  },

  async login(username: string, password: string) {
    return _storage.login(username, password)
  },

  async logout() {
    return _storage.logout()
  }
}


