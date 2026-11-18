/**
 * Account sync engine. A signed-in device keeps a Session (derived keys,
 * never the password) in the device-only setting `sync.session`, and syncs:
 * on start, a few seconds after local changes, when the app is hidden, when
 * the network comes back, and every few minutes while visible.
 *
 * One sync = pull → merge (newer row wins, nothing is dropped) → push with
 * If-Match. If another device pushed in between (412), pull/merge again.
 */
import { TABLES, exportBackup, mergeBackup } from "../db/backup";
import { getSetting, putSetting, type ArboraDB } from "../db/schema";
import { accountFrom, deleteVault, deriveAccount, openWith, pullVault, pushVault, sealWith, type Session } from "./vault";

/** Set at build time (VITE_SYNC_SERVER) so people never have to type a URL. */
export const DEFAULT_SYNC_SERVER = ((import.meta.env.VITE_SYNC_SERVER as string | undefined) ?? "").trim();

const SESSION = "sync.session";
const SERVER = "sync.server";
const LAST = "sync.lastAt";

export type SyncState = { phase: "off" | "idle" | "syncing" | "error"; lastAt: string | null; error: string | null; username: string | null };

let state: SyncState = { phase: "off", lastAt: null, error: null, username: null };
const listeners = new Set<() => void>();
function set(p: Partial<SyncState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const syncStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export async function getServer(d: ArboraDB): Promise<string> {
  return ((await getSetting<string>(d, SERVER)) || DEFAULT_SYNC_SERVER).trim();
}
export async function getSession(d: ArboraDB): Promise<Session | undefined> {
  return getSetting<Session>(d, SESSION);
}

let running: Promise<void> | null = null;
let again = false;
let applying = false;

async function syncOnce(d: ArboraDB, server: string, session: Session): Promise<void> {
  const acc = await accountFrom(session);
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await pullVault(server, acc);
    applying = true;
    try {
      if (remote) await mergeBackup(d, JSON.parse(await openWith(remote.sealed, acc.encKey)));
      const sealed = await sealWith(JSON.stringify(await exportBackup(d)), acc.encKey);
      try {
        await pushVault(server, acc, sealed, remote ? remote.etag ?? undefined : null);
      } catch (e) {
        if (e instanceof Error && e.message === "conflict") continue;
        throw e;
      }
      const at = new Date().toISOString();
      await putSetting(d, LAST, at);
      set({ lastAt: at });
      return;
    } finally {
      applying = false;
    }
  }
  throw new Error("conflict");
}

/** Run a sync now (coalesces with one already running). */
export function syncNow(d: ArboraDB): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const session = await getSession(d);
        const server = await getServer(d);
        if (!session || !server) {
          set({ phase: "off", username: null });
          return;
        }
        set({ phase: "syncing", username: session.username, error: null });
        await syncOnce(d, server, session);
        set({ phase: "idle" });
      } while (again);
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Sign in or create an account. Both derive the same keys; "login" fails if
 * no vault exists yet, "create" fails if one does (so two people who picked
 * the same username + password never get merged) and otherwise uploads this
 * device's data as the first copy. Throws "not-found" | "exists" |
 * "unauthorized" | network errors.
 */
export async function connect(d: ArboraDB, server: string, username: string, password: string, mode: "login" | "create"): Promise<void> {
  const session = await deriveAccount(username, password);
  const exists = (await pullVault(server, await accountFrom(session))) !== null;
  if (mode === "login" && !exists) throw new Error("not-found");
  if (mode === "create" && exists) throw new Error("exists");
  if (server !== DEFAULT_SYNC_SERVER) await putSetting(d, SERVER, server);
  await syncOnce(d, server, session);
  await putSetting(d, SESSION, session);
  set({ phase: "idle", username: session.username, error: null });
}

/** Forget the account on this device. Local data stays. */
export async function signOut(d: ArboraDB): Promise<void> {
  await d.settings.bulkDelete([SESSION, LAST]);
  set({ phase: "off", username: null, lastAt: null, error: null });
}

/** Permanently erase the vault from the server, then sign out. */
export async function deleteAccount(d: ArboraDB): Promise<void> {
  const session = await getSession(d);
  const server = await getServer(d);
  if (!session || !server) return;
  try {
    await deleteVault(server, await accountFrom(session));
  } catch (e) {
    if (!(e instanceof Error && e.message === "not-found")) throw e;
  }
  await signOut(d);
}

/* ── background triggers ── */

let started = false;
const DEBOUNCE_MS = 4000;
const PERIOD_MS = 5 * 60 * 1000;

export function startAutoSync(d: ArboraDB): void {
  if (started || typeof window === "undefined") return;
  started = true;
  let timer: number | undefined;
  const soon = () => {
    if (applying || state.phase === "off") return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncNow(d), DEBOUNCE_MS);
  };
  for (const t of TABLES) {
    const table = d.table(t);
    const onWrite = function (this: unknown, ...args: unknown[]) {
      /* settings writes by the engine itself (sync.*) must not re-trigger */
      if (t === "settings") {
        /* creating/deleting: (primKey, obj, tx) · updating: (mods, primKey, obj, tx) */
        const key = typeof args[0] === "string" ? args[0] : typeof args[1] === "string" ? args[1] : "";
        if (key.startsWith("sync.") || key === "lastBackupAt") return;
      }
      soon();
    };
    table.hook("creating", onWrite);
    table.hook("updating", onWrite);
    table.hook("deleting", onWrite);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      window.clearTimeout(timer);
      if (state.phase !== "off") void syncNow(d);
    } else if (state.phase !== "off") void syncNow(d);
  });
  window.addEventListener("online", () => void syncNow(d));
  window.setInterval(() => {
    if (document.visibilityState === "visible" && state.phase !== "off") void syncNow(d);
  }, PERIOD_MS);
  void (async () => {
    set({ lastAt: (await getSetting<string>(d, LAST)) ?? null });
    if (await getSession(d)) void syncNow(d);
  })();
}
