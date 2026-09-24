import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { CalendarPlus, X } from "lucide-react"

export type SyncRequest = {
  title: string
  description?: string
  durationMin?: number
}

// Default the picker to tomorrow at 8:00 PM, formatted for the native inputs.
function defaults() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(20, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export default function SyncDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: SyncRequest | null
  onCancel: () => void
  onConfirm: (start: Date, durationMin: number) => void
}) {
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [duration, setDuration] = useState(60)

  useEffect(() => {
    if (request) {
      const d = defaults()
      setDate(d.date)
      setTime(d.time)
      setDuration(request.durationMin ?? 60)
    }
  }, [request])

  function confirm() {
    if (!date || !time) return
    const start = new Date(`${date}T${time}`)
    if (Number.isNaN(+start)) return
    onConfirm(start, duration)
  }

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative w-full max-w-md rounded-2xl border border-border bg-surface-2 p-6 shadow-2xl"
          >
            <button
              onClick={onCancel}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-2 hover:bg-elevated hover:text-foreground transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15">
                <CalendarPlus className="h-5 w-5 text-primary" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-2">Add to Google Calendar</div>
                <div className="font-medium truncate">{request.title}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Day</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-primary [color-scheme:dark]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Time</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-primary [color-scheme:dark]"
                />
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Duration</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-primary [color-scheme:dark]"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </label>

            <div className="mt-6 flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted hover:bg-elevated transition"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 active:scale-[.98] transition"
              >
                Add event
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
