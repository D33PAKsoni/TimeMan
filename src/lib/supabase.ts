import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../utils/supabase/info"

export const SUPABASE_URL = `https://${projectId}.supabase.co`

// Pin the client to globalThis so module re-evaluation (HMR, duplicate module
// graphs) reuses one GoTrue instance instead of spawning conflicting ones that
// share the same auth storage key.
const globalRef = globalThis as unknown as { __reelSupabase?: SupabaseClient }

export const supabase =
  globalRef.__reelSupabase ??
  (globalRef.__reelSupabase = createClient(SUPABASE_URL, publicAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "reel-auth",
    },
  }))

// Google scopes TaskMan needs. Calendar (read + write) and YouTube
// (read + manage playlists — the `youtube` scope is required to remove items).
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/youtube",
].join(" ")

// Base URL of the deployed edge function (used for persisting lists / daily job).
export const SERVER_URL = `${SUPABASE_URL}/functions/v1/make-server-3fde14d4`
