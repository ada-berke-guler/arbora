import { newRow, nowIso, touch, type ArboraDB } from "./schema";
import type { BlobRow, Board, BoardItem } from "./types";

export interface Transform {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export interface SizePreset {
  id: string;
  w: number;
  h: number;
}

/** Wallpaper sizes a person can start from; any custom W×H is allowed too. */
export const SIZE_PRESETS: SizePreset[] = [
  { id: "phone", w: 1080, h: 2400 },
  { id: "iphone", w: 1179, h: 2556 },
  { id: "tablet", w: 2048, h: 1536 },
  { id: "desktop", w: 1920, h: 1080 },
  { id: "qhd", w: 2560, h: 1440 },
  { id: "ultrawide", w: 3440, h: 1440 },
];

export const MIN_SIDE = 200;
export const MAX_SIDE = 8000;

export function clampSide(v: number): number {
  if (!Number.isFinite(v)) return 1080;
  return Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.round(v)));
}

export async function activeBoards(d: ArboraDB): Promise<Board[]> {
  const rows = await d.boards.filter((b) => b.deletedAt === null).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addBoard(
  d: ArboraDB,
  input: { name: string; width: number; height: number; background: string }
): Promise<Board> {
  return d.transaction("rw", d.boards, async () => {
    const existing = await activeBoards(d);
    const board: Board = {
      ...newRow(),
      name: input.name,
      width: clampSide(input.width),
      height: clampSide(input.height),
      background: input.background,
      sortOrder: existing.length ? Math.max(...existing.map((b) => b.sortOrder)) + 1 : 0,
    };
    await d.boards.add(board);
    return board;
  });
}

/**
 * Resize a board. Items keep their place PROPORTIONALLY (x/y scale with the
 * board) so switching phone → desktop doesn't strand notes off-canvas.
 */
export async function updateBoard(
  d: ArboraDB,
  id: string,
  patch: Partial<Pick<Board, "name" | "width" | "height" | "background">>
): Promise<void> {
  await d.transaction("rw", d.boards, d.boardItems, async () => {
    const b = await d.boards.get(id);
    if (!b) return;
    const width = patch.width !== undefined ? clampSide(patch.width) : b.width;
    const height = patch.height !== undefined ? clampSide(patch.height) : b.height;
    if (width !== b.width || height !== b.height) {
      const sx = width / b.width;
      const sy = height / b.height;
      const s = Math.min(sx, sy);
      const items = await itemsForBoard(d, id);
      for (const it of items) {
        const t = it.transform;
        const w = Math.max(40, t.w * s);
        const h = Math.max(30, t.h * s);
        const cx = (t.x + t.w / 2) * sx;
        const cy = (t.y + t.h / 2) * sy;
        await d.boardItems.put(touch({ ...it, transform: { ...t, w, h, x: cx - w / 2, y: cy - h / 2 } }));
      }
    }
    await d.boards.put(touch({ ...b, ...patch, width, height }));
  });
}

export async function itemsForBoard(d: ArboraDB, boardId: string): Promise<BoardItem[]> {
  const rows = await d.boardItems.where({ boardId }).toArray();
  return rows.filter((i) => i.deletedAt === null).sort((a, b) => a.z - b.z);
}

async function nextZ(d: ArboraDB, boardId: string): Promise<number> {
  const items = await itemsForBoard(d, boardId);
  return items.length ? items[items.length - 1].z + 1 : 1;
}

export async function addImageItem(
  d: ArboraDB,
  boardId: string,
  image: { data: ArrayBuffer; mime: string },
  place: Omit<Transform, "rot">
): Promise<BoardItem> {
  return d.transaction("rw", d.blobs, d.boardItems, async () => {
    const blob: BlobRow = { ...newRow(), mime: image.mime, data: image.data };
    await d.blobs.add(blob);
    const item: BoardItem = {
      ...newRow(),
      boardId,
      kind: "image",
      blobId: blob.id,
      text: null,
      transform: { ...place, rot: 0 },
      z: await nextZ(d, boardId),
    };
    await d.boardItems.add(item);
    return item;
  });
}

export async function addTextItem(
  d: ArboraDB,
  boardId: string,
  text: string,
  place: Omit<Transform, "rot">,
  color: string
): Promise<BoardItem> {
  return d.transaction("rw", d.boardItems, async () => {
    const item: BoardItem = {
      ...newRow(),
      boardId,
      kind: "text",
      blobId: null,
      text,
      transform: { ...place, rot: 0 },
      z: await nextZ(d, boardId),
      color,
    };
    await d.boardItems.add(item);
    return item;
  });
}

export async function updateItem(
  d: ArboraDB,
  id: string,
  patch: Partial<Pick<BoardItem, "transform" | "text" | "color">>
): Promise<void> {
  const it = await d.boardItems.get(id);
  if (it) await d.boardItems.put(touch({ ...it, ...patch }));
}

export async function bringToFront(d: ArboraDB, id: string): Promise<void> {
  await d.transaction("rw", d.boardItems, async () => {
    const it = await d.boardItems.get(id);
    if (it) await d.boardItems.put(touch({ ...it, z: await nextZ(d, it.boardId) }));
  });
}

export async function sendToBack(d: ArboraDB, id: string): Promise<void> {
  await d.transaction("rw", d.boardItems, async () => {
    const it = await d.boardItems.get(id);
    if (!it) return;
    const items = await itemsForBoard(d, it.boardId);
    await d.boardItems.put(touch({ ...it, z: (items[0]?.z ?? 1) - 1 }));
  });
}

export async function removeBoard(d: ArboraDB, id: string): Promise<void> {
  const b = await d.boards.get(id);
  if (b) await d.boards.put({ ...touch(b), deletedAt: nowIso() });
}

/** Note font size in board pixels — proportional to the board's short side. */
export function noteFontSize(board: Pick<Board, "width" | "height">): number {
  return Math.round(Math.min(board.width, board.height) / 26);
}
