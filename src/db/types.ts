/**
 * Every persisted row (except `settings`) extends BaseRow so a sync layer can
 * diff on `updatedAt` and reconcile deletes via `deletedAt`. Deletes are soft.
 *
 * - Calendar dates: local "YYYY-MM-DD" strings.
 * - Timestamps: ISO 8601.
 * - Sleep attributes to the wake-up day.
 */
export interface BaseRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Cycle extends BaseRow {
  name: string;
  startDate: string;
  endDate: string | null; // null only in legacy imported data
}

export type HabitKind = "good" | "bad";
export type HabitSeverity = "essential" | "good-to-do" | "optional";
export type HabitFrequency = { kind: "daily" } | { kind: "perWeek"; target: number };

export interface Habit extends BaseRow {
  cycleId: string;
  name: string;
  kind: HabitKind;
  frequency: HabitFrequency;
  severity: HabitSeverity;
  color: string;
  sortOrder: number;
}

export type HabitLogStatus = "partial" | "done" | "skipped";

export interface HabitLog extends BaseRow {
  habitId: string;
  date: string;
  status: HabitLogStatus;
}

export interface Moment extends BaseRow {
  date: string;
  title: string;
  text: string;
}

export interface JournalEntry extends BaseRow {
  at: string; // local "YYYY-MM-DDTHH:mm"
  text: string;
}

export interface SleepEntry extends BaseRow {
  wakeDate: string;
  bedTime: string;
  wakeTime: string;
  durationMin: number;
}

export type MoodValue = 1 | 2 | 3;

export interface MoodEntry extends BaseRow {
  date: string;
  value: MoodValue;
}

export interface IdentityStatement extends BaseRow {
  text: string;
  sortOrder: number;
}

/**
 * Day Ring entry (Gün Kadranı model, see lib/ringMath.ts): `start` 0..1439,
 * `end` in (start, start+1440] for a block, null for a point task.
 * `textColor` null = pick black/white automatically from `color`.
 */
export interface RingTask extends BaseRow {
  date: string;
  title: string;
  start: number;
  end: number | null;
  color: string;
  textColor: string | null;
}

export interface RingTemplateTask {
  title: string;
  start: number;
  end: number | null;
  color: string;
  textColor: string | null;
}

/** A "saved day": a reusable plan, shown as a mini dial. */
export interface RingTemplate extends BaseRow {
  name: string;
  color: string;
  tasks: RingTemplateTask[];
}

export interface Board extends BaseRow {
  name: string;
  width: number; // px of the exported wallpaper
  height: number;
  background: string;
  sortOrder: number;
}

export type BoardItemKind = "image" | "text";

export interface BoardItem extends BaseRow {
  boardId: string;
  kind: BoardItemKind;
  blobId: string | null;
  text: string | null;
  /** board-pixel coordinates (independent of on-screen scale) */
  transform: { x: number; y: number; w: number; h: number; rot: number };
  z: number;
  color?: string; // note background
}

export interface BlobRow extends BaseRow {
  mime: string;
  data: ArrayBuffer;
}

export interface CustomTheme extends BaseRow {
  name: string;
  dominant: string;
  secondary: string;
  accent: string;
  displayFont: "serif" | "sans" | "mono";
}

export interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}
