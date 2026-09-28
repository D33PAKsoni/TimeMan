// Live Google Calendar + YouTube Data API calls, shaped into the app's types.
// Uses the Google OAuth access token that Supabase returns as `provider_token`.
import type { Playlist, Video } from "../data/mock"

const CAL = "https://www.googleapis.com/calendar/v3"
const YT = "https://www.googleapis.com/youtube/v3"

async function gfetch(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Google API ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

// ---- Calendar (write-only: the app creates events; users view them in Google Calendar) ----

export async function createCalendarEvent(
  token: string,
  opts: { title: string; start: Date; durationMin: number; description?: string },
): Promise<void> {
  const end = new Date(+opts.start + opts.durationMin * 60000)
  await gfetch(`${CAL}/calendars/primary/events`, token, {
    method: "POST",
    body: JSON.stringify({
      summary: opts.title,
      description: opts.description,
      start: { dateTime: opts.start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: { useDefault: true },
    }),
  })
}

// ---- YouTube ----

function daysAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - +new Date(iso)) / 86400000))
}

// Parse ISO-8601 duration (PT1H2M3S) into m:ss / h:mm:ss.
function fmtDuration(iso = "PT0S") {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  const h = +(m?.[1] ?? 0)
  const min = +(m?.[2] ?? 0)
  const s = +(m?.[3] ?? 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`
}

// Remove a video from its playlist. Needs the write-enabled `youtube` scope.
export async function deletePlaylistItem(token: string, playlistItemId: string): Promise<void> {
  const res = await fetch(`${YT}/playlistItems?id=${playlistItemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Google API ${res.status}: ${await res.text()}`)
  }
}

export async function fetchPlaylists(
  token: string,
  watchedIds: Set<string> = new Set(),
): Promise<Playlist[]> {
  const listData = await gfetch(
    `${YT}/playlists?part=snippet,contentDetails&mine=true&maxResults=25`,
    token,
  )

  const playlists: Playlist[] = []
  for (const pl of listData.items ?? []) {
    const itemsData = await gfetch(
      `${YT}/playlistItems?part=snippet,contentDetails&playlistId=${pl.id}&maxResults=20`,
      token,
    )
    const items = itemsData.items ?? []
    const videoIds = items
      .map((it: any) => it.contentDetails?.videoId)
      .filter(Boolean)
      .join(",")

    // One call to enrich with durations.
    const durations = new Map<string, string>()
    if (videoIds) {
      const vids = await gfetch(`${YT}/videos?part=contentDetails&id=${videoIds}`, token)
      for (const v of vids.items ?? []) {
        durations.set(v.id, fmtDuration(v.contentDetails?.duration))
      }
    }

    const videos: Video[] = items
      .filter((it: any) => it.snippet?.thumbnails)
      .map((it: any): Video => {
        const vid = it.contentDetails?.videoId
        const sn = it.snippet
        return {
          id: vid ?? it.id,
          playlistItemId: it.id,
          title: sn.title,
          channel: sn.videoOwnerChannelTitle ?? sn.channelTitle ?? "YouTube",
          thumb: (sn.thumbnails.medium ?? sn.thumbnails.default)?.url ?? "",
          duration: durations.get(vid) ?? "—",
          addedDaysAgo: daysAgo(sn.publishedAt),
          watched: watchedIds.has(vid),
        }
      })

    playlists.push({ id: pl.id, name: pl.snippet.title, videos })
  }
  return playlists
}
