// Minimal VAPID (RFC 8292) signer + empty-payload Web Push sender, built only
// on the standard Web Crypto API (crypto.subtle) — no npm:web-push.
//
// Why not npm:web-push: its AES128GCM payload-encryption path calls into
// node:crypto's Cipheriv under Deno's Node compat layer, which throws
// `BadResource` at Cipheriv.final() on Deno — a long-standing, still-open
// incompatibility (see github.com/denoland/deno/issues/19002; multiple users
// hit the identical crash across Deno versions). We sidestep it by sending
// *empty-body* pushes: with no payload there is nothing to encrypt, so the
// broken code path is never exercised — only the VAPID JWT (ES256) is needed,
// which crypto.subtle handles natively and correctly (WebCrypto's ECDSA
// signatures are raw r||s, which is exactly the format a JWS ES256 signature
// requires — no re-encoding from DER needed, unlike node:crypto's legacy sign()).
// The trade-off: the push carries no title/body of its own. The service
// worker shows a fixed "your daily video is ready" notification instead of
// echoing back today's actual pick.

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
async function importPrivateKey(jwk: JsonWebKey) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
}

async function signVapidJwt(audience: string, subject: string, privateJwk: JsonWebKey) {
  const header = { typ: "JWT", alg: "ES256" }
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }
  const signingInput = `${b64url(new TextEncoder().encode(JSON.stringify(header)))}.${b64url(new TextEncoder().encode(JSON.stringify(payload)))}`
  const key = await importPrivateKey(privateJwk)
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${b64url(sig)}`
}

export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } }

// Sends an empty-body push. Throws on network failure; returns the raw Response
// otherwise so the caller can tell a dead subscription (404/410) from a retryable
// failure (anything else).
export async function sendEmptyPush(
  subscription: PushSubscription,
  opts: { privateJwk: JsonWebKey; publicKey: string; subject: string },
): Promise<Response> {
  const audience = new URL(subscription.endpoint).origin
  const jwt = await signVapidJwt(audience, opts.subject, opts.privateJwk)
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: { Authorization: `vapid t=${jwt}, k=${opts.publicKey}`, TTL: "60", "Content-Length": "0" },
  })
}
