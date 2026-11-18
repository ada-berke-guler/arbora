import { useEffect, useRef, useState } from "react";
import type { RingTask } from "../../db/types";
import { bestBW } from "../../lib/color";
import {
  dur,
  fmt,
  findConflict,
  labelArc,
  labelFits,
  minuteAt,
  moveTo,
  polar,
  ringPieces,
  sectorPath,
  shouldFlip,
  snap,
  totalBlocked,
  HALF,
  DAY,
} from "../../lib/ringMath";
import { useI18n } from "../../i18n";

/* Gün Kadranı geometry: viewBox 620×632, inner band 92–170, outer band 192–268. */
const C = { cx: 310, cy: 310 };
const IN_R1 = 92;
const IN_R2 = 170;
const OUT_R1 = 192;
const OUT_R2 = 268;
const IN_LABEL_R = 181;
const OUT_LABEL_R = 284;
const IN_MID = (IN_R1 + IN_R2) / 2;
const OUT_MID = (OUT_R1 + OUT_R2) / 2;

interface Props {
  tasks: RingTask[];
  hot: string | null;
  setHot: (id: string | null) => void;
  isToday: boolean;
  /** Commit a drag. Return a conflict message to revert, or null on success. */
  onMove: (task: RingTask, start: number) => Promise<string | null>;
  onActivate: (id: string) => void;
  dateLabel: string;
}

interface Drag {
  id: string;
  offset: number; // minutes between the task start and the grab point
  startX: number;
  startY: number;
  moved: boolean;
  pointerId: number;
}

