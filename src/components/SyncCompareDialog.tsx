import { motion, AnimatePresence } from "motion/react"
import { X, GitCompareArrows, TriangleAlert, CheckCircle2, Plus, Minus, Pencil } from "lucide-react"
import type { SaveDialogState } from "../lib/useSyncedLists"
import type { ItemChange, ListChange } from "../lib/diff"

const kindStyle = {
  added: { icon: Plus, color: "var(--color-accent)", label: "Will be added to Supabase" },
  removed: { icon: Minus, color: "var(--color-error)", label: "Will be removed from Supabase" },
  changed: { icon: Pencil, color: "var(--color-amber)", label: "Will replace Supabase's version" },
} as const

function ItemRow({ c }: { c: ItemChange }) {
  const s = kindStyle[c.kind]
  return (
    <li className="flex gap-2 py-1">
      <s.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: s.color }} />
      <div className="min-w-0">
        <div className="text-sm break-words">{c.title || <span className="text-muted-2">(untitled)</span>}</div>
        {c.details.map((d) => (
          <div key={d} className="font-mono text-[11px] text-muted break-words">
            {d}
          </div>
        ))}
      </div>
    </li>
  )
}

function ListBlock({ l }: { l: ListChange }) {
  const s = kindStyle[l.kind]
  const title =
    l.kind === "added" ? `New list "${l.name}"` : l.kind === "removed" ? `List "${l.name}" is not on this device` : `In "${l.name}"`
  return (
    <div className="rounded-xl border border-border bg-elevated/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <s.icon className="h-3.5 w-3.5 shrink-0" style={{ color: s.color }} />
        <span className="break-words">{title}</span>
        {l.kind !== "changed" && <span className="font-mono text-[11px] font-normal text-muted-2">{l.items.length} item{l.items.length === 1 ? "" : "s"}</span>}
      </div>
      {l.details.map((d) => (
        <div key={d} className="ml-5 mt-1 font-mono text-[11px] text-muted">
          {d}
        </div>
      ))}
      {l.items.length > 0 && (
        <ul className="ml-5 mt-1">
          {l.items.map((c) => (
            <ItemRow key={c.kind + c.id} c={c} />
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SyncCompareDialog({
  dialog,
  onSave,
  onUseServer,
  onClose,
}: {
  dialog: SaveDialogState | null
  onSave: () => void
  onUseServer: () => void
  onClose: () => void
}) {
  const d = dialog?.diff
  const c = d?.counts
  const nothingToDo = !!d && (d.identical || d.orderOnly)
  const isConflict = !!dialog?.isConflict && !nothingToDo

  return (
    <AnimatePresence>
      {dialog && d && c && (
        <motion.div
          key="sync-compare"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Compare with Supabase"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface-2 p-6 shadow-2xl"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-2 hover:bg-elevated hover:text-foreground transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 pr-8">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: isConflict ? "color-mix(in oklab, var(--color-amber) 18%, transparent)" : "color-mix(in oklab, var(--color-primary) 15%, transparent)" }}
              >
                {nothingToDo ? (
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                ) : isConflict ? (
                  <TriangleAlert className="h-5 w-5" style={{ color: "var(--color-amber)" }} />
                ) : (
                  <GitCompareArrows className="h-5 w-5 text-primary" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-2">This device vs Supabase</div>
                <div className="font-medium">
                  {nothingToDo
                    ? "Everything matches"
                    : dialog.trigger === "auto-conflict"
                      ? "This device and Supabase disagree"
                      : dialog.trigger === "manual-refresh"
                        ? "Refreshing would discard changes made here"
                        : isConflict
                          ? "Supabase has changes this device doesn't"
                          : "Review before saving"}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {nothingToDo ? (
              <p className="mt-4 text-sm text-muted">
                {d.orderOnly
                  ? "The only difference is the order things are stored in — nothing was added, removed or edited."
                  : "What's on this device is identical to what's saved on Supabase right now. Nothing to save."}
              </p>
            ) : (
              <>
                {isConflict && (
                  <p className="mt-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm">
                    Supabase has been changed since this device last synced (from another device or browser, or a save here that never completed).
                    Saving now would overwrite those changes.
                  </p>
                )}
                <p className="mt-4 text-sm text-muted">
                  If you save, Supabase will end up matching this device. Here's what that would do:
                </p>
                <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
                  {c.added > 0 && <span style={{ color: kindStyle.added.color }}>+{c.added} added</span>}
                  {c.removed > 0 && <span style={{ color: kindStyle.removed.color }}>−{c.removed} removed</span>}
                  {c.changed > 0 && <span style={{ color: kindStyle.changed.color }}>~{c.changed} changed</span>}
                </div>
                <div className="mt-3 space-y-2">
                  {d.lists.map((l) => (
                    <ListBlock key={l.kind + l.id} l={l} />
                  ))}
                </div>
              </>
            )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              {nothingToDo ? (
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 active:scale-[.98] transition"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={onClose}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted hover:bg-elevated transition sm:flex-1"
                  >
                    Cancel
                  </button>
                  {(isConflict || dialog.trigger !== "manual-save") && (
                    <button
                      onClick={onUseServer}
                      className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-elevated transition sm:flex-1"
                    >
                      Use Supabase's version
                    </button>
                  )}
                  <button
                    onClick={onSave}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 active:scale-[.98] transition sm:flex-1"
                  >
                    Save this device's version
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
