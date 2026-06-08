/**
 * Canonical_API_Surface — interface contracts.
 *
 * Single source of truth for the shape of `sessionsApi`, `beatsApi`, `authApi`,
 * and `storageApi`. Both `mock.ts` and `real.ts` declare `satisfies` against
 * these interfaces, which makes the contract-conformance test (Req 4.5–4.6)
 * trivial: it imports both implementations and asserts the methods exist with
 * the right shape.
 *
 * No implementations live here — this file is types only.
 */

import type {
  SessionSummary,
  GetSessionResponseContent,
  CreateSessionRequestContent,
  UpdateSessionRequestContent,
  BeatSummary,
  CreateBeatRequestContent,
} from '@/services/api/types'

export interface SessionsApiContract {
  listSessions(): Promise<{ data: { sessions: SessionSummary[] } }>
  getSession(id: string): Promise<{ data: GetSessionResponseContent }>
  createSession(
    payload: CreateSessionRequestContent,
  ): Promise<{ data: GetSessionResponseContent }>
  updateSession(
    id: string,
    payload: UpdateSessionRequestContent,
  ): Promise<{ data: GetSessionResponseContent }>
  deleteSession(id: string): Promise<{ data: { success: boolean } }>
}

export interface BeatsApiContract {
  listBeats(): Promise<{ data: { beats: BeatSummary[] } }>
  createBeat(payload: CreateBeatRequestContent): Promise<{ data: BeatSummary }>
  deleteBeat(id: string): Promise<{ data: { success: boolean } }>
}

export interface AuthApiContract {
  getCurrentUser(): Promise<AuthUser>
  isAuthenticated(): Promise<boolean>
  login(
    username: string,
    password: string,
  ): Promise<{ success: boolean; user?: AuthUser }>
  logout(): Promise<{ success: boolean }>
}

export interface StorageApiContract {
  uploadSessionScript(sessionId: string, scriptData: unknown): Promise<string>
  downloadSessionScript(sessionId: string): Promise<unknown>
  uploadArtwork(sessionId: string, file: File): Promise<string>
  uploadBeat(beatId: string, file: File): Promise<string>
}

export interface AuthUser {
  username: string
  email?: string
  sub: string
  name?: string
  [key: string]: unknown
}
