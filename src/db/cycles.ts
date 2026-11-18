import { newRow, touch, type ArboraDB } from "./schema";
import { addDays, daysBetween } from "../lib/dates";
import type { Cycle } from "./types";

export const MAX_JOURNEY_DAYS = 365;
export const DEFAULT_JOURNEY_DAYS = 180;

export function clampJourneyDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_JOURNEY_DAYS;
  return Math.min(MAX_JOURNEY_DAYS, Math.max(1, Math.round(days)));
}

/** Inclusive end: day 1 IS the start date. */
export function journeyEndDate(startDate: string, days: number): string {
  return addDays(startDate, clampJourneyDays(days) - 1);
}

export async function startJourney(d: ArboraDB, startDate: string, name: string, days: number): Promise<Cycle> {
  const cycle: Cycle = { ...newRow(), name, startDate, endDate: journeyEndDate(startDate, days) };
  await d.cycles.add(cycle);
  return cycle;
}

export function journeySpan(startDate: string, endDate: string): { days: number; weeks: string; months: string } {
  const days = daysBetween(startDate, endDate) + 1;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  return { days, weeks: trim(days / 7), months: trim(days / 30.437) };
}

export async function updateJourney(d: ArboraDB, id: string, patch: { name?: string; endDate?: string }): Promise<void> {
  const c = await d.cycles.get(id);
  if (!c) return;
  let endDate = patch.endDate ?? c.endDate;
  if (endDate !== null) {
    const max = addDays(c.startDate, MAX_JOURNEY_DAYS - 1);
    if (endDate < c.startDate) endDate = c.startDate;
    if (endDate > max) endDate = max;
  }
  const name = patch.name !== undefined ? patch.name.trim() || c.name : c.name;
  await d.cycles.put(touch({ ...c, name, endDate }));
}

/** The active journey = the LATEST by start date; older ones are history. */
export async function currentCycle(d: ArboraDB): Promise<Cycle | undefined> {
  const all = await d.cycles.orderBy("startDate").toArray();
  return all.filter((c) => c.deletedAt === null).pop();
}

export interface JourneyStatus {
  progress: number; // 0..1
  day: number;
  total: number | null;
  phase: "before" | "running" | "ended" | "open";
}

export function journeyStatus(c: Cycle, today: string): JourneyStatus {
  if (today < c.startDate) return { progress: 0, day: 0, total: c.endDate ? daysBetween(c.startDate, c.endDate) + 1 : null, phase: "before" };
  if (c.endDate === null) return { progress: 1, day: daysBetween(c.startDate, today) + 1, total: null, phase: "open" };
  const total = daysBetween(c.startDate, c.endDate) + 1;
  const day = Math.min(daysBetween(c.startDate, today) + 1, total);
  const span = total - 1;
  const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, daysBetween(c.startDate, today) / span));
  return { progress, day, total, phase: today > c.endDate ? "ended" : "running" };
}
