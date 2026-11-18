import { describe, expect, it } from "vitest";
import {
  dur,
  findConflict,
  fmt,
  labelFits,
  minuteAt,
  moveTo,
  normalizeSpan,
  overlaps,
  parseHM,
  ringPieces,
  shouldFlip,
  spans,
  totalBlocked,
} from "./ringMath";

const C = { cx: 310, cy: 310 };

describe("time parsing and formatting", () => {
  it("parses HH:MM and rejects garbage", () => {
    expect(parseHM("09:30")).toBe(570);
    expect(parseHM("7:05")).toBe(425);
    expect(parseHM("24:00")).toBeNull();
    expect(parseHM("12:60")).toBeNull();
    expect(parseHM("abc")).toBeNull();
  });
  it("formats with wrap-around", () => {
    expect(fmt(0)).toBe("00:00");
    expect(fmt(1440 + 75)).toBe("01:15");
    expect(fmt(-30)).toBe("23:30");
  });
  it("durations in both languages", () => {
    expect(dur(95, "tr")).toBe("1s 35d");
    expect(dur(95, "en")).toBe("1h 35m");
  });
});

describe("normalizeSpan", () => {
  it("keeps same-day spans", () => {
    expect(normalizeSpan(600, 660)).toEqual({ start: 600, end: 660 });
  });
  it("an end before the start crosses midnight", () => {
    expect(normalizeSpan(23 * 60, 60)).toEqual({ start: 1380, end: 1500 });
  });
  it("zero-length is invalid", () => {
    expect(normalizeSpan(600, 600)).toBeNull();
  });
});

describe("overlap (half-open intervals)", () => {
  it("touching blocks do not collide", () => {
    expect(overlaps({ start: 600, end: 660 }, { start: 660, end: 720 })).toBe(false);
  });
  it("intersecting blocks collide", () => {
    expect(overlaps({ start: 600, end: 700 }, { start: 650, end: 720 })).toBe(true);
  });
  it("midnight-crossing blocks collide with early-morning ones", () => {
    const sleep = { start: 23 * 60, end: 24 * 60 + 7 * 60 };
    expect(spans(sleep)).toEqual([[1380, 1440], [0, 420]]);
    expect(overlaps(sleep, { start: 360, end: 420 })).toBe(true);
    expect(overlaps(sleep, { start: 420, end: 480 })).toBe(false);
  });
  it("findConflict ignores point tasks and the task itself", () => {
    const tasks = [
      { id: "a", start: 600, end: 660 },
      { id: "p", start: 630, end: null },
    ];
    expect(findConflict({ start: 620, end: 640 }, tasks)?.id).toBe("a");
    expect(findConflict({ start: 620, end: 640 }, tasks, "a")).toBeNull();
    expect(findConflict({ start: 630, end: null }, tasks)).toBeNull();
  });
  it("totalBlocked sums only blocks", () => {
    expect(totalBlocked([{ start: 0, end: 60 }, { start: 100, end: null }, { start: 1400, end: 1460 }])).toBe(120);
  });
});

describe("ring pieces", () => {
  it("a morning block stays on the inner ring", () => {
    expect(ringPieces({ start: 540, end: 630 })).toEqual([{ ring: "inner", from: 540, to: 630 }]);
  });
  it("11:00–14:00 splits at noon", () => {
    expect(ringPieces({ start: 660, end: 840 })).toEqual([
      { ring: "inner", from: 660, to: 720 },
      { ring: "outer", from: 0, to: 120 },
    ]);
  });
  it("23:00–01:00 splits at midnight", () => {
    expect(ringPieces({ start: 1380, end: 1500 })).toEqual([
      { ring: "outer", from: 660, to: 720 },
      { ring: "inner", from: 0, to: 60 },
    ]);
  });
  it("a full 12h ring is capped just short of a full circle", () => {
    const [p] = ringPieces({ start: 0, end: 720 });
    expect(p.to - p.from).toBeLessThan(720);
  });
});

describe("dial geometry", () => {
  it("12 o'clock on the inner band is 00:00, 3 o'clock on the outer band is 15:00", () => {
    expect(minuteAt(310, 310 - 131, C, 131, 230)).toBeCloseTo(0);
    expect(minuteAt(310 + 230, 310, C, 131, 230)).toBeCloseTo(720 + 180);
  });
  it("labels flip in the lower half only", () => {
    expect(shouldFlip(0, 60)).toBe(false);
    expect(shouldFlip(300, 420)).toBe(true);
  });
  it("short arcs hide long labels", () => {
    expect(labelFits(20, 0, 10, 131)).toBe(false);
    expect(labelFits(5, 0, 120, 131)).toBe(true);
  });
  it("moveTo keeps duration and wraps", () => {
    expect(moveTo({ start: 600, end: 660 }, 1420)).toEqual({ start: 1420, end: 1480 });
    expect(moveTo({ start: 600, end: null }, -10)).toEqual({ start: 1430, end: null });
  });
});
