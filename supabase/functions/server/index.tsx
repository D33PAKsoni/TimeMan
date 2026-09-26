import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { sendEmptyPush, type PushSubscription } from "./vapid.ts";

const PREFIX = "/make-server-3fde14d4";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint (no auth)
app.get(`${PREFIX}/health`, (c) => {
  return c.json({ status: "ok" });
});

// ── Auth ─────────────────────────────────────────────────────────────────────
// Every other route needs a real signed-in user's Supabase JWT. The public anon key is
// also a valid JWT at the gateway, so we verify the user ourselves.
const api = new Hono<{ Variables: { userId: string } }>();

api.use("*", async (c, next) => {
  const jwt = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return c.json({ error: "unauthorized" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", data.user.id);
  await next();
});

// ── Lists ────────────────────────────────────────────────────────────────────
api.get("/lists", async (c) => {
  const lists = (await kv.get(`lists:${c.get("userId")}`)) ?? null;
  return c.json({ lists });
});

api.put("/lists", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.lists)) return c.json({ error: "lists must be an array" }, 400);
  if (JSON.stringify(body.lists).length > 1_000_000) return c.json({ error: "payload too large" }, 413);
  await kv.set(`lists:${c.get("userId")}`, body.lists);
  return c.json({ ok: true });
});

// ── Watched videos ───────────────────────────────────────────────────────────
api.get("/watched", async (c) => {
  const watched = (await kv.get(`watched:${c.get("userId")}`)) ?? [];
  return c.json({ watched });
});

api.post("/watched", async (c) => {
  const body = await c.req.json().catch(() => null);
  const videoId = body?.videoId;
  if (typeof videoId !== "string" || !/^[\w-]{6,20}$/.test(videoId)) {
    return c.json({ error: "invalid videoId" }, 400);
  }
  const key = `watched:${c.get("userId")}`;
  const current: string[] = (await kv.get(key)) ?? [];
  if (!current.includes(videoId)) await kv.set(key, [...current, videoId].slice(-5000));
  return c.json({ ok: true });
});

// ── Google token renewal ─────────────────────────────────────────────────────
// Supabase hands the app Google's access token (~1h lifetime) and refresh token only at
// sign-in, and never renews the access token afterwards. The browser can't do the
// refresh itself (it needs the OAuth client secret), so:
//   1. right after sign-in the app PUTs the refresh token here;
//   2. whenever its cached access token has expired it GETs a fresh one.
// Tokens live in the kv table under a service-role-only key (RLS is on, no policies).
// Required function secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — the same OAuth
// client that's configured under Supabase → Authentication → Providers → Google.
const rtKey = (userId: string) => `google_rt:${userId}`;

api.put("/google/refresh-token", async (c) => {
  const body = await c.req.json().catch(() => null);
  const refreshToken = body?.refreshToken;
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 2048) {
    return c.json({ error: "invalid refreshToken" }, 400);
  }
  await kv.set(rtKey(c.get("userId")), { refreshToken, savedAt: new Date().toISOString() });
  return c.json({ ok: true });
});

api.delete("/google/refresh-token", async (c) => {
  await kv.del(rtKey(c.get("userId")));
  return c.json({ ok: true });
});

api.get("/google/access-token", async (c) => {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.log("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on this function");
    return c.json({ error: "server_not_configured" }, 500);
  }

  const userId = c.get("userId");
  const stored = await kv.get(rtKey(userId));
  if (!stored?.refreshToken) return c.json({ error: "reauth_required" }, 401);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // invalid_grant = the user revoked access, or the grant expired (e.g. the Google
    // OAuth consent screen is still in "Testing", which expires refresh tokens after 7
    // days). The stored token is dead — drop it and make the app ask for consent again.
    if (data.error === "invalid_grant") {
      await kv.del(rtKey(userId));
      return c.json({ error: "reauth_required" }, 401);
    }
    console.log("Google token endpoint error:", res.status, data.error, data.error_description);
    return c.json({ error: "google_error" }, 502);
  }

  return c.json({ access_token: data.access_token, expires_in: data.expires_in });
});

