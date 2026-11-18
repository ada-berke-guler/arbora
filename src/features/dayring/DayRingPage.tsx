import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "react-router-dom";
import { db, restoreRow, softDelete } from "../../db/schema";
import {
  activeTemplates,
  addRingTask,
  applyTemplate,
  clearDate,
  restoreMany,
  RingConflictError,
  saveTemplate,
  tasksForDate,
  undoApply,
  updateRingTask,
  updateTemplateFromDate,
} from "../../db/ring";
import type { RingTask, RingTemplate } from "../../db/types";
import { bestBW } from "../../lib/color";
import { addDays, todayLocal } from "../../lib/dates";
import { dur, fmt, normalizeSpan, parseHM, totalBlocked, DAY, HALF } from "../../lib/ringMath";
import { deriveRing } from "../../lib/theme";
import { useAppearance } from "../../lib/appearance";
import { showToast, showUndo } from "../../lib/undoBus";
import { fmtDate, useI18n, type TFn } from "../../i18n";
import { ColorPicker, DatePicker, TimePicker } from "../../components/Pickers";
import Modal from "../../components/Modal";
import Dial, { MiniDial } from "./Dial";
import "./dayring.css";

type TextMode = "auto" | "#FFFFFF" | "#000000";

export function conflictMessage(t: TFn, err: unknown, key: "ring.err.conflict" | "ring.err.moveConflict" = "ring.err.conflict"): string | null {
  if (err instanceof RingConflictError) {
    const w = err.with_;
    return t(key, { name: w.title, from: fmt(w.start), to: fmt(w.end ?? w.start) });
  }
  return null;
}

