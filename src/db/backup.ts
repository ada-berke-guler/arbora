import { newRow, nowIso, putSetting, type ArboraDB } from "./schema";
import type { BaseRow, BlobRow, BoardItem, RingTask, Setting } from "./types";

export const BACKUP_APP = "arbora";
export const BACKUP_VERSION = 2;

/** Every table. A new table MUST be added here or backups silently lose it. */
export const TABLES = [
  "cycles",
  "habits",
  "habitLogs",
  "moments",
  "journalEntries",
  "sleepEntries",
  "moodEntries",
  "identity",
  "ringTasks",
  "ringTemplates",
  "boards",
  "boardItems",
  "blobs",
  "customThemes",
  "settings",
] as const;

export type TableName = (typeof TABLES)[number];

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

type SerializedBlob = Omit<BlobRow, "data"> & { data: string };

/**
 * Settings that describe THIS device, not the person's data — never exported,
 * never overwritten by an import or a sync (the sync session lives here).
 */
export function isDeviceOnlySetting(key: string): boolean {
  return key.startsWith("sync.");
}

export async function exportBackup(d: ArboraDB): Promise<BackupFile> {
  await putSetting(d, "lastBackupAt", nowIso()); // stamped first so it's inside the snapshot
  const data = {} as BackupFile["data"];
  for (const t of TABLES) {
    const rows = await d.table(t).toArray();
    if (t === "blobs") data[t] = (rows as BlobRow[]).map((r) => ({ ...r, data: bufToB64(r.data) }));
    else if (t === "settings") data[t] = rows.filter((r: { key: string }) => !isDeviceOnlySetting(r.key));
    else data[t] = rows;
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: nowIso(), data };
}

export interface BackupSummary {
  exportedAt: string | null;
  legacy: boolean;
  counts: Partial<Record<TableName, number>>;
}

/** What a file contains, for the "this will replace…" confirmation. Throws on invalid input. */
export function summarizeBackup(raw: unknown): BackupSummary {
  const b = normalizeBackup(raw);
  const counts: BackupSummary["counts"] = {};
  for (const t of TABLES) {
    counts[t] = (b.data[t] as { deletedAt?: string | null }[]).filter((r) => !r.deletedAt).length;
  }
  return { exportedAt: b.exportedAt ?? null, legacy: (raw as { app?: string }).app !== BACKUP_APP, counts };
}

/**
 * Restore a snapshot: replaces ALL data, in one transaction, so an invalid
 * file can never leave a half-wiped database. Accepts v2 files and Arbora
 * v1 ("life-tracker") files.
 */
export async function importBackup(d: ArboraDB, raw: unknown): Promise<void> {
  const backup = normalizeBackup(raw);
  const tables = TABLES.map((t) => d.table(t));
  await d.transaction("rw", tables, async () => {
    for (const t of TABLES) {
      let rows = backup.data[t];
      if (t === "settings") {
        const drop = (await d.settings.toCollection().primaryKeys()).filter((k) => !isDeviceOnlySetting(k));
        await d.settings.bulkDelete(drop);
        rows = (rows as Setting[]).filter((r) => !isDeviceOnlySetting(r.key));
      } else {
        await d.table(t).clear();
      }
      if (t === "blobs") rows = (rows as SerializedBlob[]).map((r) => ({ ...r, data: b64ToBuf(r.data) }));
      if (rows.length > 0) await d.table(t).bulkPut(rows);
    }
  });
}

/* Rows whose natural key is unique across ids: two devices can each create
 * "the mood for 2026-11-18" with different ids. The newer one wins. */
const NATURAL_KEYS: Partial<Record<TableName, { index: string; of: (r: Record<string, unknown>) => unknown }>> = {
  moodEntries: { index: "date", of: (r) => r.date },
  habitLogs: { index: "[habitId+date]", of: (r) => [r.habitId, r.date] },
};

/**
 * Sync merge: union of both sides, per row the newer `updatedAt` wins (soft
 * deletes travel as rows with `deletedAt`). Never removes anything the
 * other side doesn't know about. Returns how many local rows changed.
 */
