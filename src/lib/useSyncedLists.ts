import { useCallback, useEffect, useRef, useState } from "react"
import { defaultLists, defaultTodoList, type ListCategory } from "../data/mock"
import { canonical, fetchServerLists, pushServerLists, loadLocalLists, saveLocalLists, loadBase, saveBase } from "./store"
import { diffLists, type Diff } from "./diff"

export type SyncStatus = "loading" | "saving" | "saved" | "error" | "paused"

export type SaveDialogState = {
  // What opened it — changes the wording/buttons shown, not the comparison itself.
  trigger: "manual-save" | "manual-refresh" | "auto-conflict"
  diff: Diff
  serverLists: ListCategory[] | null
  // True when the server has moved independently of this device since its last known
  // sync — i.e. saving would overwrite someone/something else's change, not just this
  // device's own not-yet-pushed edit.
  isConflict: boolean
}

const AUTOSAVE_DELAY_MS = 1200

const withTodoGuaranteed = (ls: ListCategory[]): ListCategory[] => (ls.some((c) => c.id === "todo") ? ls : [defaultTodoList, ...ls])

export function useSyncedLists(userId: string | null) {
  const [lists, setListsState] = useState<ListCategory[]>(defaultLists)
  const [status, setStatus] = useState<SyncStatus>("loading")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<SaveDialogState | null>(null)

  // Refs, not state: these drive scheduling/decisions inside callbacks and must never
  // trigger a re-render or be read from a stale closure.
  const baseRef = useRef<string | null>(null)
  const pausedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listsRef = useRef(lists)
  listsRef.current = lists
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const pushNow = useCallback(async (toPush: ListCategory[]): Promise<boolean> => {
    setStatus("saving")
    const res = await pushServerLists(toPush)
    if (res.ok) {
      baseRef.current = canonical(toPush)
      if (userIdRef.current) saveBase(userIdRef.current, baseRef.current)
      setStatus("saved")
      setStatusMessage(null)
      return true
    }
    setStatus("error")
    setStatusMessage(
      res.reason === "auth" ? "Sign-in expired — reconnect to save" : res.reason === "network" ? "Offline — will retry" : "Couldn't save — try again",
    )
    return false
  }, [])

  const queueSave = useCallback(
    (next: ListCategory[], immediate = false) => {
      const uid = userIdRef.current
      if (!uid) return
      saveLocalLists(uid, next)
      if (pausedRef.current) {
        setStatus("paused")
        return
      }
      clearTimer()
      if (immediate) {
        void pushNow(next)
        return
      }
      setStatus("saving")
      timerRef.current = setTimeout(() => void pushNow(next), AUTOSAVE_DELAY_MS)
    },
    [pushNow],
  )

  // Keeps the ref and React state in step immediately, so a second edit in the same
  // tick (or one made while a fetch is in flight) always builds on the latest lists.
  const applyLists = useCallback((next: ListCategory[]) => {
    listsRef.current = next
    setListsState(next)
  }, [])

  // The single entry point every list edit in the app goes through.
  const setLists = useCallback(
    (updater: ListCategory[] | ((prev: ListCategory[]) => ListCategory[])) => {
      const next = typeof updater === "function" ? updater(listsRef.current) : updater
      applyLists(next)
      queueSave(next)
    },
    [applyLists, queueSave],
  )

  const adopt = useCallback((uid: string, next: ListCategory[]) => {
    applyLists(next)
    saveLocalLists(uid, next)
    baseRef.current = canonical(next)
    saveBase(uid, baseRef.current)
  }, [applyLists])

  // Shared by the initial load and the manual Refresh button — figures out whether
  // it's safe to just take the server's copy, safe to keep this device's copy as-is,
  // or genuinely ambiguous (needs the person to look at the diff and choose).
  const reconcile = useCallback(
    async (uid: string, trigger: "auto-conflict" | "manual-refresh") => {
      pausedRef.current = false // recomputed from scratch below; only the ambiguous case re-pauses
      const rawLocal = loadLocalLists(uid)
      const base = loadBase(uid)
      baseRef.current = base
      const initial = rawLocal ?? defaultLists
      const initialCanon = canonical(initial)
      applyLists(initial)

      const serverRes = await fetchServerLists()
      if (userIdRef.current !== uid) return // signed out / switched accounts while this was in flight
      if (!serverRes.ok) {
        setStatus(rawLocal ? "paused" : "error")
        setStatusMessage(serverRes.reason === "auth" ? "Sign-in expired — reconnect to load your lists" : "Couldn't reach Supabase")
        return
      }

      // The person may have edited while the request was in flight (slow connection).
      // Those edits are unsaved local work and must never be overwritten by the response.
      const local = listsRef.current
      const editedDuringFetch = canonical(local) !== initialCanon
      const hadLocalCache = rawLocal !== null || editedDuringFetch

      if (serverRes.lists === null) {
        // Nothing saved for this account yet. Seed it from whatever this device already
        // has (so a pre-existing local cache isn't silently discarded), or fall back to
        // the empty starter categories.
        const seed = withTodoGuaranteed(hadLocalCache && local.length ? local : defaultLists)
        adopt(uid, seed)
        setStatus("saving")
        await pushNow(seed)
        return
      }

      const server = withTodoGuaranteed(serverRes.lists)

      if (!hadLocalCache) {
        // Nothing of this device's own is at risk — just take the server's copy.
        adopt(uid, server)
        setStatus("saved")
        return
      }

      const localCanon = canonical(local)
      const serverCanon = canonical(server)

      if (localCanon === serverCanon) {
        adopt(uid, server) // same content; this also quietly repairs a stale/missing base marker
        setStatus("saved")
        return
      }
      if (base !== null && localCanon === base) {
        // This device's copy hasn't changed since it last synced — no local work to lose.
        adopt(uid, server)
        setStatus("saved")
        return
      }
      if (base !== null && serverCanon === base) {
        // The server hasn't moved; this device has a pending edit that never finished
        // saving (e.g. it was offline). Finish saving it now, immediately.
        saveLocalLists(uid, local)
        queueSave(local, true)
        return
      }

      // Either this device has never completed a sync (base === null) so there's no way
      // to tell whether its cached copy was ever pushed, or both sides changed since the
      // last known sync — can't safely pick a winner automatically.
      pausedRef.current = true
      saveLocalLists(uid, local)
      setStatus("paused")
      setStatusMessage(null)
      setDialog({ trigger, diff: diffLists(local, server), serverLists: server, isConflict: true })
    },
    [adopt, applyLists, pushNow, queueSave],
  )

  useEffect(() => {
    if (!userId) {
      // Signed out: don't leave a previous account's data sitting in memory.
      clearTimer()
      pausedRef.current = false
      baseRef.current = null
      applyLists(defaultLists)
      setDialog(null)
      setStatus("loading")
      return
    }
    setStatus("loading")
    void reconcile(userId, "auto-conflict")
    // Deliberately just [userId] — reconcile/pushNow/queueSave are stable via useCallback
    // and re-running this on every lists change would refetch the server on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const refresh = useCallback(async () => {
    if (!userId) return
    setStatus("loading")
    // Ends in one of: the server's copy adopted, this device's pending work pushed, or
    // the comparison dialog — never a silent no-op, never a silent overwrite.
    await reconcile(userId, "manual-refresh")
  }, [userId, reconcile])

  const openSaveDialog = useCallback(async () => {
    if (!userId) return
    const before = status
    setStatus("loading")
    const res = await fetchServerLists()
    const server = res.ok ? res.lists : null
    setStatus(res.ok ? before : "error")
    if (!res.ok) {
      setStatusMessage("Couldn't reach Supabase to compare — check your connection")
      return
    }
    const serverWithTodo = server ? withTodoGuaranteed(server) : server
    setDialog({
      trigger: "manual-save",
      diff: diffLists(listsRef.current, serverWithTodo),
      serverLists: serverWithTodo,
      isConflict: canonical(serverWithTodo ?? []) !== baseRef.current,
    })
  }, [userId, status])

  const confirmSave = useCallback(async () => {
    if (!userId) return
    clearTimer()
    pausedRef.current = false
    setDialog(null)
    await pushNow(listsRef.current)
  }, [userId, pushNow])

  const useServerVersion = useCallback(() => {
    if (!userId || !dialog) return
    clearTimer()
    pausedRef.current = false
    adopt(userId, dialog.serverLists ?? defaultLists)
    setStatus("saved")
    setDialog(null)
  }, [userId, dialog, adopt])

  const closeDialog = useCallback(() => setDialog(null), [])

  useEffect(() => () => clearTimer(), [])

  return { lists, setLists, status, statusMessage, dialog, refresh, openSaveDialog, confirmSave, useServerVersion, closeDialog }
}
