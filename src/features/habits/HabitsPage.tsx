import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, putSetting, restoreRow, softDelete } from "../../db/schema";
import { currentCycle } from "../../db/cycles";
import { activeHabits, addHabit, habitStreak, habitTotals, logsForRange, setLogStatus, updateHabit, type HabitInput } from "../../db/habits";
import type { Cycle, Habit, HabitFrequency, HabitKind, HabitLogStatus, HabitSeverity } from "../../db/types";
import { addDays, todayLocal, weekDays, weekStart } from "../../lib/dates";
import { deriveRing } from "../../lib/theme";
import { useAppearance } from "../../lib/appearance";
import { showUndo } from "../../lib/undoBus";
import { fmtDate, useI18n, weekdayNames, type DictKey } from "../../i18n";
import { ColorPicker } from "../../components/Pickers";
import Modal from "../../components/Modal";
import { useHabitGesture } from "./useHabitGesture";
import "./habits.css";

export const GRID_REVEAL_MS = 1200;

export default function HabitsPage() {
  const { t } = useI18n();
  const [view, setView] = useState<"auto" | "manage" | "grid">("auto");
  const [weaving, setWeaving] = useState(false);
  /* the viewed week lives here so Manage ⇄ Grid round trips keep it */
  const [anchor, setAnchor] = useState<string | null>(null);
  const cycle = useLiveQuery(() => currentCycle(db));
  const done = useLiveQuery(
    async () => (cycle ? ((await getSetting<boolean>(db, `habitsOnboardingDone:${cycle.id}`)) ?? false) : undefined),
    [cycle?.id]
  );
  if (!cycle || done === undefined) return null;

  if (weaving) {
    return (
      <div className="weaving" role="status" aria-label={t("habits.weaving")}>
        <div className="setup-thread" />
        <p>{t("habits.weaving")}</p>
      </div>
    );
  }

  const eff = view === "auto" ? (done ? "grid" : "manage") : view;
  if (eff === "manage") {
    return (
      <ManageHabits
        cycle={cycle}
        firstTime={!done}
        onOpenGrid={() => {
          if (!done) {
            void putSetting(db, `habitsOnboardingDone:${cycle.id}`, true);
            setWeaving(true);
            window.setTimeout(() => {
              setWeaving(false);
              setView("grid");
            }, GRID_REVEAL_MS);
          } else setView("grid");
        }}
      />
    );
  }
  return <HabitGrid cycle={cycle} anchor={anchor} setAnchor={setAnchor} onManage={() => setView("manage")} />;
}

function useHabitPalette(): string[] {
  const { themeFor } = useAppearance();
  const th = themeFor("habits");
  return useMemo(() => (th.ring && th.ring.length >= 6 ? th.ring : deriveRing(th)), [th]);
}

/* ── Manage ── */

