// Persistence layer for lists and watched video IDs.
//
// localStorage is the primary store — writes are synchronous and survive
// page refreshes with zero latency. The Supabase edge function is attempted
// as a secondary sync so data can roam across devices, but it is never
// load-blocking: if the server call fails the app degrades silently.
import { SERVER_URL } from "./supabase"
import { supabase } from "./supabase"
import type { DailyVideo, ListCategory } from "../data/mock"

const LS_LISTS_KEY = "reel.lists"
const LS_WATCHED_KEY = "reel.watched"
const LS_DAILY_KEY = "reel.daily_video"

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" }
}

// ── Lists ─────────────────────────────────────────────────────────────────────

export async function loadLists(): Promise<ListCategory[] | null> {
  // Try localStorage first for instant load.
  const local = localStorage.getItem(LS_LISTS_KEY)
  if (local) {
    try {
      return JSON.parse(local) as ListCategory[]
    } catch {
      /* corrupted — fall through to server */
    }
  }
  // Fall back to server (available once edge function is deployed).
  try {
    const res = await fetch(`${SERVER_URL}/lists`, { headers: await authHeader() })
    if (!res.ok) return null
    const data = (await res.json()).lists as ListCategory[] | null
    if (data) localStorage.setItem(LS_LISTS_KEY, JSON.stringify(data))
    return data
  } catch {
    return null
  }
}

export async function saveLists(lists: ListCategory[]): Promise<void> {
  // Write to localStorage immediately — this never fails.
  localStorage.setItem(LS_LISTS_KEY, JSON.stringify(lists))
  // Then attempt server sync in the background.
  try {
    await fetch(`${SERVER_URL}/lists`, {
      method: "PUT",
      headers: await authHeader(),
      body: JSON.stringify({ lists }),
    })
  } catch {
    /* server unavailable — data is safe in localStorage */
  }
}

// ── Watched video IDs ─────────────────────────────────────────────────────────

export async function loadWatched(): Promise<string[]> {
  const local = localStorage.getItem(LS_WATCHED_KEY)
  if (local) {
    try {
      return JSON.parse(local) as string[]
    } catch {
      /* corrupted */
    }
  }
  try {
    const res = await fetch(`${SERVER_URL}/watched`, { headers: await authHeader() })
    if (!res.ok) return []
    const ids = (await res.json()).watched ?? []
    localStorage.setItem(LS_WATCHED_KEY, JSON.stringify(ids))
    return ids
  } catch {
    return []
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

// ── Daily random video ────────────────────────────────────────────────────────
// One pick per calendar day, remembered locally so reloads don't burn search quota
// (each search costs 100 units) or change the video under the user.

const todayKey = () => new Date().toDateString()

export function loadDailyVideo(): DailyVideo | null {
  try {
    const raw = localStorage.getItem(LS_DAILY_KEY)
    if (!raw) return null
    const { date, video } = JSON.parse(raw) as { date: string; video: DailyVideo }
    return date === todayKey() && video?.id ? video : null
  } catch {
    return null
  }
}

export function saveDailyVideo(video: DailyVideo): void {
  localStorage.setItem(LS_DAILY_KEY, JSON.stringify({ date: todayKey(), video }))
}
