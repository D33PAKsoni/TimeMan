import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Plus,
  Check,
  CalendarPlus,
  CalendarCheck2,
  Cloud,
  Loader2,
  Trash2,
  X,
  Tag,
  Lightbulb,
  Film,
  Tv,
  MonitorPlay,
  BookOpen,
  Music,
  Gamepad2,
  Utensils,
  ShoppingCart,
  Plane,
  Dumbbell,
  Heart,
  Star,
  List as ListGlyph,
} from "lucide-react"
import type { ListCategory, ListKind } from "../data/mock"

// Icon registry. The first four keys are the built-in list kinds; the rest are
// offered in the "New list" picker. Unknown keys fall back to a generic list icon.
export const kindIcon: Record<string, any> = {
  idea: Lightbulb,
  movie: Film,
  anime: MonitorPlay,
  series: Tv,
  book: BookOpen,
  music: Music,
  game: Gamepad2,
  food: Utensils,
  shopping: ShoppingCart,
  travel: Plane,
  fitness: Dumbbell,
  heart: Heart,
  star: Star,
  list: ListGlyph,
}
const iconFor = (k: ListKind) => kindIcon[k] ?? ListGlyph
const PICKER_ICONS = ["list", "star", "heart", "book", "music", "game", "food", "shopping", "travel", "fitness", "idea", "movie"]

const ACCENTS = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-error)",
  "var(--color-amber)",
  "var(--color-cyan)",
  "#f48fb1",
  "#a5d6a7",
]

// "#Sci Fi " -> "sci-fi"
const normTag = (raw: string) => raw.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 24)

