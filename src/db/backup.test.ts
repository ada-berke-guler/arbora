import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArboraDB, putSetting } from "./schema";
import { BackupError, exportBackup, importBackup, summarizeBackup, TABLES } from "./backup";
import { addRingTask, saveTemplate } from "./ring";
import { addBoard, addImageItem } from "./board";
import { addHabit, setLogStatus } from "./habits";
import { startJourney } from "./cycles";
import { addJournalEntry, saveMoment } from "./entries";

let a: ArboraDB;
let b: ArboraDB;
beforeEach(() => {
  a = new ArboraDB(`a-${Math.random()}`);
  b = new ArboraDB(`b-${Math.random()}`);
});
afterEach(async () => {
  await a.delete();
  await b.delete();
});

describe("backup", () => {
  it("every Dexie table is in TABLES (a missing table silently loses data)", () => {
    expect(a.tables.map((t) => t.name).sort()).toEqual([...TABLES].sort());
  });

  it("round-trips every table, including image bytes and Day Ring data", async () => {
    const c = await startJourney(a, "2026-11-01", "J", 30);
    const h = await addHabit(a, { cycleId: c.id, name: "Run", kind: "good", frequency: { kind: "daily" }, severity: "essential", color: "#fff" });
    await setLogStatus(a, h.id, "2026-11-02", "done");
    await saveMoment(a, "2026-11-02", "T", "x");
    await addJournalEntry(a, "2026-11-02T10:00", "hello");
    await addRingTask(a, "2026-11-02", { title: "Work", start: 540, end: 600, color: "#123456", textColor: null });
    await saveTemplate(a, "2026-11-02", "Routine", "#654321");
    const board = await addBoard(a, { name: "P", width: 1080, height: 2400, background: "#000" });
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 7]);
    await addImageItem(a, board.id, { data: bytes.buffer, mime: "image/png" }, { x: 0, y: 0, w: 10, h: 10 });
    await putSetting(a, "lang", "en");

    const file = JSON.parse(JSON.stringify(await exportBackup(a)));
    await importBackup(b, file);

    for (const t of TABLES) {
      if (t === "blobs") continue;
      expect(await b.table(t).count(), t).toBe(await a.table(t).count());
    }
    const blob = (await b.blobs.toArray())[0];
    expect(Array.from(new Uint8Array(blob.data))).toEqual(Array.from(bytes));
    expect((await b.ringTasks.toArray())[0].title).toBe("Work");
    expect((await b.ringTemplates.toArray())[0].tasks).toHaveLength(1);
  });

  it("rejects invalid files without touching existing data", async () => {
    await saveMoment(b, "2026-11-02", "keep", "");
    await expect(importBackup(b, { app: "nope" })).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup(b, { app: "arbora", version: 99, data: {} })).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup(b, { app: "arbora", version: 2, data: { moments: "x" } })).rejects.toBeInstanceOf(BackupError);
    expect(await b.moments.count()).toBe(1);
  });

  it("imports an Arbora v1 (life-tracker) backup", async () => {
    const row = (extra: object) => ({ id: crypto.randomUUID(), createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null, ...extra });
    const v1 = {
      app: "life-tracker",
      version: 1,
      exportedAt: "2026-07-01T00:00:00Z",
      data: {
        cycles: [row({ name: "Old", startDate: "2026-07-01", endDate: "2026-12-31" })],
        habits: [],
        habitLogs: [],
        moments: [row({ date: "2026-07-02", title: "m", text: "" })],
        journalEntries: [],
        sleepEntries: [],
        moodEntries: [],
        identity: [],
        boardItems: [row({ kind: "text", blobId: null, text: "note", transform: { x: 1, y: 2, w: 3, h: 4, rot: 0 }, z: 1 })],
        blobs: [],
        settings: [{ key: "theme", value: "matcha", updatedAt: "" }, { key: "introSeen", value: true, updatedAt: "" }],
        dayRingTasks: [row({ date: "2026-07-02", title: "Sleep", hh: 23, mm: 0, endHh: 7, endMm: 0, colorIndex: 2 })],
      },
    };
    const s = summarizeBackup(v1);
    expect(s.legacy).toBe(true);
    expect(s.counts.ringTasks).toBe(1);

    await importBackup(b, v1);
    const [task] = await b.ringTasks.toArray();
    expect(task).toMatchObject({ title: "Sleep", start: 1380, end: 1860, textColor: null });
    const [board] = await b.boards.toArray();
    const [item] = await b.boardItems.toArray();
    expect(item.boardId).toBe(board.id);
    expect((await b.settings.toArray()).map((x) => x.key)).toEqual(["introSeen"]);
  });
});
