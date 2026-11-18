/** Local calendar dates as "YYYY-MM-DD". Never derive a date from toISOString (UTC off-by-one). */
export function todayLocal(): string {
  return toLocalDateString(new Date());
}

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function split(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
}

export function parseLocal(date: string): Date {
  const [y, m, d] = split(date);
  return new Date(y, m, d);
}

/** Whole days b - a, timezone safe. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(...split(b)) - Date.UTC(...split(a))) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = split(date);
  return toLocalDateString(new Date(y, m, d + n));
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = (parseLocal(date).getDay() + 6) % 7;
  return addDays(date, -dow);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(key: string): { first: string; last: string } {
  const [y, m] = key.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  return { first: `${key}-01`, last: `${key}-${String(dim).padStart(2, "0")}` };
}

/** Monday-start calendar cells; null = blank; length is a multiple of 7. */
export function monthGrid(key: string): (string | null)[] {
  const [y, m] = key.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const dim = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array<null>(lead).fill(null);
  for (let d = 1; d <= dim; d++) cells.push(`${key}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 0..1 progress of `date` through [start, end] inclusive. */
export function cycleProgress(start: string, end: string, date: string): number {
  const total = daysBetween(start, end);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(start, date) / total));
}

export function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