export default function DayRingPage() {
  const { t, locale } = useI18n();
  const { themeFor } = useAppearance();
  const theme = themeFor("dayring");
  const palette = useMemo(() => (theme.ring && theme.ring.length >= 6 ? theme.ring : deriveRing(theme)), [theme]);
  const today = todayLocal();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<"dial" | "saved">("dial");
  const [hot, setHot] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  useEffect(() => {
    const d = params.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setDate(d);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const tasks = useLiveQuery(() => tasksForDate(db, date), [date]);
  const templates = useLiveQuery(() => activeTemplates(db), []);
  const isToday = date === today;
  const dateLabel = fmtDate(date, locale, { weekday: "short", day: "numeric", month: "short" });

  if (!tasks || !templates) return null;

  async function onMove(task: RingTask, start: number): Promise<string | null> {
    const end = task.end === null ? null : start + (task.end - task.start);
    try {
      await updateRingTask(db, task.id, { start, end });
      setMsg(null);
      return null;
    } catch (err) {
      const m = conflictMessage(t, err, "ring.err.moveConflict");
      if (m) setMsg({ text: m });
      return m;
    }
  }

  const editingTask = tasks.find((x) => x.id === editing);

  return (
    <div className="dayring-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{fmtDate(date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="page-title">{t("ring.title")}</h1>
          <p className="page-subtitle">{t("ring.subtitle")}</p>
        </div>
        <div className="row">
          <div className="seg-control" role="tablist">
            <button role="tab" aria-selected={tab === "dial"} aria-pressed={tab === "dial"} onClick={() => setTab("dial")}>{t("ring.tab.dial")}</button>
            <button role="tab" aria-selected={tab === "saved"} aria-pressed={tab === "saved"} onClick={() => setTab("saved")}>
              {t("ring.tab.saved")} <span className="badge">{templates.length}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="date-nav">
        <button className="btn btn-small" aria-label={t("ring.prevDay")} onClick={() => setDate(addDays(date, -1))}>‹</button>
        <div className="date-nav-pick"><DatePicker value={date} onChange={setDate} ariaLabel={t("journal.date")} /></div>
        <button className="btn btn-small" aria-label={t("ring.nextDay")} onClick={() => setDate(addDays(date, 1))}>›</button>
        <button className="btn btn-small" disabled={isToday} onClick={() => setDate(today)}>{t("common.today")}</button>
      </div>

      {tab === "dial" ? (
        <div className="dayring-cols">
          <section className="dial-wrap" aria-label={t("ring.dialLabel")}>
            <Dial tasks={tasks} hot={hot} setHot={setHot} isToday={isToday} onMove={onMove}
              onActivate={(id) => setEditing(id)} dateLabel={dateLabel} />
          </section>

          <div className="stack">
            <AddPanel date={date} tasks={tasks} palette={palette} msg={msg} setMsg={setMsg} />
            <PlanList tasks={tasks} hot={hot} setHot={setHot} onEdit={setEditing} date={date} />
            <SaveDayPanel date={date} tasks={tasks} palette={palette} onSaved={() => setTab("saved")} />
          </div>
        </div>
      ) : (
        <SavedDays templates={templates} date={date} dateLabel={dateLabel} onApplied={() => setTab("dial")} />
      )}

      {editingTask && (
        <EditTask task={editingTask} palette={palette} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/* ── Add form (Gün Kadranı's "Aktivite ekle") ── */

function TextToggle({ mode, color, onChange }: { mode: TextMode; color: string; onChange: (m: TextMode) => void }) {
  const { t } = useI18n();
  const eff = mode === "auto" ? bestBW(color) : mode;
  return (
    <div className="txttoggle" role="group" aria-label={t("ring.textColor")}>
      <button type="button" className="txtbtn light" aria-pressed={eff === "#FFFFFF"} title={t("ring.textLight")} aria-label={t("ring.textLight")} onClick={() => onChange("#FFFFFF")}>A</button>
      <button type="button" className="txtbtn dark" aria-pressed={eff === "#000000"} title={t("ring.textDark")} aria-label={t("ring.textDark")} onClick={() => onChange("#000000")}>A</button>
    </div>
  );
}

function AddPanel({ date, tasks, palette, msg, setMsg }: {
  date: string;
  tasks: RingTask[];
  palette: string[];
  msg: { text: string; ok?: boolean } | null;
  setMsg: (m: { text: string; ok?: boolean } | null) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"block" | "point">("block");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:30");
  const [color, setColor] = useState(palette[1] ?? palette[0]);
  const [textMode, setTextMode] = useState<TextMode>("auto");

  useEffect(() => {
    if (!palette.some((c) => c.toLowerCase() === color.toLowerCase())) setColor(palette[(tasks.length + 1) % palette.length]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const title = name.trim();
    if (!title) return setMsg({ text: t("ring.err.name") });
    const s = parseHM(start);
    const en = parseHM(end);
    if (s === null || (kind === "block" && en === null)) return setMsg({ text: t("ring.err.time") });
    let span: { start: number; end: number | null };
    if (kind === "block") {
      const n = normalizeSpan(s, en!);
      if (!n) return setMsg({ text: t("ring.err.same") });
      span = n;
    } else span = { start: s, end: null };
    try {
      await addRingTask(db, date, { title, ...span, color, textColor: textMode === "auto" ? null : textMode });
      setName("");
      setTextMode("auto");
      if (span.end !== null) {
        setStart(fmt(span.end));
        setEnd(fmt(span.end + 60));
      }
      const used = tasks.length + 1;
      setColor(palette[(used + 1) % palette.length]);
    } catch (err) {
      setMsg({ text: conflictMessage(t, err) ?? String(err) });
    }
  }

  async function clearAll() {
    if (tasks.length === 0) return;
    const ids = await clearDate(db, date);
    showUndo({ message: t("ring.clearedDay"), undo: () => void restoreMany(db, ids) });
  }

  return (
    <section className="panel">
      <h2 className="panel-title">{t("ring.add")}</h2>
      <form onSubmit={(e) => void submit(e)} autoComplete="off" noValidate>
        <div className="field">
          <div className="labelrow">
            <label htmlFor="ring-name" className="field-label">{t("ring.what")}</label>
            <TextToggle mode={textMode} color={color} onChange={setTextMode} />
          </div>
          <input id="ring-name" value={name} maxLength={40} placeholder={t("ring.whatPh")} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <span>{t("ring.kind")}</span>
          <div className="seg-control">
            <button type="button" aria-pressed={kind === "block"} onClick={() => setKind("block")}>{t("ring.kind.block")}</button>
            <button type="button" aria-pressed={kind === "point"} onClick={() => setKind("point")}>{t("ring.kind.point")}</button>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <span>{kind === "block" ? t("ring.from") : t("ring.when")}</span>
            <TimePicker value={start} onChange={setStart} ariaLabel={kind === "block" ? t("ring.from") : t("ring.when")} />
          </div>
          {kind === "block" && (
            <div className="field">
              <span>{t("ring.until")}</span>
              <TimePicker value={end} onChange={setEnd} ariaLabel={t("ring.until")} />
            </div>
          )}
        </div>
        <div className="field">
          <span>{t("common.color")}</span>
          <ColorPicker colors={palette} value={color} onChange={setColor} label={t("common.color")} />
        </div>
        <div className="form-actions" style={{ justifyContent: "stretch" }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{t("ring.addBtn")}</button>
          <button type="button" className="btn" onClick={() => void clearAll()} disabled={tasks.length === 0}>{t("ring.clearAll")}</button>
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : ""}`} role="alert">{msg.text}</p>}
      </form>
    </section>
  );
}

/* ── List grouped by ring ── */

function PlanList({ tasks, hot, setHot, onEdit, date }: {
  tasks: RingTask[];
  hot: string | null;
  setHot: (id: string | null) => void;
  onEdit: (id: string) => void;
  date: string;
}) {
  const { t, lang } = useI18n();
  const full = totalBlocked(tasks);
  const free = Math.max(0, DAY - full);
  const groups: [string, RingTask[]][] = [
    [t("ring.innerGroup"), tasks.filter((x) => x.start < HALF)],
    [t("ring.outerGroup"), tasks.filter((x) => x.start >= HALF)],
  ];

  function remove(task: RingTask) {
    void softDelete(db, "ringTasks", task.id);
    showUndo({ message: t("ring.removed", { name: task.title }), undo: () => void restoreRow(db, "ringTasks", task.id) });
  }

  return (
    <section className="panel plan-panel" aria-label={t("ring.plan")}>
      <div className="panel-head">
        <h2 className="panel-title">{t("ring.plan")}</h2>
        <span className="muted mono" style={{ fontSize: ".72rem" }}>{t("ring.count", { n: tasks.length })}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="empty-hint">{t("ring.empty")}</p>
      ) : (
        groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
          <div key={label}>
            <p className="group-label">{label}</p>
            <ul className="plan-list">
              {list.map((task) => (
                <li key={task.id} className={hot === task.id ? "is-hot" : ""} data-date={date}
                  onPointerEnter={() => setHot(task.id)} onPointerLeave={() => setHot(null)}>
                  <span className="chipbar" style={{ background: task.color }} />
                  <button className="li-main" onClick={() => onEdit(task.id)} aria-label={`${t("common.edit")}: ${task.title}`}>
                    <span className="li-name">{task.title}</span>
                    <span className="li-time">
                      {task.end === null
                        ? fmt(task.start)
                        : `${fmt(task.start)} – ${fmt(task.end)}  ·  ${dur(task.end - task.start, lang)}${task.end > DAY ? `  ·  ${t("ring.crosses")}` : ""}`}
                    </span>
                  </button>
                  <button className="del" aria-label={t("ring.removeX", { name: task.title })} onClick={() => remove(task)}>×</button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <div className="legend-foot">
        <span>{t("ring.full", { d: dur(full, lang) })}</span>
        <span>{t("ring.free", { d: dur(free, lang) })}</span>
      </div>
    </section>
  );
}

/* ── Save this day ── */

function SaveDayPanel({ date, tasks, palette, onSaved }: { date: string; tasks: RingTask[]; palette: string[]; onSaved: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(palette[0]);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const label = name.trim();
    if (!label) return setMsg({ text: t("ring.saveNameErr") });
    if (tasks.length === 0) return setMsg({ text: t("ring.saveEmpty") });
    await saveTemplate(db, date, label, color);
    setName("");
    setMsg(null);
    showToast(t("ring.saved", { name: label }));
    onSaved();
  }

  return (
    <section className="panel">
      <div className="panel-head" style={{ marginBottom: open ? ".9rem" : 0 }}>
        <h2 className="panel-title">{t("ring.saveDay")}</h2>
        <button className="btn btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("ring.collapse") : t("ring.open")}
        </button>
      </div>
      {open && (
        <form onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>{t("ring.saveDayName")}</span>
            <input value={name} maxLength={34} placeholder={t("ring.saveDayPh")} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="field">
            <span>{t("ring.saveDayColor")}</span>
            <ColorPicker colors={palette} value={color} onChange={setColor} label={t("ring.saveDayColor")} />
          </div>
          <button type="submit" className="btn btn-primary btn-block">{t("ring.saveDayBtn")}</button>
          {msg && <p className={`msg ${msg.ok ? "ok" : ""}`} role="alert">{msg.text}</p>}
        </form>
      )}
    </section>
  );
}

/* ── Saved days gallery ── */

function SavedDays({ templates, date, dateLabel, onApplied }: { templates: RingTemplate[]; date: string; dateLabel: string; onApplied: () => void }) {
  const { t, lang } = useI18n();

  async function apply(tpl: RingTemplate) {
    const res = await applyTemplate(db, tpl.id, date);
    showUndo({ message: t("ring.applied", { name: tpl.name }), undo: () => void undoApply(db, res) });
    onApplied();
  }

  return (
    <section>
      <div className="savedhead">
        <h2 className="saved-title">{t("ring.savedHead")}</h2>
        <p className="muted">{t("ring.savedLead", { date: dateLabel })}</p>
      </div>
      {templates.length === 0 ? (
        <div className="bigempty">{t("ring.savedEmpty")}</div>
      ) : (
        <div className="savedgrid">
          {templates.map((tpl) => (
            <article key={tpl.id} className="daycard">
              <button className="daycard-dial" onClick={() => void apply(tpl)} aria-label={t("ring.applyX", { name: tpl.name })}>
                <MiniDial tasks={tpl.tasks} color={tpl.color} />
              </button>
              <p className="dayname">{tpl.name}</p>
              <p className="daymeta">{t("ring.tplMeta", { n: tpl.tasks.length, d: dur(totalBlocked(tpl.tasks), lang) })}</p>
              <div className="rowbtns">
                <button className="btn btn-small" onClick={() => void apply(tpl)}>{t("ring.load")}</button>
                <button className="btn btn-small" title={t("ring.overwrite")} onClick={() => {
                  void updateTemplateFromDate(db, tpl.id, date).then(() => showToast(t("ring.updated", { name: tpl.name })));
                }}>↻</button>
                <button className="btn btn-small btn-danger" aria-label={`${t("common.delete")}: ${tpl.name}`} onClick={() => {
                  void softDelete(db, "ringTemplates", tpl.id);
                  showUndo({ message: t("ring.tplRemoved", { name: tpl.name }), undo: () => void restoreRow(db, "ringTemplates", tpl.id) });
                }}>{t("common.delete")}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Edit dialog ── */

function EditTask({ task, palette, onClose }: { task: RingTask; palette: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(task.title);
  const [kind, setKind] = useState<"block" | "point">(task.end === null ? "point" : "block");
  const [start, setStart] = useState(fmt(task.start));
  const [end, setEnd] = useState(fmt(task.end ?? task.start + 60));
  const [color, setColor] = useState(task.color);
  const [textMode, setTextMode] = useState<TextMode>((task.textColor as TextMode) ?? "auto");
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const s = parseHM(start);
    const en = parseHM(end);
    if (s === null || (kind === "block" && en === null)) return setMsg(t("ring.err.time"));
    let span: { start: number; end: number | null } = { start: s, end: null };
    if (kind === "block") {
      const n = normalizeSpan(s, en!);
      if (!n) return setMsg(t("ring.err.same"));
      span = n;
    }
    try {
      await updateRingTask(db, task.id, {
        title: name.trim() || task.title,
        ...span,
        color,
        textColor: textMode === "auto" ? null : textMode,
      });
      onClose();
    } catch (err) {
      setMsg(conflictMessage(t, err) ?? String(err));
    }
  }

  function remove() {
    onClose();
    void softDelete(db, "ringTasks", task.id);
    showUndo({ message: t("ring.removed", { name: task.title }), undo: () => void restoreRow(db, "ringTasks", task.id) });
  }

  return (
    <Modal title={<><span className="dot" style={{ background: color }} />{t("ring.edit")}</>} label={t("ring.edit")} onClose={onClose}>
      <div className="field">
        <div className="labelrow">
          <label htmlFor="ring-edit-name" className="field-label">{t("ring.what")}</label>
          <TextToggle mode={textMode} color={color} onChange={setTextMode} />
        </div>
        <input id="ring-edit-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <span>{t("ring.kind")}</span>
        <div className="seg-control">
          <button type="button" aria-pressed={kind === "block"} onClick={() => setKind("block")}>{t("ring.kind.block")}</button>
          <button type="button" aria-pressed={kind === "point"} onClick={() => setKind("point")}>{t("ring.kind.point")}</button>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <span>{kind === "block" ? t("ring.from") : t("ring.when")}</span>
          <TimePicker value={start} onChange={setStart} ariaLabel={t("ring.from")} />
        </div>
        {kind === "block" && (
          <div className="field">
            <span>{t("ring.until")}</span>
            <TimePicker value={end} onChange={setEnd} ariaLabel={t("ring.until")} />
          </div>
        )}
      </div>
      <div className="field">
        <span>{t("common.color")}</span>
        <ColorPicker colors={palette} value={color} onChange={setColor} label={t("common.color")} />
      </div>
      {msg && <p className="msg" role="alert">{msg}</p>}
      <div className="form-actions">
        <button className="btn btn-danger" onClick={remove}>{t("common.delete")}</button>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => void save()}>{t("common.save")}</button>
      </div>
    </Modal>
  );
}