export async function mergeBackup(d: ArboraDB, raw: unknown): Promise<number> {
  const backup = normalizeBackup(raw);
  const tables = TABLES.map((t) => d.table(t));
  let changed = 0;
  await d.transaction("rw", tables, async () => {
    for (const t of TABLES) {
      const table = d.table(t);
      for (const incoming of backup.data[t] as Record<string, unknown>[]) {
        let r = incoming;
        if (t === "settings") {
          const key = r.key as string;
          if (isDeviceOnlySetting(key)) continue;
          const local = (await table.get(key)) as Setting | undefined;
          if (local && (local.updatedAt ?? "") >= ((r.updatedAt as string) ?? "")) continue;
        } else {
          const local = (await table.get(r.id as string)) as BaseRow | undefined;
          if (local && local.updatedAt >= (r.updatedAt as string)) continue;
          const nk = NATURAL_KEYS[t];
          if (nk) {
            const clash = (await table.where(nk.index).equals(nk.of(r) as never).first()) as BaseRow | undefined;
            if (clash && clash.id !== r.id) {
              if (clash.updatedAt >= (r.updatedAt as string)) continue;
              await table.delete(clash.id);
            }
          }
          if (t === "blobs") r = { ...r, data: b64ToBuf(r.data as string) };
        }
        await table.put(r);
        changed++;
      }
    }
  });
  return changed;
}

export function normalizeBackup(raw: unknown): BackupFile {
  if (typeof raw !== "object" || raw === null) throw new BackupError("notObject");
  const b = raw as { app?: unknown; version?: unknown; data?: unknown; exportedAt?: string };
  if (b.app === "life-tracker" && b.version === 1) return migrateV1(b as LegacyFile);
  if (b.app !== BACKUP_APP) throw new BackupError("signature");
  if (b.version !== BACKUP_VERSION) throw new BackupError("version");
  if (typeof b.data !== "object" || b.data === null) throw new BackupError("noData");
  const data = b.data as Record<string, unknown>;
  for (const t of TABLES) {
    if (data[t] === undefined) data[t] = []; // tolerate files from builds with fewer tables
    if (!Array.isArray(data[t])) throw new BackupError("table", t);
  }
  return b as BackupFile;
}

export class BackupError extends Error {
  constructor(public readonly code: "notObject" | "signature" | "version" | "noData" | "table", public readonly detail?: string) {
    super(`backup:${code}${detail ? `:${detail}` : ""}`);
  }
}

/* ── Arbora v1 → v2 ── */

interface LegacyFile {
  app: "life-tracker";
  version: 1;
  exportedAt?: string;
  data: Record<string, unknown[] | undefined>;
}

const LEGACY_RING = ["#C9A96E", "#8FA6C9", "#C98F6E", "#7FB39A", "#B98FC9", "#C96E8F"];
const LEGACY_SETTINGS_KEPT = /^(introSeen|hasCompletedIntroBefore|lastBackupAt|habitsOnboardingDone:|recapSeen:)/;

function migrateV1(f: LegacyFile): BackupFile {
  const src = f.data ?? {};
  const arr = (k: string) => {
    const v = src[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new BackupError("table", k);
    return v as Record<string, unknown>[];
  };

  /* v1 had ONE free canvas sized to the screen: becomes a 1920×1080 board. */
  const legacyItems = arr("boardItems");
  const boards: unknown[] = [];
  let boardItems: BoardItem[] = [];
  if (legacyItems.length > 0) {
    const board = { ...newRow(), name: "Vision Board", width: 1920, height: 1080, background: "#1C1B18", sortOrder: 0 };
    boards.push(board);
    boardItems = legacyItems.map((it) => ({ ...(it as unknown as BoardItem), boardId: board.id, color: "#F3E3A8" }));
  }

  /* v1 ring tasks: hh/mm/endHh/endMm/colorIndex → start/end/color */
  const ringTasks: RingTask[] = arr("dayRingTasks").map((r) => {
    const o = r as { hh: number; mm: number; endHh: number | null; endMm: number | null; colorIndex: number };
    const start = o.hh * 60 + o.mm;
    let end: number | null = null;
    if (o.endHh != null && o.endMm != null) {
      end = o.endHh * 60 + o.endMm;
      if (end <= start) end += 1440;
    }
    const { hh: _h, mm: _m, endHh: _eh, endMm: _em, colorIndex: _c, ...rest } = r as Record<string, unknown>;
    return {
      ...(rest as unknown as RingTask),
      start,
      end,
      color: LEGACY_RING[(o.colorIndex ?? 0) % LEGACY_RING.length],
      textColor: null,
    };
  });

  const settings = arr("settings").filter((s) => LEGACY_SETTINGS_KEPT.test(String((s as { key: string }).key)));

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: f.exportedAt ?? nowIso(),
    data: {
      cycles: arr("cycles"),
      habits: arr("habits"),
      habitLogs: arr("habitLogs"),
      moments: arr("moments"),
      journalEntries: arr("journalEntries"),
      sleepEntries: arr("sleepEntries"),
      moodEntries: arr("moodEntries"),
      identity: arr("identity"),
      ringTasks,
      ringTemplates: [],
      boards,
      boardItems,
      blobs: arr("blobs"),
      customThemes: [],
      settings,
    },
  };
}

/* ── base64, chunked (no Buffer; works in browser + Node) ── */

export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function downloadJson(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
