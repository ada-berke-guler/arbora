import { db } from "../../db/schema";
import { noteFontSize } from "../../db/board";
import type { Board, BoardItem } from "../../db/types";
import { bestBW } from "../../lib/color";

function loadImage(data: ArrayBuffer, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const cand = line ? `${line} ${word}` : word;
      if (ctx.measureText(cand).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render the board at its exact pixel size (the wallpaper) — same geometry
 * as the on-screen canvas, which is just this drawn at a CSS scale.
 */
export async function exportBoardPng(board: Board, items: BoardItem[], filename: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = board.width;
  canvas.height = board.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = board.background;
  ctx.fillRect(0, 0, board.width, board.height);
  const fs = noteFontSize(board);
  await document.fonts?.ready;

  for (const it of [...items].sort((a, b) => a.z - b.z)) {
    const { x, y, w, h, rot } = it.transform;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    if (it.kind === "image" && it.blobId) {
      const blob = await db.blobs.get(it.blobId);
      if (blob) {
        const img = await loadImage(blob.data, blob.mime);
        /* object-fit: cover, like the on-screen item */
        const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const sw = w / s;
        const sh = h / s;
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w, h);
        ctx.clip();
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
      }
    } else if (it.kind === "text") {
      const bg = it.color ?? "#F3E3A8";
      ctx.shadowColor = "rgba(0,0,0,.25)";
      ctx.shadowBlur = fs * 0.6;
      ctx.shadowOffsetY = fs * 0.15;
      ctx.fillStyle = bg;
      roundRect(ctx, -w / 2, -h / 2, w, h, fs * 0.35);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = bestBW(bg);
      ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const pad = fs * 0.7;
      const lines = wrapLines(ctx, it.text ?? "", w - pad * 2);
      const lh = fs * 1.35;
      lines.forEach((ln, i) => {
        if (pad + (i + 1) * lh <= h + lh * 0.3) ctx.fillText(ln, -w / 2 + pad, -h / 2 + pad + i * lh);
      });
    }
    ctx.restore();
  }

  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("PNG encode failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
