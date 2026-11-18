/**
 * Zero-knowledge encrypted sync ("account" without an account).
 *
 * The person types a username + password. ON THE DEVICE we stretch them with
 * PBKDF2-SHA256 and split the result (HKDF) into three independent values:
 *
 *   vaultId   — where the file lives on the server (looks random to it)
 *   authToken — proves the right to read/overwrite that vault; the server
 *               only keeps its SHA-256, so it can't replay it
 *   encKey    — AES-256-GCM key; never leaves the device
 *
 * The server only ever sees: an id, a token hash and ciphertext. It cannot
 * read, index or attribute anything — and it cannot reset a password. Lose
 * the password and the data is unrecoverable, by design.
 */
import { b64ToBuf, bufToB64 } from "../db/backup";

export const ACCOUNT_ITERATIONS = 600_000;
export const MIN_PASSWORD = 10;

/** v1 = legacy passphrase-sealed file (kept readable); v2 = account key. */
export interface SealedV1 {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}
export interface SealedV2 {
  v: 2;
  iv: string;
  ct: string;
}
export type Sealed = SealedV1 | SealedV2;

export interface Account {
  vaultId: string;
  authToken: string;
  encKey: CryptoKey;
}

/** What a signed-in device keeps (device-only setting, never exported). The
 * password itself is never stored. */
export interface Session {
  username: string;
  vaultId: string;
  authToken: string;
  encKeyHex: string;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is not available (needs HTTPS or localhost).");
  return s;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Case/space-insensitive so "Ada " and "ada" open the same account. */
export function normalizeUsername(u: string): string {
  return u.normalize("NFC").trim().toLocaleLowerCase("en-US");
}

export function isValidUsername(u: string): boolean {
  return normalizeUsername(u).length >= 3;
}

export async function deriveAccount(username: string, password: string, iter = ACCOUNT_ITERATIONS): Promise<Session> {
  const user = normalizeUsername(username);
  const pw = await subtle().importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const master = await subtle().deriveBits(
    { name: "PBKDF2", salt: enc.encode(`arbora/account/v1/${user}`), iterations: iter, hash: "SHA-256" },
    pw,
    256
  );
  const ikm = await subtle().importKey("raw", master, "HKDF", false, ["deriveBits", "deriveKey"]);
  const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(info) });
  const [id, token, key] = await Promise.all([
    subtle().deriveBits(hkdf("arbora/vault-id"), ikm, 256),
    subtle().deriveBits(hkdf("arbora/auth"), ikm, 256),
    subtle().deriveBits(hkdf("arbora/enc"), ikm, 256),
  ]);
  return { username: user, vaultId: hex(id), authToken: hex(token), encKeyHex: hex(key) };
}

export async function accountFrom(s: Session): Promise<Account> {
  const raw = new Uint8Array(s.encKeyHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const encKey = await subtle().importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { vaultId: s.vaultId, authToken: s.authToken, encKey };
}

export async function sealWith(plain: string, key: CryptoKey): Promise<SealedV2> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return { v: 2, iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
}

export async function openWith(s: Sealed, key: CryptoKey): Promise<string> {
  if (s.v !== 2) throw new Error("Unknown vault format.");
  try {
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: new Uint8Array(b64ToBuf(s.iv)) }, key, b64ToBuf(s.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("wrong-passphrase");
  }
}

/* ── legacy v1 (passphrase per file) — read/write kept for old vault files ── */

async function legacyKey(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function seal(plain: string, pass: string, iter = 250_000): Promise<SealedV1> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await legacyKey(pass, salt, iter);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return { v: 1, kdf: "PBKDF2-SHA256", iter, salt: bufToB64(salt.buffer), iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
}

export async function open(s: Sealed, pass: string): Promise<string> {
  if (s.v !== 1) throw new Error("Unknown vault format.");
  const key = await legacyKey(pass, new Uint8Array(b64ToBuf(s.salt)), s.iter);
  try {
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: new Uint8Array(b64ToBuf(s.iv)) }, key, b64ToBuf(s.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("wrong-passphrase");
  }
}

export function isVaultId(v: string): boolean {
  return /^[0-9a-f]{64}$/.test(v);
}

/* ── transport ── */

function endpoint(server: string, id: string): string {
  return `${server.replace(/\/+$/, "")}/vault/${id}`;
}

/** `etag`: string = overwrite only that version; null = create only. 412 → "conflict". */
export async function pushVault(server: string, acc: Account, sealed: Sealed, etag?: string | null): Promise<string | null> {
  const cond: Record<string, string> = etag === null ? { "If-None-Match": "*" } : etag ? { "If-Match": etag } : {};
  const res = await fetch(endpoint(server, acc.vaultId), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${acc.authToken}`, ...cond },
    body: JSON.stringify(sealed),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (res.status === 412) throw new Error("conflict");
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.headers.get("ETag");
}

/** null when the vault doesn't exist (yet). */
export async function pullVault(server: string, acc: Account): Promise<{ sealed: Sealed; etag: string | null } | null> {
  const res = await fetch(endpoint(server, acc.vaultId), {
    headers: { Authorization: `Bearer ${acc.authToken}` },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { sealed: (await res.json()) as Sealed, etag: res.headers.get("ETag") };
}

export async function deleteVault(server: string, acc: Account): Promise<void> {
  const res = await fetch(endpoint(server, acc.vaultId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${acc.authToken}` },
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (res.status === 404) throw new Error("not-found");
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
