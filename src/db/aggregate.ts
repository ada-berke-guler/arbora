/* Read-only cross-module views: the calendar's day detail, the journey recap, search. */
import type { ArboraDB } from "./schema";
import { activeHabits, logsForRange } from "./habits";
import { tasksForDate } from "./ring";
import type { Cycle, HabitLogStatus, JournalEntry, MoodValue, RingTask, SleepEntry } from "./types";

export interface DayDetail {
  habits: { id: string; name: string; color: string; status: HabitLogStatus }[];
  mood: MoodValue | null;
  sleep: SleepEntry | null;
  journal: JournalEntry[];
  ring: RingTask[];
}

export async function dayDetail(d: ArboraDB, date: string, cycleId?: string): Promise<DayDetail> {
  const [habits, logs, moodRows, sleepRows, journalRows, ring] = await Promise.all([
    activeHabits(d, cycleId),
    logsForRange(d, date, date),
    d.moodEntries.where({ date }).toArray(),
    d.sleepEntries.where({ wakeDate: date }).toArray(),
    d.journalEntries.where("at").between(`${date}T00:00`, `${date}T99:99`, true, true).toArray(),
    tasksForDate(d, date),
  ]);
  const out: DayDetail["habits"] = [];
  for (const h of habits) {
    const status = logs.get(`${h.id}|${date}`);
    if (status) out.push({ id: h.id, name: h.name, color: h.color, status });
  }
  return {
    habits: out,
    mood: moodRows.find((m) => m.deletedAt === null)?.value ?? null,
    sleep: sleepRows.find((s) => s.deletedAt === null) ?? null,
    journal: journalRows.filter((e) => e.deletedAt === null).sort((a, b) => (a.at < b.at ? -1 : 1)),
    ring,
  };
}

export interface RecapStats {
  days: number;
  habitsDone: number;
  habitsPartial: number;
  moments: number;
  journalEntries: number;
  sleepNights: number;
  avgSleepMin: number | null;
  avgMood: number | null;
  identityStatements: number;
  plannedMinutes: number;
}

export async function journeyRecap(d: ArboraDB, cycle: Cycle): Promise<RecapStats> {
  const from = cycle.startDate;
  const to = cycle.endDate ?? "9999-12-31";
  const inRange = (date: string) => date >= from && date <= to;
  const [logs, habits, moments, journal, sleep, mood, identity, ring] = await Promise.all([
    d.habitLogs.toArray(),
    d.habits.toArray(),
    d.moments.toArray(),
    d.journalEntries.toArray(),
    d.sleepEntries.toArray(),
    d.moodEntries.toArray(),
    d.identity.toArray(),
    d.ringTasks.toArray(),
  ]);
  const own = new Set(habits.filter((h) => h.cycleId === cycle.id).map((h) => h.id));
  let habitsDone = 0;
  let habitsPartial = 0;
  for (const l of logs) {
    if (l.deletedAt !== null || !inRange(l.date) || !own.has(l.habitId)) continue;
    if (l.status === "done") habitsDone++;
    else if (l.status === "partial") habitsPartial++;
  }
  const sleepRows = sleep.filter((s) => s.deletedAt === null && inRange(s.wakeDate));
  const moodRows = mood.filter((m) => m.deletedAt === null && inRange(m.date));
  const days =
    cycle.endDate === null
      ? 0
      : Math.round((Date.UTC(...ymd(cycle.endDate)) - Date.UTC(...ymd(cycle.startDate))) / 86_400_000) + 1;
  return {
    days,
    habitsDone,
    habitsPartial,
    moments: moments.filter((m) => m.deletedAt === null && inRange(m.date)).length,
    journalEntries: journal.filter((e) => e.deletedAt === null && inRange(e.at.slice(0, 10))).length,
    sleepNights: sleepRows.length,
    avgSleepMin: sleepRows.length ? Math.round(sleepRows.reduce((a, s) => a + s.durationMin, 0) / sleepRows.length) : null,
    avgMood: moodRows.length ? Math.round((moodRows.reduce((a, m) => a + m.value, 0) / moodRows.length) * 10) / 10 : null,
    identityStatements: identity.filter((s) => s.deletedAt === null && inRange(s.createdAt.slice(0, 10))).length,
    plannedMinutes: ring
      .filter((r) => r.deletedAt === null && inRange(r.date) && r.end !== null)
      .reduce((a, r) => a + (r.end! - r.start), 0),
  };
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
}

export interface SearchHit {
  kind: "journal" | "moment";
  id: string;
  date: string;
  title: string;
  snippet: string;
}

function excerpt(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.length > 90 ? `${text.slice(0, 90)}…` : text;
  const start = Math.max(0, idx - 42);
  const end = Math.min(text.length, idx + q.length + 42);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Client-side substring search; Turkish-aware lowercasing. */
export async function search(d: ArboraDB, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const low = (s: string) => s.toLocaleLowerCase("tr");
  const ql = low(q);
  const [journal, moments] = await Promise.all([
    d.journalEntries.filter((e) => e.deletedAt === null).toArray(),
    d.moments.filter((m) => m.deletedAt === null).toArray(),
  ]);
  const hits: SearchHit[] = [];
  for (const e of journal) {
    if (low(e.text).includes(ql)) {
      hits.push({ kind: "journal", id: e.id, date: e.at.slice(0, 10), title: e.at.slice(11), snippet: excerpt(e.text, q) });
    }
  }
  for (const m of moments) {
    const hay = `${m.title} ${m.text}`;
    if (low(hay).includes(ql)) {
      hits.push({ kind: "moment", id: m.id, date: m.date, title: m.title, snippet: excerpt(hay.trim(), q) });
    }
  }
  return hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
