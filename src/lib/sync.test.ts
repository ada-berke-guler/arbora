// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArboraDB, getSetting, putSetting } from "../db/schema";
import { exportBackup, importBackup, mergeBackup } from "../db/backup";
import { startJourney } from "../db/cycles";
import { addJournalEntry, saveMood } from "../db/entries";
import { connect, deleteAccount, signOut, syncNow } from "./sync";

const USER = `zeynep-${Math.random().toString(36).slice(2, 8)}`;

let proc: ChildProcess;
let dir: string;
const PORT = 18000 + Math.floor(Math.random() * 1000);
/* VAULT_SERVER=http://127.0.0.1:8788 runs the same suite against the Cloudflare Worker (wrangler dev). */
const SERVER = process.env.VAULT_SERVER || `http://127.0.0.1:${PORT}`;

beforeAll(async () => {
  if (process.env.VAULT_SERVER) return;
  dir = mkdtempSync(join(tmpdir(), "arbora-vault-"));
  proc = spawn(process.execPath, ["server/server.mjs"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir } });
  await new Promise<void>((ok, fail) => {
    proc.stdout!.on("data", (b) => String(b).includes("vault server") && ok());
    proc.on("error", fail);
  });
});
afterAll(() => {
  proc?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const fresh = () => new ArboraDB(`dev-${Math.random()}`);
const moods = async (d: ArboraDB) => (await d.moodEntries.toArray()).map((m) => [m.date, m.value]);

describe("merge", () => {
  it("unions both sides; the newer row wins; same-day moods don't collide", async () => {
    const a = fresh();
    const b = fresh();
    await addJournalEntry(a, "2026-11-01T09:00", "from A");
    await saveMood(a, "2026-11-01", 1);
    await new Promise((r) => setTimeout(r, 5));
    await addJournalEntry(b, "2026-11-02T09:00", "from B");
    await saveMood(b, "2026-11-01", 3); // newer, different id, same date
    await mergeBackup(a, await exportBackup(b));
    expect((await a.journalEntries.toArray()).map((j) => j.text).sort()).toEqual(["from A", "from B"]);
    expect(await moods(a)).toEqual([["2026-11-01", 3]]);
    await mergeBackup(b, await exportBackup(a)); // and back: stable
    expect(await moods(b)).toEqual([["2026-11-01", 3]]);
  });

  it("imports and merges never touch this device's sync session", async () => {
    const a = fresh();
    await putSetting(a, "sync.session", { username: "x" });
    await importBackup(a, await exportBackup(fresh()));
    expect(await getSetting(a, "sync.session")).toEqual({ username: "x" });
    expect(JSON.stringify(await exportBackup(a))).not.toContain("sync.session");
  });
});

describe("account sync against the real server", () => {
  it("create on phone → sign in on laptop → changes flow both ways", async () => {
    const phone = fresh();
    const laptop = fresh();
    await startJourney(phone, "2026-11-01", "Yolculuk", 30);
    await addJournalEntry(phone, "2026-11-03T08:00", "telefondan");

    await expect(connect(laptop, SERVER, USER, "uzun-bir-parola", "login")).rejects.toThrow("not-found");
    await connect(phone, SERVER, USER, "uzun-bir-parola", "create");
    await expect(connect(fresh(), SERVER, USER, "uzun-bir-parola", "create")).rejects.toThrow("exists");
    await expect(connect(laptop, SERVER, USER, "yanlis-parola!", "login")).rejects.toThrow("not-found");

    await connect(laptop, SERVER, ` ${USER.toUpperCase()} `, "uzun-bir-parola", "login");
    expect((await laptop.cycles.toArray()).map((c) => c.name)).toEqual(["Yolculuk"]);
    expect((await laptop.journalEntries.toArray())[0].text).toBe("telefondan");

    await addJournalEntry(laptop, "2026-11-04T08:00", "bilgisayardan");
    await syncNow(laptop);
    await syncNow(phone);
    expect((await phone.journalEntries.toArray()).map((j) => j.text).sort()).toEqual(["bilgisayardan", "telefondan"]);

    /* neither device's offline edit is lost when both sync */
    await addJournalEntry(phone, "2026-11-05T08:00", "p");
    await addJournalEntry(laptop, "2026-11-05T09:00", "l");
    await syncNow(phone);
    await syncNow(laptop);
    await syncNow(phone);
    expect((await phone.journalEntries.count())).toBe(4);
    expect((await laptop.journalEntries.count())).toBe(4);

    await signOut(laptop);
    expect(await laptop.journalEntries.count()).toBe(4); // data stays on the device
    await deleteAccount(phone);
    await expect(connect(fresh(), SERVER, USER, "uzun-bir-parola", "login")).rejects.toThrow("not-found");
  }, 60_000);
});
