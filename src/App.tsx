import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import type { Session } from "@supabase/supabase-js"
import { ListChecks, ListVideo, LogOut, Check } from "lucide-react"
import Login from "./components/Login"
import Lists from "./components/Lists"
import Playlists from "./components/Playlists"
import SyncDialog, { type SyncRequest } from "./components/SyncDialog"
import { supabase } from "./lib/supabase"
import { signInWithGoogle, signOut, cacheProviderToken, saveGoogleRefreshToken, withGoogleToken, GoogleAuthError } from "./lib/auth"
import { fetchPlaylists, fetchRandomVideo, createCalendarEvent, deletePlaylistItem } from "./lib/google"
import { loadLists, saveLists, loadWatched, addWatched, loadDailyVideo, saveDailyVideo } from "./lib/store"
import { defaultLists, type DailyVideo, type ListCategory, type ListKind, type Playlist } from "./data/mock"

const NOTIF_DATE_KEY = "reel.last_notif_date"

type View = "lists" | "playlists"

const nav: { id: View; label: string; icon: any }[] = [
  { id: "lists", label: "Lists", icon: ListChecks },
  { id: "playlists", label: "Playlists", icon: ListVideo },
]

type AppUser = { name: string; email: string; avatar: string }

function toUser(session: Session): AppUser {
  const m = session.user.user_metadata ?? {}
  return {
    name: m.full_name ?? m.name ?? session.user.email?.split("@")[0] ?? "You",
    email: session.user.email ?? "",
    avatar: m.avatar_url ?? m.picture ?? "",
  }
}

type DialogState = { request: SyncRequest; run: (start: Date, durationMin: number) => void } | null

