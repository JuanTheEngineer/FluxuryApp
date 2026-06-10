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

const sessionsBasePath =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const beatsBasePath =
  import.meta.env.VITE_BEATS_API_BASE_URL || 'http://localhost:3001'

// Use the authenticated client factory which handles JWT injection and 401 refresh
const sessionAxios = createAuthenticatedClient()
sessionAxios.defaults.baseURL = sessionsBasePath
sessionAxios.defaults.headers.common['Content-Type'] = 'application/json'

const beatAxios = createAuthenticatedClient()
beatAxios.defaults.baseURL = beatsBasePath
beatAxios.defaults.headers.common['Content-Type'] = 'application/json'

// --- Sessions API (axios-based; replaces the OpenAPI-generated stub) ---
export const sessionsApi = {
  listSessions: () =>
    sessionAxios
      .get<{ sessions: SessionSummary[] }>('/sessions')
      .then((r) => ({ data: r.data })),
  getSession: (id: string) =>
    sessionAxios
      .get<GetSessionResponseContent>(`/sessions/${id}`)
      .then((r) => ({ data: r.data })),
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

// --- Auth API (wraps existing auth-interceptor helpers) ---
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
  login: async (_username: string, _password: string) => {
    // Real Cognito sign-in is handled in authStore via aws-amplify directly today.
    // Punted: a unified login surface here would route through `signIn` from
    // 'aws-amplify/auth' and translate the result. Out of scope for stabilization.
    throw new Error(
      'real.authApi.login is not yet implemented (post-stabilization)',
    )
  },
  logout: async () => {
    throw new Error(
      'real.authApi.logout is not yet implemented (post-stabilization)',
    )
  },
} satisfies AuthApiContract

// --- Storage API (delegates to existing S3Service static methods) ---
export const storageApi = {
  uploadSessionScript: (sessionId: string, scriptData: unknown) =>
    S3Service.uploadSessionScript(sessionId, scriptData),
  downloadSessionScript: (sessionId: string) =>
    S3Service.downloadSessionScript(sessionId),
  uploadArtwork: (sessionId: string, file: File) =>
    S3Service.uploadArtwork(sessionId, file),
  uploadBeat: (beatId: string, file: File) => S3Service.uploadBeat(beatId, file),
} satisfies StorageApiContract
