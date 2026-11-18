/**
 * Arbora encrypted-vault server — Cloudflare Workers + R2 edition.
 * Same API and rules as ../server.mjs, so the app doesn't care which runs:
 *
 *   GET    /vault/:id   return the encrypted file (+ ETag)
 *   PUT    /vault/:id   store it; If-Match / If-None-Match: * → 412 on mismatch
 *   DELETE /vault/:id   erase it for good
 *
 * Every request needs `Authorization: Bearer <token>`. The token is derived on
 * the device from username + password; we keep only its SHA-256 (in the R2
 * object's metadata, set by the first upload). Only ciphertext is accepted.
 * No logs (observability is off in wrangler.toml), no IPs stored, no cookies,
 * no accounts or emails — so no password reset either.
 */

const ID_RE = /^\/vault\/([0-9a-f]{64})$/;
const TOKEN_RE = /^Bearer ([0-9a-f]{64})$/;
const MAX_BYTES = 60 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match, If-None-Match",
  "Access-Control-Expose-Headers": "ETag",
  "Access-Control-Max-Age": "86400",
};

function send(status, body = "", extra = {}) {
  return new Response(status === 204 ? null : body, {
    status,
    headers: {
      ...CORS,
      ...extra,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const err = (status, msg) => send(status, JSON.stringify({ error: msg }));

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHex(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  const enc = new TextEncoder();
  return crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));
}

/* Cheap ciphertext check without JSON.parse-ing megabytes (free-plan CPU is
 * tight): the app always sends {"v":2,"iv":"…","ct":"…"} (or legacy v1). */
function looksSealed(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 24));
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 2)));
  if (tail !== '"}') return false;
  return head.startsWith('{"v":2,"iv":"') || head.startsWith('{"v":1,"kdf":"PBKDF2-SHA256"');
}

/* Cloudflare's edge weakens ETags on compressed responses (W/"…"), so the
 * app may echo either form back — compare the bare tag. */
const bareTag = (t) => (t || "").replace(/^W\//, "").replace(/"/g, "");

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const m = ID_RE.exec(new URL(req.url).pathname);
    if (!m) return err(404, "not found");
    const key = `vault/${m[1]}`;

    const t = TOKEN_RE.exec(req.headers.get("Authorization") || "");
    if (!t) return err(401, "token required");
    const given = await sha256hex(t[1]);

    const head = await env.VAULTS.head(key);
    /* Unknown id reads as 404, so a wrong password looks like "no such account". */
    if (head && !sameHex(head.customMetadata?.auth, given)) return err(403, "forbidden");

    if (req.method === "GET") {
      if (!head) return err(404, "not found");
      const obj = await env.VAULTS.get(key);
      if (!obj) return err(404, "not found");
      return send(200, obj.body, { ETag: obj.httpEtag });
    }

    if (req.method === "DELETE") {
      if (!head) return err(404, "not found");
      await env.VAULTS.delete(key);
      return send(204);
    }

    if (req.method === "PUT") {
      const len = Number(req.headers.get("Content-Length") || 0);
      if (len > MAX_BYTES) return err(413, "too large");
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > MAX_BYTES) return err(413, "too large");
      if (!looksSealed(bytes)) return err(400, "expected encrypted vault");

      const ifMatch = req.headers.get("If-Match");
      if (req.headers.get("If-None-Match") === "*" && head) return err(412, "exists");
      if (ifMatch && (!head || head.etag !== bareTag(ifMatch))) return err(412, "changed");

      const opts = { customMetadata: { auth: given }, httpMetadata: { contentType: "application/json" } };
      /* Atomic compare-and-swap: R2 refuses the write if someone else got in first. */
      if (ifMatch) opts.onlyIf = { etagMatches: head.etag };
      const put = await env.VAULTS.put(key, bytes, opts);
      if (!put) return err(412, "changed");
      return send(204, "", { ETag: put.httpEtag });
    }

    return err(405, "method");
  },
};
