// App data types. Live data comes from Supabase (custom lists) and the
// Google Calendar + YouTube Data APIs (see src/lib/google.ts).

// Icon key for a list. The four built-ins ("idea" | "movie" | "anime" | "series")
// plus any key from the icon registry in components/Lists.tsx (custom lists).
export type ListKind = string

export type Priority = "low" | "medium" | "high" | "urgent"

export const PRIORITY_LEVELS: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "var(--color-cyan)" },
  { value: "medium", label: "Medium", color: "var(--color-amber)" },
  { value: "high", label: "High", color: "#ff8a65" },
  { value: "urgent", label: "Urgent", color: "var(--color-error)" },
]
export const priorityColor = (p: Priority | undefined) => PRIORITY_LEVELS.find((l) => l.value === p)?.color

export type ListItem = {
  id: string
  title: string
  note: string
  done: boolean
  syncedToCalendar: boolean
  tags: string[]
  priority?: Priority
}

export type ListCategory = {
  id: string
  name: string
  kind: ListKind
  accent: string // css color token
  items: ListItem[]
}

// The default category the app opens to — first in the list so it's the
// initially active tab (see Lists.tsx's initial useState(lists[0].id)).
export const defaultTodoList: ListCategory = {
  id: "todo",
  name: "ToDo",
  kind: "list",
  accent: "var(--color-cyan)",
  items: [],
}

// Empty starter categories seeded on a user's first run. These are structure,
// not sample content — every list begins empty.
export const defaultLists: ListCategory[] = [
  defaultTodoList,
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
