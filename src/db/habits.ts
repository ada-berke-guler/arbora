import { newRow, nowIso, touch, type ArboraDB } from "./schema";
import { addDays } from "../lib/dates";
import type { BaseRow, Habit, HabitLog, HabitLogStatus } from "./types";

export type HabitInput = Omit<Habit, keyof BaseRow | "sortOrder">;

export async function activeHabits(d: ArboraDB, cycleId?: string): Promise<Habit[]> {
  const rows = await d.habits
    .filter((h) => h.deletedAt === null && (cycleId === undefined || h.cycleId === cycleId))
    .toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addHabit(d: ArboraDB, input: HabitInput): Promise<Habit> {
  return d.transaction("rw", d.habits, async () => {
    const existing = await activeHabits(d, input.cycleId);
    const sortOrder = existing.length ? Math.max(...existing.map((h) => h.sortOrder)) + 1 : 0;
    const habit: Habit = { ...newRow(), ...input, sortOrder };
    await d.habits.add(habit);
    return habit;
  });
}

export async function updateHabit(d: ArboraDB, id: string, patch: Partial<HabitInput>): Promise<void> {
  const habit = await d.habits.get(id);
  if (!habit) return;
  await d.habits.put(touch({ ...habit, ...patch }));
}

/**
 * Set/clear a day's status. [habitId+date] is UNIQUE and soft-deleted rows
 * still occupy it, so clearing and re-setting reuses the same row.
 */
export async function setLogStatus(
  d: ArboraDB,
  habitId: string,
  date: string,
  status: HabitLogStatus | null
): Promise<void> {
  await d.transaction("rw", d.habitLogs, async () => {
    const existing = await d.habitLogs.where("[habitId+date]").equals([habitId, date]).first();
    if (!existing) {
      if (status === null) return;
      const log: HabitLog = { ...newRow(), habitId, date, status };
      await d.habitLogs.add(log);
      return;
    }
    if (status === null) await d.habitLogs.put({ ...touch(existing), deletedAt: nowIso() });
    else await d.habitLogs.put({ ...touch(existing), status, deletedAt: null });
  });
}

export async function logsForRange(d: ArboraDB, from: string, to: string): Promise<Map<string, HabitLogStatus>> {
  const rows = await d.habitLogs.where("date").between(from, to, true, true).toArray();
  const map = new Map<string, HabitLogStatus>();
  for (const r of rows) if (r.deletedAt === null) map.set(`${r.habitId}|${r.date}`, r.status);
  return map;
}

export async function habitTotals(
  d: ArboraDB,
  habitId: string
): Promise<{ done: number; partial: number; skipped: number }> {
  const rows = await d.habitLogs.where({ habitId }).toArray();
  let done = 0;
  let partial = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.deletedAt !== null) continue;
    if (r.status === "done") done++;
    else if (r.status === "partial") partial++;
    else skipped++;
  }
  return { done, partial, skipped };
}

/** Consecutive DONE days ending today (or yesterday if today is unmarked); skips bridge. */
export async function habitStreak(d: ArboraDB, habitId: string, today: string): Promise<number> {
  const rows = (await d.habitLogs.where({ habitId }).toArray()).filter((r) => r.deletedAt === null);
  const done = new Set(rows.filter((r) => r.status === "done").map((r) => r.date));
  const skipped = new Set(rows.filter((r) => r.status === "skipped").map((r) => r.date));
  let day = done.has(today) || skipped.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(day) || skipped.has(day)) {
    if (done.has(day)) streak++;
    day = addDays(day, -1);
  }
  return streak;
}
