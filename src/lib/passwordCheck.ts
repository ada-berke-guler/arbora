/**
 * Refuses easy-to-guess passwords when an account is CREATED (never on sign-in,
 * so existing accounts keep working). Runs entirely on the device.
 *
 * Why it matters here: the vault is found by username + password alone, so a
 * common pair ("ahmet" + "1234567890") could be typed by a stranger too.
 *
 * The list (`commonPasswords.txt`) = the 10+ character entries of public
 * breach-frequency lists (SecLists: NCSC top 100k, xato-net top 100k, Pwdb top
 * 100k, Turkish top 150), lower-cased. It is lazy-loaded, so it only costs
 * bytes when someone opens the "create account" form.
 */
import { normalizeUsername } from "./vault";

export type WeakReason = "common" | "username" | "pattern";

let list: Promise<Set<string>> | null = null;
function commonSet(): Promise<Set<string>> {
  list ??= import("./commonPasswords.txt?raw").then((m) => new Set(m.default.split("\n").map((s) => s.trim()).filter(Boolean)));
  return list;
}

const ROWS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "1q2w3e4r5t6y7u8i9o0p"];

/** "aaaaaaaaaa", "abcabcabca", "1212121212", "1234567890", "qwertyuiop", "0987654321"… */
function isPattern(p: string): boolean {
  if (new Set(p).size <= 2) return true;
  for (let n = 1; n <= 4; n++) {
    const unit = p.slice(0, n);
    if (unit.repeat(Math.ceil(p.length / n)).slice(0, p.length) === p) return true;
  }
  return ROWS.some((r) => {
    const twice = r + r;
    const back = [...twice].reverse().join("");
    return twice.includes(p) || back.includes(p);
  });
}

/** Strips what people tack on to a common word: "galatasaray1905!" → "galatasaray". */
const core = (p: string) => p.replace(/[\d\W_]+$/u, "").replace(/^[\d\W_]+/u, "");

export async function weakPassword(password: string, username: string): Promise<WeakReason | null> {
  const p = password.normalize("NFC").toLocaleLowerCase("en-US");
  const u = normalizeUsername(username);
  if (u.length >= 3 && (p.includes(u) || p.replace(/\s/g, "").includes(u.replace(/\s/g, "")))) return "username";
  const letters = p.replace(/[\W_]/gu, "");
  if (isPattern(p) || (letters.length >= 6 && isPattern(letters))) return "pattern";
  const set = await commonSet();
  const c = core(p);
  if (set.has(p) || set.has(c) || (c.length >= 4 && isPattern(c))) return "common";
  return null;
}