// ── Push subscriptions (daily reminder) ──────────────────────────────────────
// Stores each user's Web Push subscription so /cron/send-daily (below) can
// reach them. The userId lives inside the stored value too, since kv.getByPrefix
// only returns values, not keys — the cron job needs it to remove dead subscriptions.
const pushKey = (userId: string) => `push_sub:${userId}`;
const MAX_ENDPOINT_LEN = 2048;
const MAX_KEY_LEN = 256;

function isValidSubscription(s: any): s is PushSubscription {
  return (
    s &&
    typeof s.endpoint === "string" &&
    s.endpoint.length > 0 &&
    s.endpoint.length <= MAX_ENDPOINT_LEN &&
    /^https:\/\//.test(s.endpoint) &&
    s.keys &&
    typeof s.keys.p256dh === "string" &&
    s.keys.p256dh.length > 0 &&
    s.keys.p256dh.length <= MAX_KEY_LEN &&
    typeof s.keys.auth === "string" &&
    s.keys.auth.length > 0 &&
    s.keys.auth.length <= MAX_KEY_LEN
  );
}

api.put("/push-subscription", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isValidSubscription(body?.subscription)) return c.json({ error: "invalid subscription" }, 400);
  const userId = c.get("userId");
  await kv.set(pushKey(userId), { userId, subscription: body.subscription });
  return c.json({ ok: true });
});

api.delete("/push-subscription", async (c) => {
  await kv.del(pushKey(c.get("userId")));
  return c.json({ ok: true });
});

// ── Daily reminder cron ───────────────────────────────────────────────────────
// Registered on `app` directly, and BEFORE app.route(PREFIX, api) below — same
// reason /health is registered before it too: app.route(PREFIX, api) claims the
// entire "/make-server-3fde14d4/*" namespace via api's own catch-all auth
// middleware (api.use("*", ...)), which 401s any request under that prefix with
// no user JWT before Hono ever looks for a more specific route. A route added
// on `app` AFTER that mount would never be reached; adding it before means Hono
// matches this exact path first. This route isn't per-user, so it has no
// Supabase user JWT to check anyway — it's protected instead by a shared secret
// header, set once by whoever configures the schedule (see SUPABASE_SETUP.md).
// Sends every stored subscription an EMPTY push (see vapid.ts for why); the
// service worker's own `push` handler supplies the actual notification text.
app.post(`${PREFIX}/cron/send-daily`, async (c) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) return c.json({ error: "server_not_configured" }, 500);
  if (c.req.header("X-Cron-Secret") !== cronSecret) return c.json({ error: "unauthorized" }, 401);

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateJwkRaw = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateJwkRaw) return c.json({ error: "server_not_configured" }, 500);
  let privateJwk: JsonWebKey;
  try {
    privateJwk = JSON.parse(privateJwkRaw);
  } catch {
    return c.json({ error: "server_not_configured" }, 500);
  }
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

  const rows: { userId: string; subscription: PushSubscription }[] = await kv.getByPrefix("push_sub:");
  let sent = 0, removed = 0, failed = 0;
  for (const row of rows) {
    try {
      const res = await sendEmptyPush(row.subscription, { privateJwk, publicKey, subject });
      if (res.status === 404 || res.status === 410) {
        // Subscription is gone (browser data cleared, permission revoked, etc.) — forget it.
        await kv.del(pushKey(row.userId));
        removed++;
      } else if (res.ok) {
        sent++;
      } else {
        failed++;
        console.log("push send failed", row.userId, res.status);
      }
    } catch (e) {
      failed++;
      console.log("push send error", row.userId, e instanceof Error ? e.message : e);
    }
  }
  return c.json({ total: rows.length, sent, removed, failed });
});

app.route(PREFIX, api);

app.onError((err, c) => {
  console.log("Unhandled error:", err);
  return c.json({ error: "internal_error" }, 500);
});

Deno.serve(app.fetch);
