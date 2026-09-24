import { useState } from "react"
import { motion } from "motion/react"
import { CalendarClock, ListVideo, Sparkles, ShieldCheck } from "lucide-react"
import GoogleIcon from "./GoogleIcon"

const scopes = [
  { icon: CalendarClock, label: "Google Calendar", sub: "Create events & reminders from your lists" },
  { icon: ListVideo, label: "YouTube playlists", sub: "See what's unwatched, keep lists fresh" },
]

export default function Login({ onSignIn }: { onSignIn: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    setPending(true)
    setError(null)
    try {
      // Real Google OAuth via Supabase — redirects to Google's consent screen.
      await onSignIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed")
      setPending(false)
    }
  }

  return (
    <div className="app-mesh min-h-full grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand / pitch panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight">TaskMan</span>
        </div>

        <div className="max-w-md">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight"
          >
            Everything you meant to watch,
            <span className="text-primary"> back on schedule.</span>
          </motion.h1>
          <p className="mt-5 text-muted text-lg leading-relaxed">
            TaskMan turns your ideas, movies, anime and series into lists you can
            drop straight onto Google Calendar — with a daily nudge that keeps
            your YouTube watchlist from going stale.
          </p>
        </div>

        <div className="flex gap-8">
          {[
            ["1,240", "videos triaged"],
            ["31", "day streak"],
            ["4", "custom lists"],
          ].map(([n, l]) => (
            <div key={l}>
              <div className="font-display text-3xl font-bold">{n}</div>
              <div className="font-mono text-xs uppercase tracking-widest text-muted-2 mt-1">{l}</div>
            </div>
          ))}
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-1/3 h-96 w-96 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(187,134,252,.25), transparent 70%)" }}
        />
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md rounded-[calc(var(--radius)+8px)] border border-border bg-surface/70 backdrop-blur-xl p-8 sm:p-10 shadow-2xl"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo />
            <span className="font-display text-xl font-bold tracking-tight">Reel</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> welcome back
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight mt-4">Sign in to TaskMan</h2>
          <p className="text-muted mt-2">Continue with the Google account that holds your calendar and playlists.</p>

          <button
            onClick={handle}
            disabled={pending}
            className="group mt-7 w-full flex items-center justify-center gap-3 rounded-xl bg-foreground text-background font-semibold py-3.5 transition hover:brightness-95 active:scale-[.99] disabled:opacity-70"
          >
            {pending ? (
              <span className="h-5 w-5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
            ) : (
              <GoogleIcon className="h-5 w-5" />
            )}
            {pending ? "Connecting…" : "Continue with Google"}
          </button>

          {error && (
            <p className="mt-3 text-sm text-error">{error}</p>
          )}

          <div className="mt-8 space-y-3">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-2">TaskMan will access</div>
            {scopes.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
                <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs text-muted-2">
            <ShieldCheck className="h-4 w-4" />
            You can revoke access anytime from your Google account.
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path d="M5 12.5 L10 17 L19 7" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
