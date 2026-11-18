/**
 * Zero-knowledge encrypted sync. The backup JSON is encrypted ON THE DEVICE
 * with a key derived from the person's passphrase (PBKDF2-SHA256 → AES-GCM
 * 256). The server only ever stores the resulting ciphertext under a random
 * vault id: it cannot read, index, or attribute anything. Lose the passphrase
 * and the data is unrecoverable — by design.
 */
import { b64ToBuf, bufToB64 } from "../db/backup";

export const KDF_ITERATIONS = 250_000;

export interface Sealed {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is not available (needs HTTPS or localhost).");
  return s;
}

async function deriveKey(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function seal(plain: string, pass: string, iter = KDF_ITERATIONS): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iter);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return { v: 1, kdf: "PBKDF2-SHA256", iter, salt: bufToB64(salt.buffer), iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
}

export async function open(s: Sealed, pass: string): Promise<string> {
  if (s.v !== 1) throw new Error("Unknown vault format.");
  const key = await deriveKey(pass, new Uint8Array(b64ToBuf(s.salt)), s.iter);
  try {
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: new Uint8Array(b64ToBuf(s.iv)) }, key, b64ToBuf(s.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("wrong-passphrase");
  }
}

/** 256-bit random vault id, hex. Not derived from anything about the person. */
export function newVaultId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isVaultId(v: string): boolean {
  return /^[0-9a-f]{64}$/.test(v);
}

function endpoint(server: string, id: string): string {
  return `${server.replace(/\/+$/, "")}/vault/${id}`;
}

export async function pushVault(server: string, id: string, sealed: Sealed): Promise<void> {
  const res = await fetch(endpoint(server, id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sealed),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function pullVault(server: string, id: string): Promise<Sealed> {
  const res = await fetch(endpoint(server, id), { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
  if (res.status === 404) throw new Error("not-found");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Sealed;
}
