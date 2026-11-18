/**
 * Arbora encrypted-vault server. Zero dependencies, zero knowledge.
 *
 *   PUT /vault/:id   store an opaque, client-encrypted JSON blob
 *   GET /vault/:id   return it
 *
 * It never sees plaintext (the app encrypts before upload), keeps no logs,
 * stores no IPs, sets no cookies, and has no accounts. `id` is a random
 * 256-bit hex string generated on the device.
 *
 *   PORT=8787 DATA_DIR=./server/data node server/server.mjs
 */
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "server", "data");
const MAX_BYTES = Number(process.env.MAX_BYTES || 60 * 1024 * 1024);
const ID_RE = /^\/vault\/([0-9a-f]{64})$/;

await mkdir(DATA_DIR, { recursive: true });

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function looksSealed(o) {
  return o && o.v === 1 && typeof o.salt === "string" && typeof o.iv === "string" && typeof o.ct === "string";
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const m = ID_RE.exec(req.url || "");
  if (!m) return send(res, 404, '{"error":"not found"}');
  const file = join(DATA_DIR, `${m[1]}.json`);

  if (req.method === "GET") {
    try {
      return send(res, 200, await readFile(file));
    } catch {
      return send(res, 404, '{"error":"not found"}');
    }
  }

  if (req.method === "PUT") {
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
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(parsed));
    await rename(tmp, file);
    return send(res, 204, "");
  }

  return send(res, 405, '{"error":"method"}');
});

server.listen(PORT, () => {
  console.log(`arbora vault server on :${PORT}`);
});
