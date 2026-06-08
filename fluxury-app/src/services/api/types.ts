// Domain types — single source of truth for the canonical API surface.
//
// These types were relocated from:
//   - src/api/open-api/session-client/index.ts
//   - src/api/open-api/beat-client/index.ts
// during repo-stabilization Phase 1 (task 1.4). The old open-api index files
// will be reduced to type-only re-exports in task 1.5 and deleted in task 4.1.

// --- Session types (relocated from src/api/open-api/session-client/index.ts) ---

export interface SessionSummary {
  id: string
  name: string
  author: string
  created: string
  modified: string
  artworkUrl?: string
  beatUrl?: string
}

export interface GetSessionResponseContent {
  id: string
  name: string
  author: string
  beatUrl?: string
  artworkUrl?: string
  script: string
  userId: string
  created: string
  modified: string
}

export interface CreateSessionRequestContent {
  name?: string
  author?: string
  beatUrl?: string
  artworkUrl?: string
}

export interface UpdateSessionRequestContent {
  name?: string
  author?: string
  beatUrl?: string
  artworkUrl?: string
  script?: string
}

// --- Beat types (relocated from src/api/open-api/beat-client/index.ts) ---

export interface BeatSummary {
  id: string
  name: string
  artist: string
  path: string
  duration: number
  bpm?: number
  genre?: string
  tags?: string[]
  artworkUrl?: string
  created: string
}

export interface ListBeatsResponseContent {
  beats: BeatSummary[]
}

export interface CreateBeatRequestContent {
  name: string
  artist?: string
  path?: string
  duration?: number
  bpm?: number
  genre?: string
  tags?: string[]
  artworkUrl?: string
}
