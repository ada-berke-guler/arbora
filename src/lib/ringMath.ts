/**
 * Day Ring time + geometry — Gün Kadranı's model.
 *
 * A day is 0..1440 minutes. A block is the half-open interval [start, end):
 * 10:00–11:00 and 11:00–12:00 do NOT collide. `start` is 0..1439; `end` is
 * start < end <= start + 1440, so a block crossing midnight simply has
 * end > 1440 and spans() splits it into two pieces. The dial is a 24h
 * routine: inner ring 00–12, outer ring 12–24, each a full 360° turn.
 *
 * A point task has end === null (a single moment on the ring).
 */

export const DAY = 1440;
export const HALF = 720;

export interface Timed {
  start: number;
  end: number | null;
}

export interface BlockLike {
  start: number;
  end: number;
}

export function pad2(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

/** "HH:MM" for any minute value (wraps). */
export function fmt(m: number): string {
  const v = ((Math.round(m) % DAY) + DAY) % DAY;
  return pad2(Math.floor(v / 60)) + ":" + pad2(v % 60);
}

/** "Xs YYd" / "Xh YYm". */
export function dur(m: number, lang: "tr" | "en" = "tr"): string {
  const h = Math.floor(m / 60);
  const mm = pad2(Math.round(m % 60));
  return lang === "tr" ? `${h}s ${mm}d` : `${h}h ${mm}m`;
}

export function parseHM(v: string): number | null {
  const p = /^(\d{1,2}):(\d{2})$/.exec(v || "");
  if (!p) return null;
  const h = +p[1];
  const mi = +p[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Normalize a picked start/end pair into the stored form. Equal times are
 * invalid (zero-length); an end before the start crosses midnight.
 */
export function normalizeSpan(start: number, end: number): BlockLike | null {
  const s = ((start % DAY) + DAY) % DAY;
  const e = ((end % DAY) + DAY) % DAY;
  if (s === e) return null;
  return { start: s, end: e > s ? e : e + DAY };
}

export function isBlock(t: Timed): t is BlockLike {
  return t.end !== null;
}

export function duration(t: Timed): number {
  return t.end === null ? 0 : t.end - t.start;
}

/** Pieces of a block inside [0, 1440]. */
export function spans(a: BlockLike): [number, number][] {
  if (a.end <= DAY) return [[a.start, a.end]];
  return [
    [a.start, DAY],
    [0, a.end - DAY],
  ];
}

export function overlaps(a: BlockLike, b: BlockLike): boolean {
  const sa = spans(a);
  const sb = spans(b);
  for (const x of sa) for (const y of sb) if (x[0] < y[1] && y[0] < x[1]) return true;
  return false;
}

/** First block in `others` that collides with `cand` (point tasks never collide). */
export function findConflict<T extends Timed & { id?: string }>(
  cand: Timed,
  others: T[],
  ignoreId?: string
): T | null {
  if (!isBlock(cand)) return null;
  for (const o of others) {
    if (ignoreId && o.id === ignoreId) continue;
    if (isBlock(o) && overlaps(cand, o)) return o;
  }
  return null;
}

/** Total minutes covered by blocks (they never overlap, so a plain sum). */
export function totalBlocked(list: Timed[]): number {
  return list.reduce((t, a) => t + duration(a), 0);
}

export interface RingPiece {
  ring: "inner" | "outer";
  /** minutes within that ring, 0..720 */
  from: number;
  to: number;
}

/** Split a block into per-ring pieces (noon and midnight both sit at 12 o'clock). */
export function ringPieces(a: BlockLike): RingPiece[] {
  const out: RingPiece[] = [];
  for (const [s, e] of spans(a)) {
    for (const [lo0, hi0, ring] of [
      [0, HALF, "inner"],
      [HALF, DAY, "outer"],
    ] as const) {
      const lo = Math.max(s, lo0);
      const hi = Math.min(e, hi0);
      if (hi - lo < 1) continue;
      let from = lo - lo0;
      let to = hi - lo0;
      if (to - from > HALF - 0.5) to = from + HALF - 0.5; // a full ring can't be drawn as one arc
      out.push({ ring, from, to });
    }
  }
  return out;
}

/* ── SVG geometry ── */

export interface Center {
  cx: number;
  cy: number;
}

/** Point at radius r for minute m within a 720-minute ring (0 = 12 o'clock, clockwise). */
export function polar(r: number, m: number, c: Center): [number, number] {
  const rad = (((m / HALF) * 360 - 90) * Math.PI) / 180;
  return [c.cx + r * Math.cos(rad), c.cy + r * Math.sin(rad)];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Annulus sector path between radii r1<r2 for minutes [mS, mE] of a ring. */
export function sectorPath(r1: number, r2_: number, mS: number, mE: number, c: Center): string {
  const a = polar(r2_, mS, c);
  const b = polar(r2_, mE, c);
  const cc = polar(r1, mE, c);
  const d = polar(r1, mS, c);
  const large = mE - mS > 360 ? 1 : 0;
  return (
    `M${r2(a[0])},${r2(a[1])}A${r2_},${r2_} 0 ${large} 1 ${r2(b[0])},${r2(b[1])}` +
    `L${r2(cc[0])},${r2(cc[1])}A${r1},${r1} 0 ${large} 0 ${r2(d[0])},${r2(d[1])}Z`
  );
}

/** Arc for a text label; flipped (drawn backwards) so text in the lower half isn't upside down. */
export function labelArc(r: number, mS: number, mE: number, flip: boolean, c: Center): string {
  const a = polar(r, flip ? mE : mS, c);
  const b = polar(r, flip ? mS : mE, c);
  const large = mE - mS > 360 ? 1 : 0;
  return `M${r2(a[0])},${r2(a[1])}A${r},${r} 0 ${large} ${flip ? 0 : 1} ${r2(b[0])},${r2(b[1])}`;
}

/** Whether a piece's label should be flipped: mid-angle in the lower half. */
export function shouldFlip(mS: number, mE: number): boolean {
  const mid = (((mS + mE) / 2) / HALF) * 360;
  return mid > 90 && mid < 270;
}

/** Whether a label of `chars` characters fits along an arc. */
export function labelFits(chars: number, mS: number, mE: number, radius: number): boolean {
  const arcLen = ((mE - mS) / HALF) * 2 * Math.PI * radius;
  return arcLen > chars * 7.6 + 14;
}

/**
 * The absolute day-minute under a pointer: which ring by radius (closer to
 * the inner band → 00–12, otherwise 12–24), angle → minute in that ring.
 */
export function minuteAt(
  x: number,
  y: number,
  c: Center,
  innerMid: number,
  outerMid: number
): number {
  const dx = x - c.cx;
  const dy = y - c.cy;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // 0 at 12 o'clock
  const frac = (((ang % 360) + 360) % 360) / 360;
  const base = Math.abs(radius - innerMid) <= Math.abs(radius - outerMid) ? 0 : HALF;
  return base + frac * HALF;
}

export function snap(m: number, step = 5): number {
  return Math.round(m / step) * step;
}

/** Move a task so it starts at `newStart` (wrapped into 0..1439), keeping its duration. */
export function moveTo<T extends Timed>(t: T, newStart: number): T {
  const s = ((Math.round(newStart) % DAY) + DAY) % DAY;
  return { ...t, start: s, end: t.end === null ? null : s + (t.end - t.start) };
}
