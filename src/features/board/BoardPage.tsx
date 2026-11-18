import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, putSetting, restoreRow, softDelete } from "../../db/schema";
import {
  activeBoards,
  addBoard,
  addImageItem,
  addTextItem,
  bringToFront,
  clampSide,
  itemsForBoard,
  noteFontSize,
  sendToBack,
  SIZE_PRESETS,
  updateBoard,
  updateItem,
  type Transform,
} from "../../db/board";
import type { Board, BoardItem } from "../../db/types";
import { bestBW } from "../../lib/color";
import { showToast, showUndo } from "../../lib/undoBus";
import { useI18n, type DictKey } from "../../i18n";
import Modal from "../../components/Modal";
import Icon from "../../components/Icons";
import { ColorPicker } from "../../components/Pickers";
import { exportBoardPng } from "./exportBoard";
import { shrinkImage } from "./shrinkImage";
import "./board.css";

const NOTE_COLORS = ["#F3E3A8", "#F6C6C0", "#C9E4C5", "#BFD7F2", "#E2CCF0", "#FFFFFF", "#1C1B18", "#C9A96E"];
const BG_COLORS = ["#0F0E0C", "#1A1F2E", "#F4F0E6", "#EEF2F5", "#16101E", "#1E211E", "#F2E8CF", "#FFFFFF"];

export default function BoardPage() {
  const { t } = useI18n();
  const boards = useLiveQuery(() => activeBoards(db), []);
  const lastId = useLiveQuery(async () => ({ v: await getSetting<string>(db, "board.active") }));
  const [creating, setCreating] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Board | null>(null);
  if (!boards || !lastId) return null;
  const active = boards.find((b) => b.id === lastId.v) ?? boards[0] ?? null;

  return (
    <div className="board-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("nav.board")}</h1>
          <p className="page-subtitle">{t("board.subtitle")}</p>
        </div>
      </header>

      <div className="board-tabs" role="tablist">
        {boards.map((b) => (
          <button key={b.id} role="tab" aria-selected={active?.id === b.id} className={`board-tab ${active?.id === b.id ? "is-active" : ""}`}
            onClick={() => void putSetting(db, "board.active", b.id)}>
            <span className="board-tab-shape" style={{ aspectRatio: `${b.width} / ${b.height}`, background: b.background }} />
            <span>{b.name}</span>
            <span className="mono muted">{b.width}×{b.height}</span>
          </button>
        ))}
        <button className="board-tab board-tab-new" onClick={() => setCreating(true)}>
          <Icon name="plus" /> <span>{t("board.new")}</span>
        </button>
      </div>

      {active ? (
        <BoardEditor key={active.id} board={active} onSettings={() => setSettingsFor(active)} />
      ) : (
        <div className="bigempty">
          <p style={{ marginBottom: "1rem" }}>{t("board.noBoards")}</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>{t("board.new")}</button>
        </div>
      )}

      {creating && <BoardSettings onClose={() => setCreating(false)} />}
      {settingsFor && <BoardSettings board={settingsFor} onClose={() => setSettingsFor(null)} />}
    </div>
  );
}

/* ── create / edit a board ── */