export default function Dial({ tasks, hot, setHot, isToday, onMove, onActivate, dateLabel }: Props) {
  const { t, lang } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: number } | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(iv);
  }, []);

  const shown = tasks.map((tk) => (preview && preview.id === tk.id ? moveTo(tk, preview.start) : tk));
  const free = Math.max(0, DAY - totalBlocked(shown));
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function svgPt(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg || !svg.getScreenCTM) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function onDown(e: React.PointerEvent, task: RingTask) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = svgPt(e);
    const at = minuteAt(p.x, p.y, C, IN_MID, OUT_MID);
    const offset = ((((at - task.start) % DAY) + DAY) % DAY + DAY / 2) % DAY - DAY / 2;
    setDrag({ id: task.id, offset, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId });
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / synthetic events */
    }
  }

  function onMovePtr(e: React.PointerEvent) {
    if (!drag) return;
    const moved = drag.moved || Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4;
    if (!moved) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    const p = svgPt(e);
    const at = minuteAt(p.x, p.y, C, IN_MID, OUT_MID);
    setPreview({ id: drag.id, start: ((snap(at - drag.offset) % DAY) + DAY) % DAY });
  }

  async function onUp() {
    if (!drag) return;
    const d = drag;
    const pv = preview;
    setDrag(null);
    if (!d.moved) {
      setPreview(null);
      onActivate(d.id);
      return;
    }
    const task = tasks.find((x) => x.id === d.id);
    if (task && pv && pv.start !== task.start) await onMove(task, pv.start);
    setPreview(null);
  }

  function onKey(e: React.KeyboardEvent, task: RingTask) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(task.id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      /* keyboard nudge: ±5 min (Shift: ±30), same conflict rules as dragging */
      e.preventDefault();
      const step = (e.shiftKey ? 30 : 5) * (e.key === "ArrowRight" ? 1 : -1);
      void onMove(task, (((task.start + step) % DAY) + DAY) % DAY);
    }
  }

  /* ── furniture: ticks + hour labels ── */
  const furniture: JSX.Element[] = [];
  for (let i = 0; i < 12; i++) {
    const m = i * 60;
    const major = i % 3 === 0;
    for (const [r1, r2] of [[IN_R1, IN_R2], [OUT_R1, OUT_R2]]) {
      const a = polar(r1, m, C);
      const b = polar(r2, m, C);
      furniture.push(<line key={`t${i}-${r1}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={`tick ${major ? "major" : ""}`} />);
    }
    const li = polar(IN_LABEL_R, m, C);
    const lo = polar(OUT_LABEL_R, m, C);
    furniture.push(
      <text key={`li${i}`} x={li[0]} y={li[1]} className={`hourlabel ${major ? "quarter" : ""}`}>{String(i).padStart(2, "0")}</text>,
      <text key={`lo${i}`} x={lo[0]} y={lo[1]} className={`hourlabel ${major ? "quarter" : ""}`}>{i + 12}</text>
    );
  }

  /* ── segments ── */
  const segs: JSX.Element[] = [];
  const labels: JSX.Element[] = [];
  shown.forEach((task) => {
    if (task.end === null) return;
    const end = task.end;
    const pieces = ringPieces({ start: task.start, end });
    pieces.forEach((pc, k) => {
      const [r1, r2] = pc.ring === "inner" ? [IN_R1, IN_R2] : [OUT_R1, OUT_R2];
      const d = sectorPath(r1, r2, pc.from, pc.to, C);
      const isHot = hot === task.id;
      const dragging = drag?.id === task.id && drag.moved;
      const clash = dragging && preview ? findConflict(moveTo(task, preview.start), tasks, task.id) : null;
      segs.push(
        <g
          key={`${task.id}-${k}`}
          className={`seg ${isHot ? "is-hot" : ""} ${dragging ? "is-dragging" : ""} ${clash ? "is-clash" : ""}`}
          data-id={task.id}
          role="button"
          tabIndex={k === 0 ? 0 : -1}
          aria-label={t("ring.blockLabel", { name: task.title, from: fmt(task.start), to: fmt(end) })}
          onPointerDown={(e) => onDown(e, task)}
          onPointerEnter={() => setHot(task.id)}
          onPointerLeave={() => setHot(null)}
          onFocus={() => setHot(task.id)}
          onBlur={() => setHot(null)}
          onKeyDown={(e) => onKey(e, task)}
        >
          <title>{`${task.title} · ${fmt(task.start)} – ${fmt(end)} · ${dur(end - task.start, lang)}`}</title>
          <path d={d} fill={task.color} className="seg-fill" />
          <path d={d} className="seg-outline" />
        </g>
      );
      const midR = (r1 + r2) / 2;
      if (labelFits(task.title.length, pc.from, pc.to, midR)) {
        const flip = shouldFlip(pc.from, pc.to);
        const pid = `arc-${task.id}-${k}`;
        labels.push(
          <g key={`l-${task.id}-${k}`} className="seglabel-g">
            <defs>
              <path id={pid} d={labelArc(midR, pc.from, pc.to, flip, C)} fill="none" />
            </defs>
            <text className="seglabel" fill={task.textColor ?? bestBW(task.color)} dy={flip ? -5 : 5}>
              <textPath href={`#${pid}`} startOffset="50%" textAnchor="middle">{task.title}</textPath>
            </text>
          </g>
        );
      }
    });
  });

  /* ── point tasks: a pin across the band ── */
  const pins = shown
    .filter((task) => task.end === null)
    .map((task) => {
      const inner = task.start < HALF;
      const m = task.start % HALF;
      const [r1, r2] = inner ? [IN_R1, IN_R2] : [OUT_R1, OUT_R2];
      const a = polar(r1 + 4, m, C);
      const b = polar(r2 - 4, m, C);
      const head = polar(r2 - 4, m, C);
      return (
        <g key={task.id} className={`pin ${hot === task.id ? "is-hot" : ""}`} data-id={task.id} role="button" tabIndex={0}
          aria-label={t("ring.pointLabel", { name: task.title, at: fmt(task.start) })}
          onPointerDown={(e) => onDown(e, task)} onPointerEnter={() => setHot(task.id)} onPointerLeave={() => setHot(null)}
          onFocus={() => setHot(task.id)} onBlur={() => setHot(null)} onKeyDown={(e) => onKey(e, task)}>
          <title>{`${task.title} · ${fmt(task.start)}`}</title>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={task.color} className="pin-line" />
          <circle cx={head[0]} cy={head[1]} r={7} fill={task.color} className="pin-head" />
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="pin-hit" />
        </g>
      );
    });

  /* now hand */
  const nowInner = nowMin < HALF;
  const nh1 = polar(nowInner ? IN_R1 - 4 : OUT_R1 - 4, nowMin % HALF, C);
  const nh2 = polar(nowInner ? IN_R2 + 4 : OUT_R2 + 4, nowMin % HALF, C);

  return (
    <svg
      ref={svgRef}
      className={`dial ${drag?.moved ? "is-dragging" : ""}`}
      viewBox="0 0 620 632"
      role="group"
      aria-label={t("ring.dialLabel")}
      onPointerMove={onMovePtr}
      onPointerUp={() => void onUp()}
      onPointerCancel={() => { setDrag(null); setPreview(null); }}
    >
      <circle cx={C.cx} cy={C.cy} r={OUT_R2} className="ring-outer-bg" />
      <circle cx={C.cx} cy={C.cy} r={OUT_R1} className="ring-gap" />
      <circle cx={C.cx} cy={C.cy} r={IN_R2} className="ring-inner-bg" />
      <circle cx={C.cx} cy={C.cy} r={IN_R1} className="ring-gap" />
      <g>{furniture}</g>
      <g>{segs}</g>
      <g>{pins}</g>
      <g className="labels">{labels}</g>
      {isToday && <line x1={nh1[0]} y1={nh1[1]} x2={nh2[0]} y2={nh2[1]} className="now-hand" />}

      <circle cx={C.cx} cy={C.cy} r={74} className="hub" />
      <text className="hublabel" x={C.cx} y={284}>{isToday ? t("ring.now") : dateLabel.toLocaleUpperCase(lang === "tr" ? "tr-TR" : "en-GB")}</text>
      <text className="hubtime" x={C.cx} y={316}>
        {preview ? fmt(preview.start) : isToday ? fmt(nowMin) : "--:--"}
      </text>
      <line x1={272} y1={328} x2={348} y2={328} className="hubrule" />
      <text className="hubfree" x={C.cx} y={347}>{t("ring.hubFree", { d: dur(free, lang) })}</text>
      <text className="dialcap" x={C.cx} y={624}>{t("ring.caption")}</text>
    </svg>
  );
}

