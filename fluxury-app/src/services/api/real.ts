// TODO(post-stabilization): real-mode boot completion is punted to a follow-up
// spec. This module satisfies the canonical contracts so demo-mode boot works
// (real.ts is statically imported by index.ts and tree-shaken in production
// when VITE_DEMO_MODE !== 'false'), but the methods will throw at call time
// without proper AWS credentials. The next spec that exercises real mode is
// responsible for wiring real Cognito tokens, real DynamoDB endpoints, and
// real S3 buckets end-to-end.

import type {
  SessionsApiContract,
  BeatsApiContract,
  AuthApiContract,
  StorageApiContract,
  AuthUser,
} from './contracts'
import type {
  SessionSummary,
  GetSessionResponseContent,
  CreateSessionRequestContent,
  UpdateSessionRequestContent,
  BeatSummary,
  CreateBeatRequestContent,
} from './types'
import {
  createAuthenticatedClient,
  isAuthenticated as authIsAuthenticated,
  getCurrentUser as authGetCurrentUser,
} from '@/api/auth-interceptor'
import { S3Service } from '@/services/s3Service'
import type { ExpectedVersion } from '@/services/scriptConflict'
import axios from 'axios'

const sessionsBasePath =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const beatsBasePath =
  import.meta.env.VITE_BEATS_API_BASE_URL || 'http://localhost:3001'

// Use the authenticated client factory which handles JWT injection and 401 refresh
const sessionAxios = createAuthenticatedClient()
sessionAxios.defaults.baseURL = sessionsBasePath
sessionAxios.defaults.headers.common['Content-Type'] = 'application/json'

// Public (unauthenticated) client for guest access
const publicAxios = axios.create({
  baseURL: sessionsBasePath,
  headers: { 'Content-Type': 'application/json' },
})

const beatAxios = createAuthenticatedClient()
beatAxios.defaults.baseURL = beatsBasePath
beatAxios.defaults.headers.common['Content-Type'] = 'application/json'

// --- Sessions API (axios-based; replaces the OpenAPI-generated stub) ---
export const sessionsApi = {
  listSessions: async () => {
    const authenticated = await authIsAuthenticated()
    if (authenticated) {
      return sessionAxios
        .get<{ sessions: SessionSummary[] }>('/sessions')
        .then((r) => ({ data: r.data }))
    }
    // Guest: use public endpoint
    return publicAxios
      .get<{ sessions: SessionSummary[] }>('/public/sessions')
      .then((r) => ({ data: r.data }))
  },
  getSession: async (id: string) => {
    const authenticated = await authIsAuthenticated()
    if (authenticated) {
      return sessionAxios
        .get<GetSessionResponseContent>(`/sessions/${id}`)
        .then((r) => ({ data: r.data }))
    }
    // Guest: use public endpoint
    return publicAxios
      .get<GetSessionResponseContent>(`/public/sessions/${id}`)
      .then((r) => ({ data: r.data }))
  },
  createSession: (payload: CreateSessionRequestContent) =>
    sessionAxios
      .post<GetSessionResponseContent>('/sessions', payload)
      .then((r) => ({ data: r.data })),
  updateSession: (id: string, payload: UpdateSessionRequestContent) =>
    sessionAxios
      .put<GetSessionResponseContent>(`/sessions/${id}`, payload)
      .then((r) => ({ data: r.data })),
  deleteSession: (id: string) =>
    sessionAxios
      .delete(`/sessions/${id}`)
      .then(() => ({ data: { success: true } })),
} satisfies SessionsApiContract

// --- Beats API (axios-based) ---
export const beatsApi = {
  listBeats: () =>
    beatAxios
      .get<{ beats: BeatSummary[] }>('/beats')
      .then((r) => ({ data: r.data })),
  createBeat: (payload: CreateBeatRequestContent) =>
    beatAxios.post<BeatSummary>('/beats', payload).then((r) => ({ data: r.data })),
  deleteBeat: (id: string) =>
    beatAxios.delete(`/beats/${id}`).then(() => ({ data: { success: true } })),
} satisfies BeatsApiContract

// --- Auth API (wraps Amplify Cognito auth) ---
export const authApi = {
  getCurrentUser: async (): Promise<AuthUser> => {
    const u = await authGetCurrentUser()
    return {
      username: u.username,
      email: u.email,
      sub: u.sub,
    } as AuthUser
  },
  isAuthenticated: () => authIsAuthenticated(),
  login: async (username: string, password: string) => {
    const { signIn } = await import('aws-amplify/auth')
    try {
      const result = await signIn({ username, password })
      if (result.isSignedIn) {
        return { success: true }
      }
      return { success: false, error: 'Sign-in incomplete' }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' }
    }
  },
  logout: async () => {
    const { signOut } = await import('aws-amplify/auth')
    await signOut()
    return { success: true }
  },
} satisfies AuthApiContract

// --- Storage API (delegates to existing S3Service static methods) ---
export const storageApi = {
  uploadSessionScript: (sessionId: string, scriptData: unknown, expectedVersion?: ExpectedVersion) =>
    S3Service.uploadSessionScript(sessionId, scriptData, expectedVersion),
  downloadSessionScript: (sessionId: string) =>
    S3Service.downloadSessionScript(sessionId),
  uploadArtwork: (sessionId: string, file: File) =>
    S3Service.uploadArtwork(sessionId, file),
  uploadBeat: (beatId: string, file: File) => S3Service.uploadBeat(beatId, file),
} satisfies StorageApiContract
