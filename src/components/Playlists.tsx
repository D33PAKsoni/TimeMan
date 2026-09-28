import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Check, Play, Clock, AlarmClock, Sparkles, Trash2, Loader2, Shuffle, ChevronDown, ListVideo, Bell, BellOff, BellRing } from "lucide-react"
import type { Playlist, Video } from "../data/mock"
import type { PushStatus } from "../lib/push"

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

// The one set of actions every video gets — today's random pick and every video inside
// an expanded playlist alike, since the daily pick is always a real playlist video too.
// `dense` collapses the secondary buttons to icons for the narrower playlist cards.
function VideoActions({
  videoId,
  watched,
  dense = false,
  onWatched,
  onRemind,
  onRemove,
}: {
  videoId: string
  watched: boolean
  dense?: boolean
  onWatched: () => void
  onRemind: () => void
  onRemove: () => void
}) {
  const base = "flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition "
  const pad = dense ? "px-2.5 py-2 " : "px-3 py-2 "
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={watchUrl(videoId)}
        target="_blank"
        rel="noreferrer"
        className={base + "bg-primary text-primary-foreground font-semibold py-2 hover:brightness-110 active:scale-[.98] " + (dense ? "px-3" : "px-4")}
      >
        <Play className="h-3.5 w-3.5 fill-current" /> Watch
      </a>

      {watched ? (
        <span className={base + "border border-border text-muted " + pad}>
          <Check className="h-3.5 w-3.5" /> Watched
        </span>
      ) : (
        <>
          <button
            onClick={onWatched}
            title="Mark as watched"
            className={base + "border border-border hover:border-border-strong " + pad}
          >
            <Check className="h-3.5 w-3.5" /> Watched
          </button>
          <button
            onClick={onRemind}
            title="Add reminder to calendar"
            className={base + "border border-border hover:border-border-strong " + pad}
          >
            <AlarmClock className="h-4 w-4" /> {!dense && "Remind me"}
          </button>
        </>
      )}

      <button
        onClick={onRemove}
        title="Remove from playlist"
        className={base + "border border-error/40 text-error hover:bg-error/10 " + pad}
      >
        <Trash2 className="h-4 w-4" /> {!dense && "Remove"}
      </button>
    </div>
  )
}

function VideoCard({
  v,
  onWatched,
  onRemind,
  onRemove,
}: {
  v: Video
  onWatched: () => void
  onRemind: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={
        "group overflow-hidden rounded-2xl border bg-surface-2 transition " +
        (v.watched ? "border-border opacity-60" : "border-border hover:border-border-strong")
      }
    >
      <a href={watchUrl(v.id)} target="_blank" rel="noreferrer" className="relative block aspect-video bg-elevated">
        <img src={v.thumb} alt={v.title} loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px]">
          {v.duration}
        </span>
        {v.watched && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-lime">
            <Check className="h-3 w-3" /> watched
          </span>
        )}
      </a>

      <div className="p-3 sm:p-4">
        <div className="font-medium leading-snug line-clamp-2">{v.title}</div>
        <div className="text-sm text-muted mt-1">{v.channel}</div>
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-muted-2">
          <Clock className="h-3 w-3" />
          added {v.addedDaysAgo}d ago
          {v.addedDaysAgo > 30 && !v.watched && <span className="text-accent">· nudge overdue</span>}
        </div>
        <div className="mt-3">
          <VideoActions videoId={v.id} watched={v.watched} dense onWatched={onWatched} onRemind={onRemind} onRemove={onRemove} />
        </div>
      </div>
    </div>
  )
}