export default function Lists({
  lists,
  onToggle,
  onSync,
  onAdd,
  onDelete,
  onAddTag,
  onRemoveTag,
  onCreateList,
  onDeleteList,
  onSave,
  saving,
}: {
  lists: ListCategory[]
  onToggle: (catId: string, itemId: string) => void
  onSync: (catId: string, itemId: string) => void
  onAdd: (catId: string, title: string) => void
  onDelete: (catId: string, itemId: string) => void
  onAddTag: (catId: string, itemId: string, tag: string) => void
  onRemoveTag: (catId: string, itemId: string, tag: string) => void
  onCreateList: (name: string, kind: ListKind, accent: string) => string
  onDeleteList: (catId: string) => void
  onSave: () => void
  saving: boolean
}) {
  const [active, setActive] = useState(lists[0].id)
  const [draft, setDraft] = useState("")
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [tagEditing, setTagEditing] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState("")

  // "New list" form
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newKind, setNewKind] = useState<ListKind>("list")
  const [newAccent, setNewAccent] = useState(ACCENTS[0])

  // Two-step delete: first tap arms the button for 3s, second tap confirms.
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(null), 3000)
    return () => clearTimeout(t)
  }, [armed])
  function confirmThen(key: string, action: () => void) {
    if (armed === key) {
      setArmed(null)
      action()
    } else {
      setArmed(key)
    }
  }

  // If the active list was just deleted, fall back to the first one.
  const cat = lists.find((l) => l.id === active) ?? lists[0]
  const Icon = iconFor(cat.kind)

  const allTags = [...new Set(cat.items.flatMap((i) => i.tags))].sort()
  const activeTag = filterTag && allTags.includes(filterTag) ? filterTag : null
  const visibleItems = activeTag ? cat.items.filter((i) => i.tags.includes(activeTag)) : cat.items

  function selectList(id: string) {
    setActive(id)
    setFilterTag(null)
    setTagEditing(null)
    setArmed(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onAdd(cat.id, draft.trim())
    setDraft("")
  }

  function submitList(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const id = onCreateList(name, newKind, newAccent)
    selectList(id)
    setNewName("")
    setNewKind("list")
    setNewAccent(ACCENTS[0])
    setCreating(false)
  }

  function submitTag(e: React.FormEvent, itemId: string) {
    e.preventDefault()
    const tag = normTag(tagDraft)
    if (tag) onAddTag(cat.id, itemId, tag)
    setTagEditing(null)
    setTagDraft("")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-2">Custom categories</div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">Lists</h1>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-[.98] transition disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          Sync
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {lists.map((l) => {
          const K = iconFor(l.kind)
          const on = l.id === cat.id
          const open = l.items.filter((i) => !i.done).length
          return (
            <button
              key={l.id}
              onClick={() => selectList(l.id)}
              className="group flex items-center gap-2 rounded-xl border px-4 py-2.5 transition"
              style={{
                borderColor: on ? l.accent : "var(--color-border)",
                background: on ? "color-mix(in oklab, " + l.accent + " 12%, transparent)" : "var(--color-surface)",
              }}
            >
              <K className="h-4 w-4" style={{ color: l.accent }} />
              <span className="font-medium text-sm">{l.name}</span>
              <span className="font-mono text-[11px] text-muted-2">{open}</span>
            </button>
          )
        })}
        <button
          onClick={() => setCreating((c) => !c)}
          aria-expanded={creating}
          className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-surface transition"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? "Cancel" : "New list"}
        </button>
      </div>

      {/* New list form */}
      <AnimatePresence initial={false}>
        {creating && (
          <motion.form
            onSubmit={submitList}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={30}
                placeholder="List name — e.g. Books, Podcasts, Trips"
                className="w-full rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-primary placeholder:text-muted-2"
              />

              <div>
                <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-2">Icon</div>
                <div className="flex flex-wrap gap-2">
                  {PICKER_ICONS.map((k) => {
                    const K = kindIcon[k]
                    const on = newKind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNewKind(k)}
                        aria-label={k}
                        aria-pressed={on}
                        className="grid h-9 w-9 place-items-center rounded-lg border transition"
                        style={{
                          borderColor: on ? newAccent : "var(--color-border)",
                          background: on ? "color-mix(in oklab, " + newAccent + " 15%, transparent)" : "transparent",
                        }}
                      >
                        <K className="h-4 w-4" style={{ color: on ? newAccent : "var(--color-muted)" }} />
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-2">Color</div>
                <div className="flex flex-wrap gap-2.5">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewAccent(c)}
                      aria-label={`Color ${c}`}
                      aria-pressed={newAccent === c}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{ background: c, borderColor: newAccent === c ? "var(--color-foreground)" : "transparent" }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-elevated transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 active:scale-[.98] transition disabled:opacity-50"
                >
                  Create list
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Add row */}
      <form onSubmit={submit} className="flex gap-2">
        <div className="flex-1 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 focus-within:border-border-strong">
          <Icon className="h-4 w-4" style={{ color: cat.accent }} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Add to ${cat.name}…`}
            className="flex-1 bg-transparent py-3 outline-none placeholder:text-muted-2"
          />
        </div>
        <button
          type="submit"
          className="grid place-items-center rounded-xl bg-foreground text-background px-4 font-semibold hover:brightness-95 active:scale-95 transition"
        >
          <Plus className="h-5 w-5" />
        </button>
      </form>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-2">Tags</span>
          {allTags.map((t) => {
            const on = activeTag === t
            return (
              <button
                key={t}
                onClick={() => setFilterTag(on ? null : t)}
                aria-pressed={on}
                className="rounded-md border px-2 py-0.5 font-mono text-[11px] transition"
                style={{
                  borderColor: on ? cat.accent : "var(--color-border)",
                  color: on ? cat.accent : "var(--color-muted)",
                  background: on ? "color-mix(in oklab, " + cat.accent + " 12%, transparent)" : "transparent",
                }}
              >
                #{t}
              </button>
            )
          })}
          {activeTag && (
            <button onClick={() => setFilterTag(null)} className="text-xs text-muted-2 hover:text-foreground underline">
              clear
            </button>
          )}
        </div>
      )}
      <datalist id="tag-suggestions">
        {allTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* Items */}
      <div className="space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {visibleItems.map((item) => {
            const delKey = `item:${item.id}`
            const delArmed = armed === delKey
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="group flex items-start gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-border-strong transition"
              >
                <button
                  onClick={() => onToggle(cat.id, item.id)}
                  aria-label={item.done ? "Mark as not done" : "Mark as done"}
                  className="mt-0.5 grid h-6 w-6 place-items-center rounded-full border transition shrink-0"
                  style={{
                    borderColor: item.done ? cat.accent : "var(--color-border-strong)",
                    background: item.done ? cat.accent : "transparent",
                  }}
                >
                  {item.done && <Check className="h-3.5 w-3.5 text-background" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className={"font-medium break-words " + (item.done ? "line-through text-muted-2" : "")}>{item.title}</div>
                  {item.note && <div className="text-sm text-muted mt-0.5">{item.note}</div>}

                  <div className="flex gap-1.5 mt-2 flex-wrap items-center">
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-0.5 rounded-md bg-elevated pl-2 pr-1 py-0.5 font-mono text-[11px] text-muted"
                      >
                        #{t}
                        <button
                          onClick={() => onRemoveTag(cat.id, item.id, t)}
                          aria-label={`Remove tag ${t}`}
                          className="grid h-4 w-4 place-items-center rounded text-muted-2 hover:bg-border hover:text-foreground transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}

                    {tagEditing === item.id ? (
                      <form onSubmit={(e) => submitTag(e, item.id)}>
                        <input
                          autoFocus
                          list="tag-suggestions"
                          value={tagDraft}
                          onChange={(e) => setTagDraft(e.target.value)}
                          onBlur={() => {
                            setTagEditing(null)
                            setTagDraft("")
                          }}
                          onKeyDown={(e) => e.key === "Escape" && setTagEditing(null)}
                          maxLength={24}
                          placeholder="tag, then Enter"
                          className="w-32 rounded-md border border-border-strong bg-elevated px-2 py-0.5 font-mono text-[11px] outline-none focus:border-primary placeholder:text-muted-2"
                        />
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          setTagEditing(item.id)
                          setTagDraft("")
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-[11px] text-muted-2 hover:border-border-strong hover:text-foreground transition"
                      >
                        <Tag className="h-3 w-3" /> tag
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onSync(cat.id, item.id)}
                  title={item.syncedToCalendar ? "Synced to Google Calendar" : "Sync to Google Calendar"}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition"
                  style={{
                    borderColor: item.syncedToCalendar ? "var(--color-primary)" : "var(--color-border)",
                    color: item.syncedToCalendar ? "var(--color-primary)" : "var(--color-muted)",
                  }}
                >
                  {item.syncedToCalendar ? (
                    <>
                      <CalendarCheck2 className="h-3.5 w-3.5" /> Synced
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="h-3.5 w-3.5" /> Sync
                    </>
                  )}
                </button>

                <button
                  onClick={() => confirmThen(delKey, () => onDelete(cat.id, item.id))}
                  title={delArmed ? "Tap again to delete" : "Delete item"}
                  aria-label={delArmed ? "Confirm delete item" : "Delete item"}
                  className={
                    "shrink-0 grid place-items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition " +
                    (delArmed
                      ? "border-error bg-error/15 text-error"
                      : "border-border text-muted-2 hover:border-error/40 hover:text-error")
                  }
                >
                  {delArmed ? "Delete?" : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {cat.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            Nothing in {cat.name} yet — add your first item above.
          </div>
        )}
        {cat.items.length > 0 && visibleItems.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No items tagged #{activeTag}.
          </div>
        )}
      </div>

      {/* Delete list (always keep at least one) */}
      {lists.length > 1 && (
        <div className="pt-2">
          <button
            onClick={() =>
              confirmThen(`list:${cat.id}`, () => {
                const next = lists.find((l) => l.id !== cat.id)
                if (next) selectList(next.id)
                onDeleteList(cat.id)
              })
            }
            className={
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition " +
              (armed === `list:${cat.id}`
                ? "border-error bg-error/15 text-error"
                : "border-border text-muted-2 hover:border-error/40 hover:text-error")
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            {armed === `list:${cat.id}`
              ? `Tap again to delete "${cat.name}"${cat.items.length ? ` and its ${cat.items.length} item${cat.items.length === 1 ? "" : "s"}` : ""}`
              : "Delete this list"}
          </button>
        </div>
      )}
    </div>
  )
}