function BoardSettings({ board, onClose }: { board?: Board; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(board?.name ?? t("board.defaultName"));
  const [w, setW] = useState(board?.width ?? 1080);
  const [h, setH] = useState(board?.height ?? 2400);
  const [bg, setBg] = useState(board?.background ?? BG_COLORS[0]);
  const preset = SIZE_PRESETS.find((p) => p.w === w && p.h === h)?.id ?? "custom";

  async function save() {
    onClose();
    if (board) await updateBoard(db, board.id, { name: name.trim() || board.name, width: w, height: h, background: bg });
    else {
      const b = await addBoard(db, { name: name.trim() || t("board.defaultName"), width: w, height: h, background: bg });
      await putSetting(db, "board.active", b.id);
    }
  }

  return (
    <Modal title={board ? t("board.settings") : t("board.new")} label={board ? t("board.settings") : t("board.new")} onClose={onClose}>
      <label className="field">
        <span>{t("common.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <div className="field">
        <span>{t("board.size")}</span>
        <div className="preset-grid">
          {SIZE_PRESETS.map((p) => (
            <button key={p.id} type="button" className={`preset ${preset === p.id ? "is-on" : ""}`} aria-pressed={preset === p.id}
              onClick={() => { setW(p.w); setH(p.h); }}>
              <span className="preset-shape" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
              <span className="preset-name">{t(`board.preset.${p.id}` as DictKey)}</span>
              <span className="mono muted">{p.w}×{p.h}</span>
            </button>
          ))}
          <button type="button" className={`preset ${preset === "custom" ? "is-on" : ""}`} aria-pressed={preset === "custom"}
            onClick={() => { if (preset !== "custom") { setW(1500); setH(1500); } }}>
            <span className="preset-shape preset-custom" />
            <span className="preset-name">{t("board.preset.custom")}</span>
            <span className="mono muted">W×H</span>
          </button>
        </div>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t("board.width")}</span>
          <input type="number" min={200} max={8000} value={w} onChange={(e) => setW(Number(e.target.value))} onBlur={() => setW(clampSide(w))} />
        </label>
        <button type="button" className="btn btn-icon swap-btn" aria-label="↔" title="↔" onClick={() => { setW(h); setH(w); }}>⇄</button>
        <label className="field">
          <span>{t("board.height")}</span>
          <input type="number" min={200} max={8000} value={h} onChange={(e) => setH(Number(e.target.value))} onBlur={() => setH(clampSide(h))} />
        </label>
      </div>
      <div className="field">
        <span>{t("board.background")}</span>
        <ColorPicker colors={BG_COLORS} value={bg} onChange={setBg} label={t("board.background")} />
      </div>
      <div className="form-actions">
        {board && (
          <button className="btn btn-danger" onClick={() => {
            onClose();
            void softDelete(db, "boards", board.id);
            showUndo({ message: t("board.removedBoard", { name: board.name }), undo: () => void restoreRow(db, "boards", board.id) });
          }}>{t("board.deleteBoard")}</button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => void save()}>{board ? t("common.saveChanges") : t("board.create")}</button>
      </div>
    </Modal>
  );
}

/* ── editor ── */

function BoardEditor({ board, onSettings }: { board: Board; onSettings: () => void }) {
  const { t } = useI18n();
  const items = useLiveQuery(() => itemsForBoard(db, board.id), [board.id]);
  const [sel, setSel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const selected = items?.find((i) => i.id === sel) ?? null;
  const fs = noteFontSize(board);

  /* fit the full-resolution board into the available space */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth || 800;
      const top = el.getBoundingClientRect().top;
      const maxH = Math.max(320, window.innerHeight - Math.max(0, top) - 40);
      setScale(Math.min(w / board.width, maxH / board.height));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [board.width, board.height, !!items]);

  function remove(item: BoardItem) {
    setSel(null);
    void softDelete(db, "boardItems", item.id);
    showUndo({ message: t(item.kind === "text" ? "board.removedNote" : "board.removedImage"), undo: () => void restoreRow(db, "boardItems", item.id) });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || !selected) return;
      if (document.querySelector(".modal")) return;
      if (e.key === "Delete" || e.key === "Backspace") remove(selected);
      else if (e.key === "Escape") setSel(null);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = (e.shiftKey ? 40 : 8);
        const tr = { ...selected.transform };
        if (e.key === "ArrowLeft") tr.x -= step;
        if (e.key === "ArrowRight") tr.x += step;
        if (e.key === "ArrowUp") tr.y -= step;
        if (e.key === "ArrowDown") tr.y += step;
        void updateItem(db, selected.id, { transform: tr });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    let n = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const { data, mime } = await shrinkImage(await f.arrayBuffer(), f.type);
      const dims = await probe(data, mime).catch(() => ({ w: 4, h: 3 }));
      const target = Math.min(board.width, board.height) * 0.45;
      const k = target / Math.max(dims.w, dims.h);
      const w = Math.round(dims.w * k);
      const h = Math.round(dims.h * k);
      await addImageItem(db, board.id, { data, mime }, {
        x: Math.round(board.width / 2 - w / 2 + n * fs),
        y: Math.round(board.height / 2 - h / 2 + n * fs),
        w,
        h,
      });
      n++;
    }
  }

  async function exportPng() {
    setExporting(true);
    try {
      await exportBoardPng(board, items ?? [], `${board.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "board"}-${board.width}x${board.height}.png`);
    } catch (err) {
      showToast(String(err));
    } finally {
      setExporting(false);
    }
  }

  if (!items) return null;

  return (
    <section className="board-editor">
      <div className="board-toolbar">
        <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="plus" size={16} />{t("board.images")}</button>
        <button className="btn" onClick={() => {
          const w = Math.round(board.width * 0.42);
          const h = Math.round(fs * 4.2);
          void addTextItem(db, board.id, t("board.newNote"), { x: Math.round(board.width / 2 - w / 2), y: Math.round(board.height / 2 - h / 2), w, h }, NOTE_COLORS[0]);
        }}><Icon name="plus" size={16} />{t("board.note")}</button>
        {selected && (
          <>
            <span className="toolbar-sep" />
            <button className="btn btn-small" onClick={() => void bringToFront(db, selected.id)}>{t("board.toFront")}</button>
            <button className="btn btn-small" onClick={() => void sendToBack(db, selected.id)}>{t("board.toBack")}</button>
            {selected.kind === "text" && (
              <div className="note-colors" aria-label={t("board.noteColor")}>
                {NOTE_COLORS.map((c) => (
                  <button key={c} className="swatch-btn swatch-sm" style={{ background: c }} aria-pressed={selected.color === c}
                    aria-label={`${t("board.noteColor")} ${c}`} onClick={() => void updateItem(db, selected.id, { color: c })} />
                ))}
              </div>
            )}
            <button className="btn btn-small btn-danger" onClick={() => remove(selected)}>{t("common.delete")}</button>
          </>
        )}
        <span className="spacer" />
        <button className="btn btn-icon btn-ghost" aria-label={t("board.settings")} title={t("board.settings")} onClick={onSettings}><Icon name="settings" /></button>
        <button className="btn btn-primary" disabled={exporting} onClick={() => void exportPng()}>
          <Icon name="download" size={16} />{exporting ? t("board.exporting") : t("board.export")}
        </button>
      </div>
      <p className="muted board-hint">{t("board.hint")}</p>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label={t("board.addImages")}
        onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />

      <div className="board-frame" ref={frameRef}>
        <div className="board-viewport" style={{ width: board.width * scale, height: board.height * scale }}>
          <div className="board-canvas" data-testid="board-canvas" role="region"
            aria-label={t("board.canvas", { name: board.name, w: board.width, h: board.height })}
            style={{ width: board.width, height: board.height, transform: `scale(${scale})`, background: board.background, "--note-fs": `${fs}px` } as React.CSSProperties}
            onPointerDown={() => setSel(null)}>
            {items.length === 0 && <p className="board-empty" style={{ color: bestBW(board.background), fontSize: fs }}>{t("board.empty")}</p>}
            {items.map((it) => (
              <ItemView key={it.id} item={it} scale={scale} selected={it.id === sel} onSelect={() => setSel(it.id)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type Mode = "move" | "resize" | "rotate";

function ItemView({ item, scale, selected, onSelect }: { item: BoardItem; scale: number; selected: boolean; onSelect: () => void }) {
  const { t } = useI18n();
  const [live, setLive] = useState<Transform | null>(null);
  const [editing, setEditing] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const tr = live ?? item.transform;
  const url = useBlobUrl(item.kind === "image" ? item.blobId : null);

  function start(e: React.PointerEvent, mode: Mode) {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const sx = e.clientX;
    const sy = e.clientY;
    const t0 = { ...item.transform };
    const rect = elRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : sx;
    const cy = rect ? rect.top + rect.height / 2 : sy;
    let next = t0;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 0) moved = true;
      if (mode === "move") next = { ...t0, x: Math.round(t0.x + dx), y: Math.round(t0.y + dy) };
      else if (mode === "resize") {
        const w = Math.max(60, t0.w + dx);
        /* images keep their aspect ratio; notes resize freely */
        const h = item.kind === "image" ? w * (t0.h / t0.w) : Math.max(40, t0.h + dy);
        next = { ...t0, w: Math.round(w), h: Math.round(h) };
      } else {
        let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
        if (!ev.shiftKey) a = Math.round(a / 5) * 5; // Shift = free rotation
        next = { ...t0, rot: Math.round(a) };
      }
      setLive(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLive(null);
      if (moved) void updateItem(db, item.id, { transform: next });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const color = item.color ?? NOTE_COLORS[0];
  const handle = Math.max(18, 22 / scale);

  return (
    <div ref={elRef} className={`board-item ${item.kind === "text" ? "is-note" : ""} ${selected ? "is-selected" : ""}`}
      data-item-id={item.id}
      tabIndex={0}
      onFocus={onSelect}
      style={{
        left: tr.x, top: tr.y, width: tr.w, height: tr.h, zIndex: item.z,
        transform: `rotate(${tr.rot}deg)`,
        ...(item.kind === "text" ? { background: color, color: bestBW(color) } : {}),
        "--handle": `${handle}px`, "--outline": `${Math.max(2, 2.5 / scale)}px`,
      } as React.CSSProperties}
      onPointerDown={(e) => start(e, "move")}
      onDoubleClick={() => item.kind === "text" && setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter" && item.kind === "text" && !editing) { e.preventDefault(); setEditing(true); } }}>
      {item.kind === "image" ? (
        url ? <img src={url} alt="" draggable={false} /> : <div className="img-loading" />
      ) : editing ? (
        <textarea className="note-editor" defaultValue={item.text ?? ""} autoFocus style={{ color: bestBW(color) }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
          onBlur={(e) => { setEditing(false); void updateItem(db, item.id, { text: e.target.value }); }} />
      ) : (
        <p className="note-text">{item.text}</p>
      )}
      {selected && !editing && (
        <>
          <button className="handle handle-rotate" aria-label={t("board.rotate")} onPointerDown={(e) => start(e, "rotate")} />
          <button className="handle handle-resize" aria-label={t("board.resize")} onPointerDown={(e) => start(e, "resize")} />
        </>
      )}
    </div>
  );
}

export function useBlobUrl(blobId: string | null): string | null {
  const row = useLiveQuery(() => (blobId ? db.blobs.get(blobId) : undefined), [blobId]);
  const url = useMemo(() => {
    if (!row || typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(new Blob([row.data], { type: row.mime }));
  }, [row?.id]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function probe(data: ArrayBuffer, mime: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    if (typeof URL.createObjectURL !== "function") return reject(new Error("no object URLs"));
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
