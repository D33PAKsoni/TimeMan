// Live Google Calendar + YouTube Data API calls, shaped into the app's types.
// Uses the Google OAuth access token that Supabase returns as `provider_token`.
import type { DailyVideo, Playlist, Video } from "../data/mock"

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

// ---- Random video of the day ----
//
// YouTube has no "give me a random video" endpoint, so we build one: search a random
// everyday topic inside a random ~6-week window between 2007 and now, then pick one of
// the returned videos at random. Cost: one search.list call (100 quota units of the
// 10,000/day default) plus a 1-unit videos.list call for the duration.

const RANDOM_TOPICS = [
  "cooking", "baking", "sourdough", "street food", "barbecue", "coffee", "tea ceremony", "recipe",
  "guitar", "piano", "violin", "drums", "synthesizer", "orchestra", "jazz", "folk music", "cover song", "concert",
  "street performance", "opera", "hip hop", "dance", "ballet", "yoga", "meditation", "juggling", "card magic",
  "skateboarding", "surfing", "kayak", "climbing", "cycling", "parkour", "snowboard", "sailing", "marathon",
  "fencing", "boxing", "cricket", "football skills", "basketball", "tennis", "chess", "board game", "speedrun",
  "minecraft", "lego", "model train", "origami", "pottery", "knitting", "woodworking", "blacksmith", "calligraphy",
  "watercolor", "sketching", "painting", "sculpture", "street art", "animation", "stop motion", "short film",
  "documentary", "stand up comedy", "interview", "lecture", "science fair", "experiment", "chemistry", "physics",
  "mathematics", "astronomy", "rocket launch", "deep sea", "coral reef", "wildlife", "bird watching", "insects",
  "dinosaurs", "cats", "dogs", "horses", "beekeeping", "aquarium", "bonsai", "gardening", "farm life",
  "volcano", "glacier", "desert", "rainforest", "waterfall", "cave", "island", "mountain hike", "thunderstorm",
  "sunrise", "timelapse", "drone footage", "road trip", "train journey", "cargo ship", "lighthouse", "airplane",
  "motorcycle", "vintage car", "engine rebuild", "restoration", "electronics repair", "3d printing", "arduino",
  "robot", "typography", "history", "archaeology", "ancient ruins", "castle", "village life", "market tour",
  "festival", "wedding", "graduation speech", "language learning", "life hack", "diy", "vlog", "unboxing",
  "tutorial", "podcast clip", "puppet", "geology", "biology", "bees", "clock repair", "fishing", "camping",
]

const rand = (n: number) => Math.floor(Math.random() * n)

// search.list titles come back HTML-entity-encoded (&amp; &#39; ...).
function decodeEntities(s: string) {
  const el = document.createElement("textarea")
  el.innerHTML = s
  return el.value
}

export async function fetchRandomVideo(token: string, exclude: Set<string> = new Set()): Promise<DailyVideo> {
  const DAY = 86400000
  const earliest = Date.UTC(2007, 0, 1)
  const windowMs = 42 * DAY
  const latest = Date.now() - windowMs - 2 * DAY

  // A random topic + random window can occasionally come back empty; retry a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    const start = earliest + Math.random() * (latest - earliest)
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: RANDOM_TOPICS[rand(RANDOM_TOPICS.length)],
      maxResults: "50",
      order: "relevance",
      safeSearch: "moderate",
      publishedAfter: new Date(start).toISOString(),
      publishedBefore: new Date(start + windowMs).toISOString(),
    })
    const data = await gfetch(`${YT}/search?${params}`, token)
    const pool: any[] = (data.items ?? []).filter(
      (it: any) => it.id?.videoId && it.snippet?.thumbnails && !exclude.has(it.id.videoId),
    )
    if (!pool.length) continue

    const pick = pool[rand(pool.length)]
    const id: string = pick.id.videoId
    let duration = "—"
    try {
      const vids = await gfetch(`${YT}/videos?part=contentDetails&id=${id}`, token)
      duration = fmtDuration(vids.items?.[0]?.contentDetails?.duration)
    } catch {
      /* duration is cosmetic */
    }
    const sn = pick.snippet
    const year = new Date(sn.publishedAt).getFullYear()
    return {
      id,
      title: decodeEntities(sn.title ?? "Untitled"),
      channel: decodeEntities(sn.channelTitle ?? "YouTube"),
      thumb: (sn.thumbnails.medium ?? sn.thumbnails.high ?? sn.thumbnails.default)?.url ?? "",
      duration,
      publishedYear: Number.isNaN(year) ? null : year,
      watched: false,
    }
  }
  throw new Error("Couldn't find a random video this time — try again")
}