// A playlist is just a name card until it's tapped; then it expands to its videos.
function PlaylistCard({
  pl,
  onWatched,
  onRemind,
  onRemove,
}: {
  pl: Playlist
  onWatched: (playlistId: string, videoId: string) => void
  onRemind: (playlistId: string, videoId: string) => void
  onRemove: (playlistId: string, videoId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const unwatched = pl.videos.filter((v) => !v.watched).length
  const stale = pl.videos.filter((v) => !v.watched && v.addedDaysAgo > 30).length

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-elevated/40 transition"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15">
          <ListVideo className="h-5 w-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg font-bold tracking-tight">{pl.name}</span>
          <span className="block font-mono text-xs text-muted-2">
            {unwatched} unwatched · {pl.videos.length} total
          </span>
        </span>
        {stale > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-accent">
            <AlarmClock className="h-3 w-3" /> {stale} going stale
          </span>
        )}
        <ChevronDown className={"h-5 w-5 shrink-0 text-muted transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border p-3 sm:p-4">
              {pl.videos.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">This playlist is empty.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {pl.videos.map((v) => (
                    <VideoCard
                      key={v.playlistItemId}
                      v={v}
                      onWatched={() => onWatched(pl.id, v.id)}
                      onRemind={() => onRemind(pl.id, v.id)}
                      onRemove={() => onRemove(pl.id, v.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default function Playlists({
  playlists,
  loading,
  dailyVideo,
  dailyEmpty,
  hasAnyVideos,
  onDailyShuffle,
  pushStatus,
  onTogglePush,
  onWatched,
  onRemind,
  onRemove,
}: {
  playlists: Playlist[]
  loading: boolean
  dailyVideo: (Video & { playlistId: string }) | null
  dailyEmpty: boolean
  hasAnyVideos: boolean
  onDailyShuffle: () => void
  pushStatus: PushStatus
  onTogglePush: () => void
  onWatched: (playlistId: string, videoId: string) => void
  onRemind: (playlistId: string, videoId: string) => void
  onRemove: (playlistId: string, videoId: string) => void
}) {
  const dailyPlaylistName = dailyVideo ? playlists.find((p) => p.id === dailyVideo.playlistId)?.name : undefined
  const reminderCopy: Record<PushStatus, { label: string; title: string; icon: any; disabled: boolean }> = {
    on: { label: "Reminders on", title: "Turn off daily reminders", icon: BellRing, disabled: false },
    off: { label: "Get daily reminders", title: "Get a push notification once a day", icon: Bell, disabled: false },
    denied: { label: "Reminders blocked", title: "Notifications are blocked for this site — check your browser's site settings", icon: BellOff, disabled: true },
    unsupported: { label: "Reminders unsupported", title: "This browser doesn't support push notifications", icon: BellOff, disabled: true },
  }
  const reminder = reminderCopy[pushStatus]
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-2">From YouTube</div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">Playlists</h1>
        </div>
        <button
          onClick={onTogglePush}
          disabled={reminder.disabled}
          title={reminder.title}
          aria-pressed={pushStatus === "on"}
          className={
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed " +
            (pushStatus === "on" ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted hover:border-border-strong")
          }
        >
          <reminder.icon className="h-4 w-4" />
          {reminder.label}
        </button>
      </div>

      {/* Video of the day, picked from the user's own playlists */}
      {dailyVideo ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl border border-primary/30 bg-primary/5"
        >
          <div className="flex flex-col sm:flex-row">
            <a
              href={watchUrl(dailyVideo.id)}
              target="_blank"
              rel="noreferrer"
              className="relative block sm:w-64 shrink-0 aspect-video bg-elevated"
            >
              <img src={dailyVideo.thumb} alt={dailyVideo.title} className="h-full w-full object-cover" />
              <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px]">
                {dailyVideo.duration}
              </span>
            </a>
            <div className="flex-1 min-w-0 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-primary">
                  <Sparkles className="h-3 w-3" /> Video of the day
                </div>
                <button
                  onClick={onDailyShuffle}
                  title="Pick a different video from your playlists"
                  aria-label="Pick a different video from your playlists"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted hover:border-border-strong hover:text-foreground transition"
                >
                  <Shuffle className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 font-display text-lg font-bold leading-snug line-clamp-2">{dailyVideo.title}</div>
              <div className="text-sm text-muted mt-1">
                {dailyVideo.channel}
                {dailyPlaylistName ? ` · from "${dailyPlaylistName}"` : ""}
              </div>
              <div className="mt-4">
                <VideoActions
                  videoId={dailyVideo.id}
                  watched={dailyVideo.watched}
                  onWatched={() => onWatched(dailyVideo.playlistId, dailyVideo.id)}
                  onRemind={() => onRemind(dailyVideo.playlistId, dailyVideo.id)}
                  onRemove={() => onRemove(dailyVideo.playlistId, dailyVideo.id)}
                />
              </div>
            </div>
          </div>
        </motion.section>
      ) : dailyEmpty ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">
          {hasAnyVideos
            ? "You've watched everything in your playlists — nice work! Add more to get a new daily pick."
            : "No videos in your playlists yet — add some on YouTube, then check back for a daily pick."}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">Picking today's video…</span>
        </div>
      )}

      {loading && playlists.length === 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Loading your YouTube playlists…</span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] rounded-2xl border border-border bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {!loading && playlists.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          No playlists yet. Connect your Google account to load your YouTube playlists.
        </div>
      )}

      <div className="space-y-3">
        {playlists.map((pl) => (
          <PlaylistCard key={pl.id} pl={pl} onWatched={onWatched} onRemind={onRemind} onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}
