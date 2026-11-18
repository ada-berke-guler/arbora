import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArboraDB, restoreRow, softDelete } from "./schema";
import { addRingTask, applyTemplate, RingConflictError, saveTemplate, tasksForDate, undoApply, updateRingTask } from "./ring";
import { addHabit, habitStreak, logsForRange, setLogStatus } from "./habits";
import { currentCycle, journeyStatus, startJourney, updateJourney } from "./cycles";
import { addBoard, addTextItem, itemsForBoard, updateBoard } from "./board";
import { saveMood } from "./entries";

let d: ArboraDB;
beforeEach(() => {
  d = new ArboraDB(`t-${Math.random()}`);
});
afterEach(async () => {
  await d.delete();
});

const DATE = "2026-11-18";
const base = { color: "#C9A96E", textColor: null };

describe("Day Ring persistence", () => {
  it("rejects a conflicting block and names the blocker", async () => {
    await addRingTask(d, DATE, { title: "Work", start: 540, end: 720, ...base });
    await expect(addRingTask(d, DATE, { title: "Gym", start: 700, end: 760, ...base })).rejects.toBeInstanceOf(RingConflictError);
    try {
      await addRingTask(d, DATE, { title: "Gym", start: 700, end: 760, ...base });
    } catch (e) {
      expect((e as RingConflictError).with_.title).toBe("Work");
    }
    await addRingTask(d, DATE, { title: "Lunch", start: 720, end: 780, ...base }); // touching is fine
    expect((await tasksForDate(d, DATE)).map((t) => t.title)).toEqual(["Work", "Lunch"]);
  });

  it("other dates don't conflict; deleted tasks don't block", async () => {
    const a = await addRingTask(d, DATE, { title: "A", start: 0, end: 60, ...base });
    await addRingTask(d, "2026-11-19", { title: "B", start: 0, end: 60, ...base });
    await softDelete(d, "ringTasks", a.id);
    await addRingTask(d, DATE, { title: "C", start: 30, end: 90, ...base });
    await restoreRow(d, "ringTasks", a.id); // undo revives the same row
    expect((await tasksForDate(d, DATE)).length).toBe(2);
  });

  it("moving onto another block is refused", async () => {
    await addRingTask(d, DATE, { title: "A", start: 600, end: 660, ...base });
    const b = await addRingTask(d, DATE, { title: "B", start: 700, end: 760, ...base });
    await expect(updateRingTask(d, b.id, { start: 630, end: 690 })).rejects.toBeInstanceOf(RingConflictError);
    await updateRingTask(d, b.id, { start: 660, end: 720 });
    expect((await d.ringTasks.get(b.id))!.start).toBe(660);
  });

  it("saved days apply to another date and undo cleanly", async () => {
    await addRingTask(d, DATE, { title: "Sleep", start: 1380, end: 1860, ...base });
    await addRingTask(d, DATE, { title: "Read", start: 1260, end: null, ...base });
    const tpl = await saveTemplate(d, DATE, "Routine", "#386641");
    expect(tpl.tasks).toHaveLength(2);

    const other = "2026-11-20";
    await addRingTask(d, other, { title: "Old", start: 60, end: 120, ...base });
    const res = await applyTemplate(d, tpl.id, other);
    expect((await tasksForDate(d, other)).map((t) => t.title).sort()).toEqual(["Read", "Sleep"]);
    await undoApply(d, res);
    expect((await tasksForDate(d, other)).map((t) => t.title)).toEqual(["Old"]);
  });
});

describe("habits", () => {
  it("clear + re-set reuses the same log row (unique index safe)", async () => {
    const h = await addHabit(d, { cycleId: "c", name: "Run", kind: "good", frequency: { kind: "daily" }, severity: "essential", color: "#fff" });
    await setLogStatus(d, h.id, DATE, "done");
    await setLogStatus(d, h.id, DATE, null);
    await setLogStatus(d, h.id, DATE, "partial");
    expect(await d.habitLogs.count()).toBe(1);
    expect((await logsForRange(d, DATE, DATE)).get(`${h.id}|${DATE}`)).toBe("partial");
  });

  it("streak bridges skips and gives today grace", async () => {
    const h = await addHabit(d, { cycleId: "c", name: "Run", kind: "good", frequency: { kind: "daily" }, severity: "essential", color: "#fff" });
    await setLogStatus(d, h.id, "2026-11-15", "done");
    await setLogStatus(d, h.id, "2026-11-16", "skipped");
    await setLogStatus(d, h.id, "2026-11-17", "done");
    expect(await habitStreak(d, h.id, DATE)).toBe(2);
  });
});

describe("journeys", () => {
  it("latest journey wins; end date is clamped to a year", async () => {
    const a = await startJourney(d, "2026-01-01", "A", 30);
    await startJourney(d, "2026-03-01", "B", 30);
    expect((await currentCycle(d))!.name).toBe("B");
    await updateJourney(d, a.id, { endDate: "2030-01-01" });
    expect((await d.cycles.get(a.id))!.endDate).toBe("2026-12-31");
  });

  it("status covers before / running / ended", () => {
    const c = { id: "x", name: "x", startDate: "2026-11-10", endDate: "2026-11-19", createdAt: "", updatedAt: "", deletedAt: null };
    expect(journeyStatus(c, "2026-11-01").phase).toBe("before");
    const r = journeyStatus(c, DATE);
    expect(r).toMatchObject({ phase: "running", day: 9, total: 10 });
    expect(journeyStatus(c, "2026-11-25").phase).toBe("ended");
  });
});

describe("boards", () => {
  it("resizing a board keeps items proportionally in place", async () => {
    const b = await addBoard(d, { name: "Phone", width: 1000, height: 2000, background: "#000" });
    const it = await addTextItem(d, b.id, "hi", { x: 400, y: 900, w: 200, h: 200 }, "#fff");
    await updateBoard(d, b.id, { width: 2000, height: 1000 });
    const [moved] = await itemsForBoard(d, b.id);
    expect(moved.id).toBe(it.id);
    const cx = moved.transform.x + moved.transform.w / 2;
    const cy = moved.transform.y + moved.transform.h / 2;
    expect(cx).toBeCloseTo(1000);
    expect(cy).toBeCloseTo(500);
  });
});

describe("mood upsert", () => {
  it("one row per date", async () => {
    await saveMood(d, DATE, 1);
    await saveMood(d, DATE, 3);
    expect(await d.moodEntries.count()).toBe(1);
  });
});
