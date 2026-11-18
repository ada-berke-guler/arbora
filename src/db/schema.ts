import Dexie, { type Table } from "dexie";
import type {
  BaseRow,
  BlobRow,
  Board,
  BoardItem,
  CustomTheme,
  Cycle,
  Habit,
  HabitLog,
  IdentityStatement,
  JournalEntry,
  MoodEntry,
  Moment,
  RingTask,
  RingTemplate,
  Setting,
  SleepEntry,
} from "./types";

export class ArboraDB extends Dexie {
  cycles!: Table<Cycle, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  moments!: Table<Moment, string>;
  journalEntries!: Table<JournalEntry, string>;
  sleepEntries!: Table<SleepEntry, string>;
  moodEntries!: Table<MoodEntry, string>;
  identity!: Table<IdentityStatement, string>;
  ringTasks!: Table<RingTask, string>;
  ringTemplates!: Table<RingTemplate, string>;
  boards!: Table<Board, string>;
  boardItems!: Table<BoardItem, string>;
  blobs!: Table<BlobRow, string>;
  customThemes!: Table<CustomTheme, string>;
  settings!: Table<Setting, string>;

  constructor(name = "arbora") {
    super(name);
    /* Schema changes: add this.version(2).stores(...) with an upgrade fn.
     * Never edit version 1 once real data exists. */
    this.version(1).stores({
      cycles: "id, startDate",
      habits: "id, cycleId, sortOrder",
      habitLogs: "id, &[habitId+date], date, habitId",
      moments: "id, date",
      journalEntries: "id, at",
      sleepEntries: "id, wakeDate",
      moodEntries: "id, &date",
      identity: "id, sortOrder",
      ringTasks: "id, date",
      ringTemplates: "id",
      boards: "id, sortOrder",
      boardItems: "id, boardId, z",
      blobs: "id",
      customThemes: "id",
      settings: "key",
    });
  }
}

export const db = new ArboraDB();

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newRow(): BaseRow {
  const at = nowIso();
  return { id: uuid(), createdAt: at, updatedAt: at, deletedAt: null };
}

/** Mark a row modified — call on every update (sync relies on it). */
export function touch<T extends BaseRow>(row: T): T {
  return { ...row, updatedAt: nowIso() };
}

export async function softDelete(d: ArboraDB, table: string, id: string): Promise<void> {
  const t = d.table(table);
  const row = (await t.get(id)) as BaseRow | undefined;
  if (!row) return;
  await t.put({ ...row, deletedAt: nowIso(), updatedAt: nowIso() });
}

/** Undo a soft delete by reviving the same physical row (unique-index safe). */
export async function restoreRow(d: ArboraDB, table: string, id: string): Promise<void> {
  const t = d.table(table);
  const row = (await t.get(id)) as BaseRow | undefined;
  if (!row) return;
  await t.put({ ...row, deletedAt: null, updatedAt: nowIso() });
}

export async function getSetting<T>(d: ArboraDB, key: string): Promise<T | undefined> {
  const s = await d.settings.get(key);
  return s?.value as T | undefined;
}

export async function putSetting(d: ArboraDB, key: string, value: unknown): Promise<void> {
  await d.settings.put({ key, value, updatedAt: nowIso() });
}

export const live = <T extends BaseRow>(r: T) => r.deletedAt === null;
