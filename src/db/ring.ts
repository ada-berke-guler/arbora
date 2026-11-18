import { newRow, nowIso, touch, type ArboraDB } from "./schema";
import type { RingTask, RingTemplate, RingTemplateTask } from "./types";
import { findConflict, isBlock, normalizeSpan, type Timed } from "../lib/ringMath";

export interface RingTaskInput {
  title: string;
  start: number;
  end: number | null;
  color: string;
  textColor: string | null;
}

/** Thrown when a block would collide with an existing block. */
export class RingConflictError extends Error {
  constructor(public readonly with_: RingTask) {
    super(`Conflicts with "${with_.title}"`);
  }
}

export async function tasksForDate(d: ArboraDB, date: string): Promise<RingTask[]> {
  const rows = await d.ringTasks.where({ date }).toArray();
  return rows.filter((r) => r.deletedAt === null).sort((a, b) => a.start - b.start);
}

function validate(t: Timed): void {
  if (t.start < 0 || t.start >= 1440) throw new Error("Invalid start.");
  if (isBlock(t)) {
    const span = t.end - t.start;
    if (span <= 0 || span > 1440) throw new Error("Invalid span.");
  }
}

export async function addRingTask(d: ArboraDB, date: string, input: RingTaskInput): Promise<RingTask> {
  validate(input);
  return d.transaction("rw", d.ringTasks, async () => {
    const existing = await tasksForDate(d, date);
    const clash = findConflict(input, existing);
    if (clash) throw new RingConflictError(clash);
    const task: RingTask = { ...newRow(), date, ...input };
    await d.ringTasks.add(task);
    return task;
  });
}

export async function updateRingTask(d: ArboraDB, id: string, patch: Partial<RingTaskInput>): Promise<void> {
  await d.transaction("rw", d.ringTasks, async () => {
    const task = await d.ringTasks.get(id);
    if (!task) throw new Error("Task not found.");
    const next = { ...task, ...patch };
    validate(next);
    const clash = findConflict(next, await tasksForDate(d, task.date), id);
    if (clash) throw new RingConflictError(clash);
    await d.ringTasks.put(touch(next));
  });
}

export async function removeRingTask(d: ArboraDB, id: string): Promise<void> {
  const task = await d.ringTasks.get(id);
  if (task) await d.ringTasks.put({ ...touch(task), deletedAt: nowIso() });
}

/** Soft-delete every task on a date; returns the removed ids (for undo). */
export async function clearDate(d: ArboraDB, date: string): Promise<string[]> {
  return d.transaction("rw", d.ringTasks, async () => {
    const rows = await tasksForDate(d, date);
    const at = nowIso();
    for (const r of rows) await d.ringTasks.put({ ...r, deletedAt: at, updatedAt: at });
    return rows.map((r) => r.id);
  });
}

export async function restoreMany(d: ArboraDB, ids: string[]): Promise<void> {
  await d.transaction("rw", d.ringTasks, async () => {
    for (const id of ids) {
      const r = await d.ringTasks.get(id);
      if (r) await d.ringTasks.put({ ...r, deletedAt: null, updatedAt: nowIso() });
    }
  });
}

/* ── Saved days (templates) ── */

export async function activeTemplates(d: ArboraDB): Promise<RingTemplate[]> {
  const rows = await d.ringTemplates.filter((t) => t.deletedAt === null).toArray();
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

const snapshot = (tasks: RingTask[]): RingTemplateTask[] =>
  tasks.map(({ title, start, end, color, textColor }) => ({ title, start, end, color, textColor }));

export async function saveTemplate(d: ArboraDB, date: string, name: string, color: string): Promise<RingTemplate> {
  const tasks = await tasksForDate(d, date);
  const tpl: RingTemplate = { ...newRow(), name, color, tasks: snapshot(tasks) };
  await d.ringTemplates.add(tpl);
  return tpl;
}

/** Overwrite a saved day with the plan currently on `date`. */
export async function updateTemplateFromDate(d: ArboraDB, id: string, date: string): Promise<void> {
  const tpl = await d.ringTemplates.get(id);
  if (!tpl) return;
  await d.ringTemplates.put(touch({ ...tpl, tasks: snapshot(await tasksForDate(d, date)) }));
}

export async function renameTemplate(d: ArboraDB, id: string, patch: { name?: string; color?: string }): Promise<void> {
  const tpl = await d.ringTemplates.get(id);
  if (tpl) await d.ringTemplates.put(touch({ ...tpl, ...patch }));
}

/**
 * Replace `date`'s plan with a saved day. Returns the ids that were cleared
 * so the caller can offer an undo (restore those, remove the added ones).
 */
export async function applyTemplate(
  d: ArboraDB,
  templateId: string,
  date: string
): Promise<{ cleared: string[]; added: string[] }> {
  return d.transaction("rw", d.ringTasks, d.ringTemplates, async () => {
    const tpl = await d.ringTemplates.get(templateId);
    if (!tpl) return { cleared: [], added: [] };
    const cleared = await clearDate(d, date);
    const added: string[] = [];
    const placed: RingTask[] = [];
    for (const t of tpl.tasks) {
      const norm = t.end === null ? { start: t.start, end: null } : normalizeSpan(t.start, t.end);
      if (!norm) continue;
      const cand = { ...t, ...norm };
      if (findConflict(cand, placed)) continue; // defensive: templates are conflict-free when saved
      const row: RingTask = { ...newRow(), date, ...cand };
      await d.ringTasks.add(row);
      placed.push(row);
      added.push(row.id);
    }
    return { cleared, added };
  });
}

export async function undoApply(d: ArboraDB, r: { cleared: string[]; added: string[] }): Promise<void> {
  await d.transaction("rw", d.ringTasks, async () => {
    const at = nowIso();
    for (const id of r.added) {
      const row = await d.ringTasks.get(id);
      if (row) await d.ringTasks.put({ ...row, deletedAt: at, updatedAt: at });
    }
  });
  await restoreMany(d, r.cleared);
}