function ManageHabits({ cycle, firstTime, onOpenGrid }: { cycle: Cycle; firstTime: boolean; onOpenGrid: () => void }) {
  const { t } = useI18n();
  const [formKey, setFormKey] = useState(0);
  const habits = useLiveQuery(() => activeHabits(db, cycle.id), [cycle.id]);
  if (!habits) return null;
  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t(firstTime ? "habits.choose" : "habits.manage")}</h1>
          <p className="page-subtitle">{t(firstTime ? "habits.chooseLead" : "habits.manageLead")}</p>
        </div>
      </header>
      <div className="manage-cols">
        <section className="panel">
          <h2 className="panel-title">{t("habits.new")}</h2>
          <HabitForm key={`${formKey}-${habits.length}`} colorIndex={habits.length} submitLabel={t("habits.form.add")} onSubmit={(v) => {
            void addHabit(db, { ...v, cycleId: cycle.id });
            setFormKey((k) => k + 1);
          }} />
        </section>
        <section className="panel">
          <h2 className="panel-title">{t("habits.yours")} {habits.length > 0 && `· ${habits.length}`}</h2>
          {habits.length === 0 ? (
            <p className="empty-hint">{t("habits.emptyList")}</p>
          ) : (
            <ul className="staged-list">
              {habits.map((h) => (
                <li key={h.id} className="staged-item">
                  <span className="dot" style={{ background: h.color }} />
                  <span className="staged-name">{h.name}</span>
                  <span className="staged-meta">
                    {t(h.kind === "bad" ? "habits.breaking" : "habits.building")} ·{" "}
                    {h.frequency.kind === "daily" ? t("habits.daily") : t("habits.perWeek", { n: h.frequency.target })} ·{" "}
                    {t(`habits.sev.${h.severity}` as DictKey)}
                  </span>
                  <button className="del" aria-label={t("habits.removeX", { name: h.name })} onClick={() => {
                    void softDelete(db, "habits", h.id);
                    showUndo({ message: t("habits.removed", { name: h.name }), undo: () => void restoreRow(db, "habits", h.id) });
                  }}>×</button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-primary btn-block" style={{ marginTop: "1rem" }} disabled={habits.length === 0} onClick={onOpenGrid}>
            {t(firstTime ? "habits.createGrid" : "habits.openGrid")}
          </button>
        </section>
      </div>
    </div>
  );
}

type FormValues = Omit<HabitInput, "cycleId">;

function HabitForm({ initial, colorIndex = 0, submitLabel, onSubmit, onCancel }: {
  initial?: FormValues;
  colorIndex?: number;
  submitLabel: string;
  onSubmit: (v: FormValues) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const palette = useHabitPalette();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<HabitKind>(initial?.kind ?? "good");
  const [severity, setSeverity] = useState<HabitSeverity>(initial?.severity ?? "good-to-do");
  const [freq, setFreq] = useState<HabitFrequency["kind"]>(initial?.frequency.kind ?? "daily");
  const [target, setTarget] = useState(initial?.frequency.kind === "perWeek" ? initial.frequency.target : 3);
  const [color, setColor] = useState(initial?.color ?? palette[colorIndex % palette.length]);

  function submit() {
    const n = name.trim();
    if (!n) return;
    onSubmit({ name: n, kind, severity, color, frequency: freq === "daily" ? { kind: "daily" } : { kind: "perWeek", target } });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="field">
        <span>{t("habits.form.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("habits.form.namePh")} autoFocus maxLength={60} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t("habits.form.type")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as HabitKind)}>
            <option value="good">{t("habits.form.good")}</option>
            <option value="bad">{t("habits.form.bad")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("habits.form.priority")}</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as HabitSeverity)}>
            {(["essential", "good-to-do", "optional"] as const).map((s) => (
              <option key={s} value={s}>{t(`habits.sev.${s}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t("habits.form.frequency")}</span>
          <select value={freq} onChange={(e) => setFreq(e.target.value as HabitFrequency["kind"])}>
            <option value="daily">{t("habits.form.everyDay")}</option>
            <option value="perWeek">{t("habits.form.timesPerWeek")}</option>
          </select>
        </label>
        {freq === "perWeek" && (
          <label className="field">
            <span>{t("habits.form.target")}</span>
            <input type="number" min={1} max={7} value={target}
              onChange={(e) => setTarget(Math.min(7, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
        )}
      </div>
      <div className="field">
        <span>{t("common.color")}</span>
        <ColorPicker colors={palette} value={color} onChange={setColor} label={t("common.color")} />
      </div>
      <div className="form-actions">
        {onCancel && <button type="button" className="btn" onClick={onCancel}>{t("common.cancel")}</button>}
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

/* ── Grid ── */

function HabitGrid({ cycle, anchor: raw, setAnchor, onManage }: {
  cycle: Cycle;
  anchor: string | null;
  setAnchor: (a: string) => void;
  onManage: () => void;
}) {
  const { t, locale } = useI18n();
  const today = todayLocal();
  const firstWeek = weekStart(cycle.startDate);
  const lastWeek = weekStart(cycle.endDate ?? today);
  const want = raw ?? weekStart(today < cycle.startDate ? cycle.startDate : today);
  const anchor = want < firstWeek ? firstWeek : want > lastWeek ? lastWeek : want;
  const dates = useMemo(() => weekDays(anchor), [anchor]);
  const habits = useLiveQuery(() => activeHabits(db, cycle.id), [cycle.id]);
  const logs = useLiveQuery(() => logsForRange(db, dates[0], dates[6]), [dates[0], dates[6]]);
  const [detail, setDetail] = useState<{ habit: Habit; date: string } | null>(null);
  const dows = weekdayNames(locale);
  if (!habits || !logs) return null;

  const fd = (d: string) => fmtDate(d, locale, { day: "numeric", month: "short" });

  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("nav.habits")}</h1>
          <p className="page-subtitle">{t("habits.subtitle")}</p>
        </div>
        <button className="btn" onClick={onManage}>{t("habits.manage")}</button>
      </header>

      <div className="date-nav">
        <button className="btn btn-small" disabled={anchor <= firstWeek} onClick={() => setAnchor(addDays(anchor, -7))} aria-label={t("habits.prevWeek")}>‹</button>
        <span className="week-label mono">{fd(dates[0])} – {fd(dates[6])}</span>
        <button className="btn btn-small" disabled={anchor >= lastWeek} onClick={() => setAnchor(addDays(anchor, 7))} aria-label={t("habits.nextWeek")}>›</button>
        <button className="btn btn-small" onClick={() => setAnchor(weekStart(today))}>{t("common.today")}</button>
      </div>

      <div className="habit-grid-wrap panel">
        <div className="habit-grid" role="grid" aria-label={t("habits.gridLabel")}>
          <div className="grid-row grid-head" role="row">
            <div className="cell-name" role="columnheader">{t("habits.habit")}</div>
            {dates.map((d, i) => (
              <div key={d} role="columnheader" className={`cell-day ${d === today ? "is-today" : ""}`}>
                <span className="dow">{dows[i]}</span>
                <span className="dom">{Number(d.slice(8))}</span>
              </div>
            ))}
          </div>
          {habits.map((h) => (
            <div className="grid-row" role="row" key={h.id}>
              <div className="cell-name" role="rowheader">
                <button className="name-btn" onClick={() => setDetail({ habit: h, date: today })}>
                  <span className="dot" style={{ background: h.color }} />
                  <span className="habit-name">{h.name}</span>
                  {h.severity === "essential" && <span className="sev" title={t("habits.sev.essential")}>!</span>}
                  {h.kind === "bad" && <span className="sev" title={t("habits.form.bad")}>⌀</span>}
                </button>
              </div>
              {dates.map((d) => (
                <Cell key={d} habit={h} date={d} status={logs.get(`${h.id}|${d}`) ?? null}
                  disabled={d < cycle.startDate || (cycle.endDate !== null && d > cycle.endDate) || d > today}
                  onHold={() => setDetail({ habit: h, date: d })} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {detail && <HabitDetail habit={detail.habit} date={detail.date} weekDates={dates} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Cell({ habit, date, status, disabled, onHold }: {
  habit: Habit;
  date: string;
  status: HabitLogStatus | null;
  disabled: boolean;
  onHold: () => void;
}) {
  const { t, locale } = useI18n();
  const g = useHabitGesture({
    onSingle: () => void setLogStatus(db, habit.id, date, status === "partial" ? null : "partial"),
    onDouble: () => void setLogStatus(db, habit.id, date, status === "done" ? null : "done"),
    onSkip: () => void setLogStatus(db, habit.id, date, status === "skipped" ? null : "skipped"),
    onHold,
    disabled,
  });
  const label = t(status === "done" ? "habits.status.done" : status === "partial" ? "habits.status.partial" : status === "skipped" ? "habits.status.skipped" : "habits.status.none");
  return (
    <div className="cell-day" role="gridcell">
      <button className={`mark mark-${status ?? "empty"}`} style={{ "--habit": habit.color } as React.CSSProperties}
        data-status={status ?? "empty"} data-date={date} disabled={disabled}
        aria-label={t("habits.cellLabel", { name: habit.name, date: fmtDate(date, locale, { weekday: "long", day: "numeric", month: "long" }), status: label })}
        {...g} />
    </div>
  );
}

function HabitDetail({ habit, date, weekDates, onClose }: { habit: Habit; date: string; weekDates: string[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const today = todayLocal();
  const totals = useLiveQuery(() => habitTotals(db, habit.id), [habit.id]);
  const streak = useLiveQuery(() => habitStreak(db, habit.id, today), [habit.id]);
  const week = useLiveQuery(() => logsForRange(db, weekDates[0], weekDates[6]), [weekDates[0], weekDates[6]]);
  const dayStatus = useLiveQuery(async () => ({ s: (await logsForRange(db, date, date)).get(`${habit.id}|${date}`) ?? null }), [habit.id, date]);
  const weekDone = weekDates.filter((d) => week?.get(`${habit.id}|${d}`) === "done").length;
  const target = habit.frequency.kind === "daily" ? 7 : habit.frequency.target;
  const canMark = date <= today;

  return (
    <Modal title={<><span className="dot" style={{ background: habit.color }} />{habit.name}</>} label={t("habits.detail", { name: habit.name })} onClose={onClose}>
      <div className="stats">
        <div className="stat"><span className="stat-value">{weekDone}<span className="stat-sub">/{target}</span></span><span className="stat-label">{t("habits.doneThisWeek")}</span></div>
        <div className="stat"><span className="stat-value">{totals?.done ?? "–"}</span><span className="stat-label">{t("habits.doneInCycle")}</span></div>
        <div className="stat"><span className="stat-value">{totals?.partial ?? "–"}</span><span className="stat-label">{t("habits.partialInCycle")}</span></div>
        <div className="stat"><span className="stat-value">{streak ?? "–"}</span><span className="stat-label">{t("habits.streak")}</span></div>
      </div>
      {canMark && dayStatus && (
        <div className="field">
          <span>{t("habits.markDay", { date: fmtDate(date, locale, { weekday: "long", day: "numeric", month: "long" }) })}</span>
          <div className="seg-control mark-seg">
            {(["partial", "done", "skipped"] as const).map((s) => (
              <button key={s} aria-pressed={dayStatus.s === s} onClick={() => void setLogStatus(db, habit.id, date, dayStatus.s === s ? null : s)}>
                {t(`habits.status.${s}`)}
              </button>
            ))}
            <button aria-pressed={false} disabled={!dayStatus.s} onClick={() => void setLogStatus(db, habit.id, date, null)}>{t("habits.clear")}</button>
          </div>
        </div>
      )}
      <h4 className="panel-title" style={{ marginTop: "1rem" }}>{t("common.edit")}</h4>
      <HabitForm initial={habit} submitLabel={t("common.saveChanges")} onCancel={onClose}
        onSubmit={(v) => { onClose(); void updateHabit(db, habit.id, v); }} />
    </Modal>
  );
}