/** Small read-only dial for saved days (Gün Kadranı's miniDial). */
export function MiniDial({ tasks, color }: { tasks: { start: number; end: number | null; color: string }[]; color: string }) {
  const c = { cx: 80, cy: 80 };
  const iR1 = 24, iR2 = 45, oR1 = 52, oR2 = 72;
  return (
    <svg viewBox="0 0 160 160" className="minidial" aria-hidden>
      <circle cx={80} cy={80} r={78} fill={color} />
      <circle cx={80} cy={80} r={oR2} className="ring-outer-bg" />
      <circle cx={80} cy={80} r={oR1} fill={color} />
      <circle cx={80} cy={80} r={iR2} className="ring-inner-bg" />
      <circle cx={80} cy={80} r={iR1} className="ring-gap" />
      {tasks.flatMap((tk, i) => {
        if (tk.end === null) {
          const inner = tk.start < HALF;
          const a = polar(inner ? iR1 : oR1, tk.start % HALF, c);
          const b = polar(inner ? iR2 : oR2, tk.start % HALF, c);
          return [<line key={`p${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={tk.color} strokeWidth={2.5} />];
        }
        return ringPieces({ start: tk.start, end: tk.end }).map((pc, k) => (
          <path key={`${i}-${k}`} d={pc.ring === "inner" ? sectorPath(iR1, iR2, pc.from, pc.to, c) : sectorPath(oR1, oR2, pc.from, pc.to, c)} fill={tk.color} />
        ));
      })}
    </svg>
  );
}
