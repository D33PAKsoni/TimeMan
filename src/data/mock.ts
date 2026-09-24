// App data types. Live data comes from Supabase (custom lists) and the
// Google Calendar + YouTube Data APIs (see src/lib/google.ts).

// Icon key for a list. The four built-ins ("idea" | "movie" | "anime" | "series")
// plus any key from the icon registry in components/Lists.tsx (custom lists).
export type ListKind = string

export type ListItem = {
  id: string
  title: string
  note: string
  done: boolean
  syncedToCalendar: boolean
  tags: string[]
}

export type ListCategory = {
  id: string
  name: string
  kind: ListKind
  accent: string // css color token
  items: ListItem[]
}

// Empty starter categories seeded on a user's first run. These are structure,
// not sample content — every list begins empty.
export const defaultLists: ListCategory[] = [
  { id: "ideas", name: "Ideas", kind: "idea", accent: "var(--color-primary)", items: [] },
  { id: "movies", name: "Movies", kind: "movie", accent: "var(--color-error)", items: [] },
  { id: "anime", name: "Anime", kind: "anime", accent: "var(--color-accent)", items: [] },
  { id: "series", name: "Series", kind: "series", accent: "var(--color-amber)", items: [] },
]

export type Video = {
  id: string
  playlistItemId: string // YouTube playlistItem id — required to remove from a playlist
  title: string
  channel: string
  thumb: string
  duration: string
  addedDaysAgo: number
  watched: boolean
}

export type Playlist = {
  id: string
  name: string
  videos: Video[]
}

// Today's random pick — a video from anywhere on YouTube (not from a playlist),
// so it has no playlistItemId and can't be "removed from a playlist".
export type DailyVideo = {
  id: string
  title: string
  channel: string
  thumb: string
  duration: string
  publishedYear: number | null
  watched: boolean
}
