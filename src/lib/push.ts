import { supabase, SERVER_URL } from "./supabase"

// Public VAPID key for this deployment. Not a secret — it's meant to travel to
// every browser (it's the "applicationServerKey" a push subscription is created
// with). Its matching private key lives only as a Supabase function secret; see
// SUPABASE_SETUP.md for how the pair was generated and where each half goes.
export const VAPID_PUBLIC_KEY = "BEIgARa7eW8oEV0JiD0TP6TGvULJAhvi29Tzeg7YSHe4u_HgARQJkXSJtONQzLW_i9GvE-fFwjRDMJfmFpY2wnY"

export type PushStatus = "unsupported" | "denied" | "off" | "on"

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

// Cheap, synchronous-ish status for rendering the toggle. Doesn't distinguish
// "off" from "granted permission but no active subscription yet" — subscribe()
// handles that path itself.
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  if (Notification.permission !== "granted") return "off"
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? "on" : "off"
  } catch {
    return "off"
  }
}

function urlBase64ToUint8Array(base64url: string) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Must be called from a direct user gesture (a click handler) — browsers silently
// ignore Notification.requestPermission() calls made from anywhere else, which is
// why the app previously never actually showed the permission prompt.
export async function subscribeToPush(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported"
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "denied" : "off"

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))

  const { data } = await supabase.auth.getSession()
  if (!data.session) return "off" // caller should be signed in already; nothing to attach it to otherwise
  const res = await fetch(`${SERVER_URL}/push-subscription`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
  if (!res.ok) {
    // Don't leave a subscription the server doesn't know about lying around.
    await sub.unsubscribe().catch(() => {})
    throw new Error("Couldn't save the reminder subscription")
  }
  return "on"
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe().catch(() => {})
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  await fetch(`${SERVER_URL}/push-subscription`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  }).catch(() => {})
}
