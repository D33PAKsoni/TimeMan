import type { Session } from "@supabase/supabase-js"
import { supabase, GOOGLE_SCOPES, SERVER_URL } from "./supabase"

const TOKEN_KEY = "reel.google_provider_token"
const TOKEN_EXPIRY_KEY = "reel.google_token_expiry"

// Kick off Google OAuth through Supabase. The browser redirects to Google's
// consent screen and returns to the app, where detectSessionInUrl finishes it.
// access_type=offline + prompt=consent makes Google issue a refresh token, which
// we hand to the edge function (see saveGoogleRefreshToken) so the app can get
// new access tokens without asking the user to sign in again.
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: GOOGLE_SCOPES,
      redirectTo: window.location.origin,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  })
  if (error) throw error
}

export async function signOut() {
  // Best effort: forget the stored Google refresh token before the session goes away.
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await fetch(`${SERVER_URL}/google/refresh-token`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
    }
  } catch {
    /* offline — the token stays server-side until the next sign-in overwrites it */
  }
  clearCachedToken()
  await supabase.auth.signOut()
}

// ── Access token cache ───────────────────────────────────────────────────────
// Google access tokens last ~1 hour. We cache the current one in localStorage and,
// when it's gone or expired, ask the edge function for a fresh one.

function clearCachedToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
}

export function cacheProviderToken(token: string | null | undefined, ttlSeconds = 55 * 60) {
  if (!token) return
  // Supabase re-emits the *same* provider_token on every page load from the persisted
  // session. Don't let that restart the expiry clock on a token that may already be dead.
  if (localStorage.getItem(TOKEN_KEY) === token) return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + ttlSeconds * 1000))
}

function getCachedToken(): string | null {
  const stored = localStorage.getItem(TOKEN_KEY)
  if (!stored) return null
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) ?? "0")
  if (!expiry || Date.now() > expiry) {
    clearCachedToken()
    return null
  }
  return stored
}

// Right after the OAuth redirect the session carries Google's refresh token. It is only
// ever visible at that moment, so store it server-side (where the Google client secret
// lives) — the browser can't exchange it for a new access token by itself.
let lastSentRefreshToken: string | null = null
export async function saveGoogleRefreshToken(session: Session | null) {
  const refreshToken = session?.provider_refresh_token
  if (!session || !refreshToken || refreshToken === lastSentRefreshToken) return
  lastSentRefreshToken = refreshToken
  try {
    const res = await fetch(`${SERVER_URL}/google/refresh-token`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      lastSentRefreshToken = null
      console.error("[TaskMan] Couldn't store Google refresh token:", res.status)
    }
  } catch (e) {
    lastSentRefreshToken = null
    console.error("[TaskMan] Couldn't store Google refresh token:", e)
  }
}

// ── Getting a usable token ───────────────────────────────────────────────────

export type GoogleAccess =
  | { token: string; reason?: undefined }
  // "reconnect": Google no longer honours our stored grant (revoked, or never stored) —
  //              the user has to go through the consent screen again.
  // "unavailable": transient (offline, edge function down/misconfigured) — retry later.
  | { token: null; reason: "reconnect" | "unavailable" }

let inflight: Promise<GoogleAccess> | null = null

async function refreshFromServer(): Promise<GoogleAccess> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return { token: null, reason: "reconnect" }
  try {
    const res = await fetch(`${SERVER_URL}/google/access-token`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    })
    if (res.status === 401 || res.status === 404) return { token: null, reason: "reconnect" }
    if (!res.ok) return { token: null, reason: "unavailable" }
    const body = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!body.access_token) return { token: null, reason: "unavailable" }
    // Expire our copy a minute early so we never hand out a token that dies mid-request.
    localStorage.setItem(TOKEN_KEY, body.access_token)
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000))
    return { token: body.access_token }
  } catch {
    return { token: null, reason: "unavailable" }
  }
}

export async function getGoogleAccess(): Promise<GoogleAccess> {
  const cached = getCachedToken()
  if (cached) return { token: cached }
  // Several callers can ask at once (playlists + daily video) — share one refresh.
  inflight ??= refreshFromServer().finally(() => {
    inflight = null
  })
  return inflight
}

export class GoogleAuthError extends Error {
  reason: "reconnect" | "unavailable"
  constructor(reason: "reconnect" | "unavailable") {
    super(reason === "reconnect" ? "Google access needs to be re-approved" : "Couldn't refresh Google access")
    this.reason = reason
  }
}

// Run a Google API call with a valid token. If Google answers 401 (token revoked or
// expired earlier than we expected) drop the cached token, get a fresh one, retry once.
export async function withGoogleToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  let access = await getGoogleAccess()
  if (access.token === null) throw new GoogleAuthError(access.reason)
  try {
    return await fn(access.token)
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("Google API 401")) throw e
    clearCachedToken()
    access = await getGoogleAccess()
    if (access.token === null) throw new GoogleAuthError(access.reason)
    return fn(access.token)
  }
}