// What to tell the user when a Google call fails, and whether re-consent would help.
function describeGoogleError(e: unknown): { message: string; kind: "reconnect" | "retry" } {
  if (e instanceof GoogleAuthError) {
    return e.reason === "reconnect"
      ? {
          message: "Google needs you to approve access once more. After that TaskMan renews access on its own.",
          kind: "reconnect",
        }
      : {
          message: "Couldn't renew Google access right now (offline, or the server is unavailable). Try again in a moment.",
          kind: "retry",
        }
  }
  const message = e instanceof Error ? e.message : String(e)
  // A 401/403 that survived the automatic retry means the grant itself is the problem.
  return { message, kind: /Google API 40[13]/.test(message) ? "reconnect" : "retry" }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState<View>("lists")
  const [lists, setLists] = useState<ListCategory[]>(defaultLists)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(true)
  const [daily, setDaily] = useState<DailyVideo | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyError, setDailyError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [demo, setDemo] = useState(false)
  const [demoReason, setDemoReason] = useState<string>("")
  const [demoKind, setDemoKind] = useState<"reconnect" | "retry">("reconnect")
  const [dialog, setDialog] = useState<DialogState>(null)

  // Keyed on the user id, not the session object: Supabase emits a new session object on
  // every token refresh and tab focus, which used to re-run all the loading below.
  const userId = session?.user.id ?? null

  // Session bootstrap + auth changes.
  useEffect(() => {
    const onSession = (s: Session | null) => {
      setSession(s)
      cacheProviderToken(s?.provider_token)
      // Only present right after the Google redirect — hand it to the server for safekeeping.
      void saveGoogleRefreshToken(s)
    }
    supabase.auth.getSession().then(({ data }) => {
      onSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => onSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load real data once signed in.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      // Custom lists live in our DB; seed empty categories on first run.
      try {
        const stored = await loadLists()
        if (cancelled) return
        if (stored?.length) setLists(stored)
        else await saveLists(defaultLists)
      } catch {
        /* keep local lists */
      }

      setLoadingPlaylists(true)
      try {
        const watched = new Set(await loadWatched())
        // withGoogleToken renews the Google access token via the edge function when the
        // cached one has expired (it lasts ~1h), so a next-day open just works.
        const pls = await withGoogleToken((token) => fetchPlaylists(token, watched))
        if (cancelled) return
        setPlaylists(pls)
        setDemo(false)
        setDemoReason("")
      } catch (e) {
        if (cancelled) return
        console.error("[TaskMan] YouTube sync failed:", e)
        const d = describeGoogleError(e)
        setDemo(true)
        setDemoReason(d.message)
        setDemoKind(d.kind)
      } finally {
        if (!cancelled) setLoadingPlaylists(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Random video of the day: one pick per calendar day (cached locally); `force` re-rolls.
  const rollDaily = useCallback(async (force: boolean) => {
    if (!force) {
      const cached = loadDailyVideo()
      if (cached) {
        setDaily(cached)
        return
      }
    }
    setDailyLoading(true)
    setDailyError(null)
    try {
      const watched = new Set(await loadWatched())
      const video = await withGoogleToken((token) => fetchRandomVideo(token, watched))
      saveDailyVideo(video)
      setDaily(video)
    } catch (e) {
      console.error("[TaskMan] Random video failed:", e)
      setDailyError(describeGoogleError(e).message)
      if (force) notify("Couldn't fetch another video")
    } finally {
      setDailyLoading(false)
    }
  }, [])

  useEffect(() => {
    if (userId) void rollDaily(false)
    else setDaily(null)
  }, [userId, rollDaily])

  // Daily "video of the day" notification — fires once per calendar day.
  // Uses localStorage so it survives page reloads and works after re-auth.
  useEffect(() => {
    if (!userId || !daily) return
    const today = new Date().toDateString()
    if (localStorage.getItem(NOTIF_DATE_KEY) === today) return
    if (!("Notification" in window)) return
    const fire = () => {
      try {
        new Notification("TaskMan — random video of the day", {
          body: daily.title,
          icon: "/icon.svg",
        })
        localStorage.setItem(NOTIF_DATE_KEY, today)
      } catch {
        /* notifications unavailable */
      }
    }
    if (Notification.permission === "granted") fire()
    else if (Notification.permission === "default") {
      Notification.requestPermission()
        .then((p) => { if (p === "granted") fire() })
        .catch(() => {})
    }
  }, [userId, daily])

  function notify(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  function updateLists(next: ListCategory[]) {
    setLists(next)
    if (session) saveLists(next).catch(() => {})
  }

  function mapItems(catId: string, fn: (items: ListCategory["items"]) => ListCategory["items"]) {
    updateLists(lists.map((c) => (c.id === catId ? { ...c, items: fn(c.items) } : c)))
  }

  function toggleItem(catId: string, itemId: string) {
    mapItems(catId, (items) => items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)))
  }

  function deleteItem(catId: string, itemId: string) {
    mapItems(catId, (items) => items.filter((i) => i.id !== itemId))
    notify("Item deleted")
  }

  function addTag(catId: string, itemId: string, tag: string) {
    mapItems(catId, (items) =>
      items.map((i) => (i.id === itemId && !i.tags.includes(tag) ? { ...i, tags: [...i.tags, tag] } : i)),
    )
  }

  function removeTag(catId: string, itemId: string, tag: string) {
    mapItems(catId, (items) => items.map((i) => (i.id === itemId ? { ...i, tags: i.tags.filter((t) => t !== tag) } : i)))
  }

  // Returns the new list's id so the Lists screen can switch to it.
  function createList(name: string, kind: ListKind, accent: string): string {
    const id = crypto.randomUUID()
    updateLists([...lists, { id, name, kind, accent, items: [] }])
    return id
  }

  function deleteList(catId: string) {
    if (lists.length <= 1) return
    updateLists(lists.filter((c) => c.id !== catId))
    notify("List deleted")
  }

  // Creates the event with Google first; the item only shows as "Synced" if that worked.
  async function createEvent(opts: { title: string; start: Date; durationMin: number; description?: string }) {
    try {
      await withGoogleToken((token) => createCalendarEvent(token, opts))
      return true
    } catch (e) {
      notify(
        e instanceof GoogleAuthError && e.reason === "reconnect"
          ? "Reconnect Google to add calendar events"
          : "Couldn't reach Google Calendar",
      )
      return false
    }
  }

  // Open the date/time dialog, then create the calendar event on confirm.
  function syncItem(catId: string, itemId: string) {
    const cat = lists.find((c) => c.id === catId)
    const item = cat?.items.find((i) => i.id === itemId)
    if (!cat || !item) return
    setDialog({
      request: { title: `${cat.name}: ${item.title}`, description: item.note, durationMin: 60 },
      run: async (start, durationMin) => {
        const ok = await createEvent({
          title: `${cat.name}: ${item.title}`,
          start,
          durationMin,
          description: item.note,
        })
        if (!ok) return
        mapItems(catId, (items) => items.map((i) => (i.id === itemId ? { ...i, syncedToCalendar: true } : i)))
        notify(`"${item.title}" added to Google Calendar`)
      },
    })
  }

  function addItem(catId: string, title: string) {
    mapItems(catId, (items) => [
      { id: crypto.randomUUID(), title, note: "", done: false, syncedToCalendar: false, tags: [] },
      ...items,
    ])
  }

  // Manual backend save — fallback when the auto-save didn't fire.
  async function manualSync() {
    if (!session) return
    setSaving(true)
    try {
      await saveLists(lists)
      notify("Lists saved to your account")
    } catch {
      notify("Couldn't save — check your connection")
    } finally {
      setSaving(false)
    }
  }

  function markWatched(plId: string, vId: string) {
    setPlaylists((pls) =>
      pls.map((p) =>
        p.id === plId ? { ...p, videos: p.videos.map((v) => (v.id === vId ? { ...v, watched: true } : v)) } : p,
      ),
    )
    if (session) addWatched(vId).catch(() => {})
    notify("Marked as watched")
  }

  function markDailyWatched() {
    if (!daily) return
    const next = { ...daily, watched: true }
    setDaily(next)
    saveDailyVideo(next)
    if (session) addWatched(daily.id).catch(() => {})
    notify("Marked as watched")
  }

  async function removeVideo(plId: string, vId: string) {
    const video = playlists.find((p) => p.id === plId)?.videos.find((v) => v.id === vId)
    if (!video) return
    try {
      await withGoogleToken((token) => deletePlaylistItem(token, video.playlistItemId))
      setPlaylists((pls) =>
        pls.map((p) => (p.id === plId ? { ...p, videos: p.videos.filter((v) => v.id !== vId) } : p)),
      )
      notify("Removed from playlist")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 403 = the granted token predates the write scope; a reconnect fixes it.
      const needsReconnect = (e instanceof GoogleAuthError && e.reason === "reconnect") || msg.includes("403")
      notify(needsReconnect ? "Reconnect Google to manage your playlists" : "Couldn't remove from playlist")
    }
  }

  function remindTitle(title: string) {
    setDialog({
      request: { title, durationMin: 30 },
      run: async (start, durationMin) => {
        if (await createEvent({ title, start, durationMin })) notify("Reminder added to Google Calendar")
      },
    })
  }

  function remindVideo(plId: string, vId: string) {
    const video = playlists.find((p) => p.id === plId)?.videos.find((v) => v.id === vId)
    if (video) remindTitle(`Watch: ${video.title}`)
  }

  if (booting) {
    return (
      <div className="app-mesh min-h-full grid place-items-center">
        <span className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin" />
      </div>
    )
  }

  if (!session) return <Login onSignIn={signInWithGoogle} />

  const user = toUser(session)

  return (
    <div className="app-mesh min-h-full flex flex-col lg:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border p-5 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2">
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight">TaskMan</span>
        </div>

        <nav className="mt-8 space-y-1">
          {nav.map((n) => (
            <NavButton key={n.id} n={n} active={view === n.id} onClick={() => setView(n.id)} />
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{user.name}</div>
            <div className="text-xs text-muted truncate">{user.email}</div>
          </div>
          <button onClick={signOut} title="Sign out" className="text-muted-2 hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-lg font-bold tracking-tight">TaskMan</span>
          </div>
          <button onClick={signOut} title="Sign out" className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="mx-auto max-w-5xl px-4 sm:px-8 py-6 sm:py-10 pb-28 lg:pb-10">
          {demo && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
              <div className="flex-1 min-w-0">
                <div className="font-medium">Not connected to your Google data.</div>
                {demoReason && (
                  <div className="mt-1 text-amber/80 break-words font-mono text-[12px] leading-relaxed">
                    {demoReason}
                  </div>
                )}
              </div>
              <button
                onClick={() => (demoKind === "reconnect" ? signInWithGoogle() : window.location.reload())}
                className="shrink-0 rounded-lg border border-amber/40 px-3 py-1.5 text-xs font-semibold hover:bg-amber/15 transition"
              >
                {demoKind === "reconnect" ? "Reconnect Google" : "Retry"}
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {view === "lists" && (
                <Lists
                  lists={lists}
                  onToggle={toggleItem}
                  onSync={syncItem}
                  onAdd={addItem}
                  onDelete={deleteItem}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  onCreateList={createList}
                  onDeleteList={deleteList}
                  onSave={manualSync}
                  saving={saving}
                />
              )}
              {view === "playlists" && (
                <Playlists
                  playlists={playlists}
                  loading={loadingPlaylists}
                  daily={daily}
                  dailyLoading={dailyLoading}
                  dailyError={dailyError}
                  onDailyWatched={markDailyWatched}
                  onDailyRemind={() => daily && remindTitle(`Watch: ${daily.title}`)}
                  onDailyShuffle={() => void rollDaily(true)}
                  onWatched={markWatched}
                  onRemind={remindVideo}
                  onRemove={removeVideo}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/90 backdrop-blur-xl flex">
        {nav.map((n) => {
          const on = view === n.id
          return (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5"
              style={{ color: on ? "var(--color-primary)" : "var(--color-muted-2)" }}
            >
              <n.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{n.label}</span>
            </button>
          )
        })}
      </nav>

      <SyncDialog
        request={dialog?.request ?? null}
        onCancel={() => setDialog(null)}
        onConfirm={(start, durationMin) => {
          dialog?.run(start, durationMin)
          setDialog(null)
        }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 rounded-full border border-border bg-elevated px-4 py-2.5 shadow-2xl"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent">
              <Check className="h-3 w-3 text-background" />
            </span>
            <span className="text-sm">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Avatar({ user }: { user: AppUser }) {
  if (user.avatar)
    return <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full object-cover bg-elevated" />
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-elevated font-display font-bold text-sm">
      {user.name.charAt(0).toUpperCase()}
    </span>
  )
}

function NavButton({ n, active, onClick }: { n: (typeof nav)[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
      style={{ color: active ? "var(--color-foreground)" : "var(--color-muted)" }}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl bg-surface border border-border"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <n.icon className="relative h-4.5 w-4.5" style={{ color: active ? "var(--color-primary)" : undefined }} />
      <span className="relative">{n.label}</span>
    </button>
  )
}

function Logo() {
  return (
    <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary">
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
        <path d="M5 12.5 L10 17 L19 7" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
