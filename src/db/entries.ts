/* Moments, journal, sleep, mood, identity — the date-scoped modules. */
import { newRow, nowIso, touch, type ArboraDB } from "./schema";
import type { IdentityStatement, JournalEntry, Moment, MoodEntry, MoodValue, SleepEntry } from "./types";

/* ── Moments: one physical row per day (revived, never duplicated) ── */
export async function momentsForRange(d: ArboraDB, from: string, to: string): Promise<Map<string, Moment>> {
  const rows = await d.moments.where("date").between(from, to, true, true).toArray();
  const map = new Map<string, Moment>();
  for (const r of rows) if (r.deletedAt === null) map.set(r.date, r);
  return map;
}

export async function saveMoment(d: ArboraDB, date: string, title: string, text: string): Promise<void> {
  await d.transaction("rw", d.moments, async () => {
    const existing = (await d.moments.where({ date }).toArray())[0];
    if (existing) await d.moments.put({ ...touch(existing), title, text, deletedAt: null });
    else await d.moments.add({ ...newRow(), date, title, text });
  });
}

/* ── Journal ── */
export async function journalLog(d: ArboraDB): Promise<JournalEntry[]> {
  const rows = await d.journalEntries.filter((e) => e.deletedAt === null).toArray();
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function addJournalEntry(d: ArboraDB, at: string, text: string): Promise<JournalEntry> {
  const entry: JournalEntry = { ...newRow(), at, text };
  await d.journalEntries.add(entry);
  return entry;
}

export async function updateJournalEntry(
  d: ArboraDB,
  id: string,
  patch: Partial<Pick<JournalEntry, "at" | "text">>
): Promise<void> {
  const e = await d.journalEntries.get(id);
  if (!e) return;
  await d.journalEntries.put(touch({ ...e, ...patch }));
}

/* ── Sleep (attributed to the wake-up day) ── */
export function sleepDurationMin(bedTime: string, wakeTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const b = toMin(bedTime);
  const w = toMin(wakeTime);
  return w > b ? w - b : 1440 - b + w;
}

export async function saveSleep(d: ArboraDB, wakeDate: string, bedTime: string, wakeTime: string): Promise<void> {
  await d.transaction("rw", d.sleepEntries, async () => {
    const durationMin = sleepDurationMin(bedTime, wakeTime);
    const existing = (await d.sleepEntries.where({ wakeDate }).toArray())[0];
    if (existing) {
      await d.sleepEntries.put({ ...touch(existing), bedTime, wakeTime, durationMin, deletedAt: null });
    } else {
      await d.sleepEntries.add({ ...newRow(), wakeDate, bedTime, wakeTime, durationMin });
    }
  });
}

export async function sleepSeries(d: ArboraDB): Promise<SleepEntry[]> {
  const rows = await d.sleepEntries.filter((e) => e.deletedAt === null).toArray();
  return rows.sort((a, b) => (a.wakeDate < b.wakeDate ? -1 : 1));
}

/* ── Mood (date is UNIQUE: reuse the row) ── */
export async function saveMood(d: ArboraDB, date: string, value: MoodValue): Promise<void> {
  await d.transaction("rw", d.moodEntries, async () => {
    const existing = (await d.moodEntries.where({ date }).toArray())[0];
    if (existing) await d.moodEntries.put({ ...touch(existing), value, deletedAt: null });
    else await d.moodEntries.add({ ...newRow(), date, value });
  });
}

export async function clearMood(d: ArboraDB, date: string): Promise<void> {
  const existing = (await d.moodEntries.where({ date }).toArray())[0];
  if (existing && existing.deletedAt === null) {
    await d.moodEntries.put({ ...touch(existing), deletedAt: nowIso() });
  }
}

export async function moodSeries(d: ArboraDB): Promise<MoodEntry[]> {
  const rows = await d.moodEntries.filter((e) => e.deletedAt === null).toArray();
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ── Identity ── */
export async function activeStatements(d: ArboraDB): Promise<IdentityStatement[]> {
  const rows = await d.identity.filter((s) => s.deletedAt === null).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addStatement(d: ArboraDB, text: string): Promise<void> {
  await d.transaction("rw", d.identity, async () => {
    const existing = await activeStatements(d);
    const sortOrder = existing.length ? Math.max(...existing.map((s) => s.sortOrder)) + 1 : 0;
    await d.identity.add({ ...newRow(), text, sortOrder });
  });
}

export async function updateStatement(d: ArboraDB, id: string, text: string): Promise<void> {
  const row = await d.identity.get(id);
  if (row) await d.identity.put(touch({ ...row, text }));
}

export async function moveStatement(d: ArboraDB, id: string, dir: -1 | 1): Promise<void> {
  await d.transaction("rw", d.identity, async () => {
    const rows = await activeStatements(d);
    const idx = rows.findIndex((s) => s.id === id);
    const other = rows[idx + dir];
    if (idx === -1 || !other) return;
    const a = rows[idx];
    await d.identity.put(touch({ ...a, sortOrder: other.sortOrder }));
    await d.identity.put(touch({ ...other, sortOrder: a.sortOrder }));
  });
}
