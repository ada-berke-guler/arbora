/**
 * Arbora encrypted-vault server. Zero dependencies, zero knowledge.
 *
 *   PUT /vault/:id   store an opaque, client-encrypted JSON blob
 *   GET /vault/:id   return it
 *   DELETE /vault/:id  erase it (and its token hash) for good
 *
 * Every response to GET/PUT carries an ETag. A PUT may send `If-Match: <etag>`
 * (only overwrite the version I merged with) or `If-None-Match: *` (create
 * only) — a mismatch answers 412 and the app re-pulls, merges, retries. So two
 * devices syncing at once can't silently erase each other's changes.
 *
 * All requests need `Authorization: Bearer <token>`. The token is derived on the
 * device from username + password; the server keeps only its SHA-256 (set
 * by the first upload) and compares in constant time. Without the token the
 * id alone is useless — nobody can read or overwrite someone else's vault.
 *
 * It never sees plaintext (the app encrypts before upload), keeps no logs,
 * stores no IPs, sets no cookies, has no accounts or emails — and therefore
 * cannot reset a password.
 *
 *   PORT=8787 DATA_DIR=./server/data node server/server.mjs
 */
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "server", "data");
const MAX_BYTES = Number(process.env.MAX_BYTES || 60 * 1024 * 1024);
const ID_RE = /^\/vault\/([0-9a-f]{64})$/;
const TOKEN_RE = /^Bearer ([0-9a-f]{64})$/;

await mkdir(DATA_DIR, { recursive: true });

function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    ...extra,
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function looksSealed(o) {
  if (!o || typeof o.iv !== "string" || typeof o.ct !== "string") return false;
  if (o.v === 2) return true;
  return o.v === 1 && typeof o.salt === "string";
}

const sha256 = (s) => createHash("sha256").update(s).digest();
const etagOf = (buf) => `"${sha256(buf).toString("hex").slice(0, 32)}"`;

async function current(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function readHash(file) {
  try {
    return Buffer.from((await readFile(file, "utf8")).trim(), "hex");
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const m = ID_RE.exec(req.url || "");
  if (!m) return send(res, 404, '{"error":"not found"}');
  const file = join(DATA_DIR, `${m[1]}.json`);
  const authFile = join(DATA_DIR, `${m[1]}.auth`);

  const t = TOKEN_RE.exec(req.headers.authorization || "");
  if (!t) return send(res, 401, '{"error":"token required"}');
  const given = sha256(t[1]);
  const stored = await readHash(authFile);
  /* An unclaimed id answers 404 for reads, so a wrong password looks exactly like "no such account". */
  const authorized = stored ? stored.length === given.length && timingSafeEqual(stored, given) : null;

  if (req.method === "GET") {
    if (authorized === false) return send(res, 403, '{"error":"forbidden"}');
    if (authorized === null) return send(res, 404, '{"error":"not found"}');
    const buf = await current(file);
    if (!buf) return send(res, 404, '{"error":"not found"}');
    return send(res, 200, buf, { ETag: etagOf(buf) });
  }

  if (req.method === "PUT") {
    if (authorized === false) return send(res, 403, '{"error":"forbidden"}');
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BYTES) return send(res, 413, '{"error":"too large"}');
      chunks.push(c);
    }
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(res, 400, '{"error":"bad json"}');
    }
    /* Refuse anything that isn't ciphertext — the server must never become a plaintext store. */
    if (!looksSealed(parsed)) return send(res, 400, '{"error":"expected encrypted vault"}');
    if (authorized === null) await writeFile(authFile, given.toString("hex"), { flag: "wx" }).catch(() => {});
    if (!(await readHash(authFile))?.equals(given)) return send(res, 403, '{"error":"forbidden"}');
    const existing = await current(file);
    const ifMatch = req.headers["if-match"];
    if (req.headers["if-none-match"] === "*" && existing) return send(res, 412, '{"error":"exists"}');
    /* proxies/CDNs may weaken the tag (W/"…") on compressed responses */
    if (ifMatch && (!existing || etagOf(existing) !== ifMatch.replace(/^W\//, ""))) return send(res, 412, '{"error":"changed"}');
    const out = Buffer.from(JSON.stringify(parsed));
    const tmp = `${file}.tmp`;
    await writeFile(tmp, out);
    await rename(tmp, file);
    return send(res, 204, "", { ETag: etagOf(out) });
  }

  if (req.method === "DELETE") {
    if (authorized === false) return send(res, 403, '{"error":"forbidden"}');
    if (authorized === null) return send(res, 404, '{"error":"not found"}');
    await rm(file, { force: true });
    await rm(authFile, { force: true });
    return send(res, 204, "");
  }

  return send(res, 405, '{"error":"method"}');
});

server.listen(PORT, () => {
  console.log(`arbora vault server on :${PORT}`);
});
