// src/api/api-client.ts
import { DefaultSessionsApi, Configuration as BeatConfig } from "@/api/open-api/session-client";
import { DefaultBeatsApi, Configuration as SessionConfig } from "@/api/open-api/beat-client";

// Use environment variable for base path (defined in .env.local or .env)
const basePath = ""

export const beatsApi = new DefaultBeatsApi(new BeatConfig({ basePath }))
export const sessionsApi = new DefaultSessionsApi(new SessionConfig({ basePath }))