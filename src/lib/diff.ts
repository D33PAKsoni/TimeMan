import type { ListCategory, ListItem } from "../data/mock"
import { canonical } from "./store"

// Everything here is worded from the point of view of "what happens if this device's
// copy is saved over Supabase's copy":
//   added   = on this device, not on Supabase  -> will be ADDED to Supabase
//   removed = on Supabase, not on this device  -> will be REMOVED from Supabase
//   changed = on both, but different           -> Supabase's version will be REPLACED

export type ItemChange = {
  kind: "added" | "removed" | "changed"
  id: string
  title: string
  // For "changed": human-readable "field: server -> device" lines.
  details: string[]
}

export type ListChange = {
  id: string
  name: string
  kind: "added" | "removed" | "changed"
  details: string[] // list-level changes (renamed, new icon/colour)
  items: ItemChange[]
}

export type Diff = {
  identical: boolean
  lists: ListChange[]
  counts: { added: number; removed: number; changed: number } // items + whole lists
  // The copies differ, but only in ordering — nothing was added, removed or edited.
  orderOnly: boolean
}

const show = (v: unknown) => (v === undefined || v === "" ? "(none)" : Array.isArray(v) ? (v.length ? v.join(", ") : "(none)") : String(v))

function itemDetails(server: ListItem, local: ListItem): string[] {
  const out: string[] = []
  if (server.title !== local.title) out.push(`title: "${server.title}" → "${local.title}"`)
  if ((server.note ?? "") !== (local.note ?? "")) out.push(`note: ${show(server.note)} → ${show(local.note)}`)
  if (!!server.done !== !!local.done) out.push(`done: ${server.done ? "yes" : "no"} → ${local.done ? "yes" : "no"}`)
  if (server.priority !== local.priority) out.push(`priority: ${show(server.priority)} → ${show(local.priority)}`)
  if (canonical(server.tags ?? []) !== canonical(local.tags ?? [])) out.push(`tags: ${show(server.tags)} → ${show(local.tags)}`)
  if (!!server.syncedToCalendar !== !!local.syncedToCalendar)
    out.push(`calendar: ${server.syncedToCalendar ? "synced" : "not synced"} → ${local.syncedToCalendar ? "synced" : "not synced"}`)
  return out
}

export function diffLists(local: ListCategory[], server: ListCategory[] | null): Diff {
  const serverLists = server ?? []
  const serverById = new Map(serverLists.map((l) => [l.id, l]))
  const localById = new Map(local.map((l) => [l.id, l]))
  const changes: ListChange[] = []
  const counts = { added: 0, removed: 0, changed: 0 }

  for (const l of local) {
    const s = serverById.get(l.id)
    if (!s) {
      counts.added += 1 + l.items.length
      changes.push({
        id: l.id,
        name: l.name,
        kind: "added",
        details: [],
        items: l.items.map((i) => ({ kind: "added", id: i.id, title: i.title, details: [] })),
      })
      continue
    }

    const details: string[] = []
    if (s.name !== l.name) details.push(`name: "${s.name}" → "${l.name}"`)
    if (s.kind !== l.kind) details.push(`icon: ${s.kind} → ${l.kind}`)
    if (s.accent !== l.accent) details.push("colour changed")

    const sItems = new Map(s.items.map((i) => [i.id, i]))
    const lItems = new Map(l.items.map((i) => [i.id, i]))
    const items: ItemChange[] = []
    for (const i of l.items) {
      const si = sItems.get(i.id)
      if (!si) {
        items.push({ kind: "added", id: i.id, title: i.title, details: [] })
        counts.added++
      } else {
        const d = itemDetails(si, i)
        if (d.length) {
          items.push({ kind: "changed", id: i.id, title: i.title, details: d })
          counts.changed++
        }
      }
    }
    for (const si of s.items) {
      if (!lItems.has(si.id)) {
        items.push({ kind: "removed", id: si.id, title: si.title, details: [] })
        counts.removed++
      }
    }

    if (details.length || items.length) {
      if (details.length) counts.changed++
      changes.push({ id: l.id, name: l.name, kind: "changed", details, items })
    }
  }

  for (const s of serverLists) {
    if (!localById.has(s.id)) {
      counts.removed += 1 + s.items.length
      changes.push({
        id: s.id,
        name: s.name,
        kind: "removed",
        details: [],
        items: s.items.map((i) => ({ kind: "removed", id: i.id, title: i.title, details: [] })),
      })
    }
  }

  const identical = server !== null ? canonical(local) === canonical(server) : local.length === 0
  return { identical, lists: changes, counts, orderOnly: !identical && changes.length === 0 }
}

export const countItems = (lists: ListCategory[] | null) => (lists ?? []).reduce((n, l) => n + l.items.length, 0)
