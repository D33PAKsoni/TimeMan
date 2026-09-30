// Persistence layer for lists and watched video IDs.
//
// Supabase (via the edge function) is the source of truth; localStorage is an
// instant-load cache and an offline safety net. Reads always ask the server first
// (see useSyncedLists for how a stale device is kept from overwriting newer data).
import { SERVER_URL } from "./supabase"
import { supabase } from "./supabase"
import type { DailyPick, ListCategory } from "../data/mock"

const LS_LISTS_KEY = "reel.lists"
const LS_WATCHED_KEY = "reel.watched"
const LS_DAILY_KEY = "reel.daily_video"

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" }
}

// ── Lists ─────────────────────────────────────────────────────────────────────

// Key-order-independent JSON. The server stores lists as Postgres JSONB, which
// reorders object keys, so plain JSON.stringify can't be used to tell whether two
// copies of the lists are actually the same. undefined values are dropped, matching
// what a network round trip does to them.
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

export type FailReason = "auth" | "network" | "server"
export type ServerLists = { ok: true; lists: ListCategory[] | null } | { ok: false; reason: FailReason }

const failReason = (status: number): FailReason => (status === 401 || status === 403 ? "auth" : "server")

// null lists = the server has no saved copy yet (first run).
export async function fetchServerLists(): Promise<ServerLists> {
  try {
    const res = await fetch(`${SERVER_URL}/lists`, { headers: await authHeader(), cache: "no-store" })
    if (!res.ok) return { ok: false, reason: failReason(res.status) }
    const body = await res.json()
    return { ok: true, lists: Array.isArray(body?.lists) ? (body.lists as ListCategory[]) : null }
  } catch {
    return { ok: false, reason: "network" }
  }
}

// Unlike the old saveLists, this checks the response: a 401/500 used to be
// swallowed and reported to the user as a successful save.
export async function pushServerLists(lists: ListCategory[]): Promise<{ ok: true } | { ok: false; reason: FailReason }> {
  try {
    const res = await fetch(`${SERVER_URL}/lists`, { method: "PUT", headers: await authHeader(), body: JSON.stringify({ lists }) })
    return res.ok ? { ok: true } : { ok: false, reason: failReason(res.status) }
  } catch {
    return { ok: false, reason: "network" }
  }
}

// ── Local copy ────────────────────────────────────────────────────────────────
// Remembers which account the cached lists belong to, so signing in as a different
// Google account on the same browser can never push the previous account's lists
// into the new one now that changes save automatically.

const LS_LISTS_BASE_KEY = "reel.lists_base"
const LS_LISTS_OWNER_KEY = "reel.lists_owner"

function claimLocal(userId: string): void {
  const owner = localStorage.getItem(LS_LISTS_OWNER_KEY)
  if (owner && owner !== userId) {
    localStorage.removeItem(LS_LISTS_KEY)
    localStorage.removeItem(LS_LISTS_BASE_KEY)
  }
  localStorage.setItem(LS_LISTS_OWNER_KEY, userId)
}

export function loadLocalLists(userId: string): ListCategory[] | null {
  claimLocal(userId)
  try {
    const raw = localStorage.getItem(LS_LISTS_KEY)
    return raw ? (JSON.parse(raw) as ListCategory[]) : null
  } catch {
    return null
  }
}

export function saveLocalLists(userId: string, lists: ListCategory[]): void {
  claimLocal(userId)
  localStorage.setItem(LS_LISTS_KEY, JSON.stringify(lists))
}

// "Base" = canonical form of the lists as of this device's last successful sync with
// the server. Comparing the server and local copies against it is what tells "the
// server changed" apart from "I changed something", which decides whether it's safe
// to overwrite either side. null = never synced (or the server had nothing).
export function loadBase(userId: string): string | null {
  claimLocal(userId)
  return localStorage.getItem(LS_LISTS_BASE_KEY)
}

export function saveBase(userId: string, base: string | null): void {
  claimLocal(userId)
  if (base === null) localStorage.removeItem(LS_LISTS_BASE_KEY)
  else localStorage.setItem(LS_LISTS_BASE_KEY, base)
}

// ── Watched video IDs ─────────────────────────────────────────────────────────

// "Watched" only ever grows, so merging the two copies is just a union — no conflicts
// possible. (It used to read the local copy and never look at the server, so videos
// marked watched on another device never showed up here.)
export async function loadWatched(): Promise<string[]> {
  let local: string[] = []
  try {
    local = JSON.parse(localStorage.getItem(LS_WATCHED_KEY) ?? "[]") as string[]
  } catch {
    /* corrupted — start over from the server's copy */
  }
  try {
    const res = await fetch(`${SERVER_URL}/watched`, { headers: await authHeader(), cache: "no-store" })
    if (!res.ok) return local
    const remote: string[] = (await res.json()).watched ?? []
    const merged = [...new Set([...local, ...remote])]
    localStorage.setItem(LS_WATCHED_KEY, JSON.stringify(merged))
    return merged
  } catch {
    return local
  }
}

export async function addWatched(videoId: string): Promise<void> {
  // Keep localStorage in sync.
  const current: string[] = JSON.parse(localStorage.getItem(LS_WATCHED_KEY) ?? "[]")
  if (!current.includes(videoId)) {
    const next = [...current, videoId]
    localStorage.setItem(LS_WATCHED_KEY, JSON.stringify(next))
  }
  try {
    await fetch(`${SERVER_URL}/watched`, {
      method: "POST",
      headers: await authHeader(),
      body: JSON.stringify({ videoId }),
    })
  } catch {
    /* best-effort */
  }
}

// ── Daily video pick ──────────────────────────────────────────────────────────
// One pick per calendar day, remembered locally (just which playlist/video, not
// the video's data — that's always read live from Playlist state) so reloads
// don't change the pick out from under the user partway through the day.

const todayKey = () => new Date().toDateString()

export function loadDailyPick(): DailyPick | null {
  try {
    const raw = localStorage.getItem(LS_DAILY_KEY)
    if (!raw) return null
    const { date, pick } = JSON.parse(raw) as { date: string; pick: DailyPick }
    return date === todayKey() && pick?.playlistId && pick?.videoId ? pick : null
  } catch {
    return null
  }
}

export function saveDailyPick(pick: DailyPick): void {
  localStorage.setItem(LS_DAILY_KEY, JSON.stringify({ date: todayKey(), pick }))
}
