import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, restoreRow, softDelete } from "../../db/schema";
import { currentCycle } from "../../db/cycles";
import { momentsForRange, saveMoment } from "../../db/entries";
import { dayDetail } from "../../db/aggregate";
import type { Moment } from "../../db/types";
import { addMonths, monthBounds, monthGrid, monthKey, todayLocal } from "../../lib/dates";
import { dur, fmt } from "../../lib/ringMath";
import { showUndo } from "../../lib/undoBus";
import { fmtDate, monthName, useI18n, weekdayNames, type DictKey } from "../../i18n";
import Modal from "../../components/Modal";
import "../pages.css";

export default function MomentsPage() {
  const { t, locale } = useI18n();
  const today = todayLocal();
  const cycle = useLiveQuery(() => currentCycle(db));
  const [monthState, setMonthState] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  /* deep link ?date=YYYY-MM-DD: jump + open, then clear the param */
  useEffect(() => {
    const d = params.get("date");
    if (!d) return;
    setMonthState(monthKey(d));
    setOpenDay(d);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const first = cycle ? monthKey(cycle.startDate) : null;
  const last = cycle ? monthKey(cycle.endDate ?? today) : null;
  const want = monthState ?? monthKey(today);
  const month = first && last ? (want < first ? first : want > last ? last : want) : null;
  const bounds = month ? monthBounds(month) : null;
  const moments = useLiveQuery(
    () => (bounds ? momentsForRange(db, bounds.first, bounds.last) : undefined),
    [bounds?.first, bounds?.last]
  );
  if (!cycle || !month || !first || !last || !moments) return null;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("nav.calendar")}</h1>
          <p className="page-subtitle">{t("moments.subtitle")}</p>
        </div>
      </header>
      <div className="date-nav">
        <button className="btn btn-small" disabled={month <= first} onClick={() => setMonthState(addMonths(month, -1))} aria-label={t("common.prevMonth")}>‹</button>
        <span className="month-label">{monthName(month, locale)}</span>
        <button className="btn btn-small" disabled={month >= last} onClick={() => setMonthState(addMonths(month, 1))} aria-label={t("common.nextMonth")}>›</button>
      </div>

      <div className="calendar panel" role="grid" aria-label={t("moments.calendar", { month: monthName(month, locale) })} key={month}>
        <div className="calendar-head" role="row">
          {weekdayNames(locale).map((w) => <div key={w} role="columnheader" className="calendar-dow">{w}</div>)}
        </div>
        <div className="calendar-days">
          {monthGrid(month).map((d, i) =>
            d === null ? (
              <div key={`b${i}`} className="day day-blank" />
            ) : (
              <button key={d} data-date={d}
                className={`day ${d === today ? "is-today" : ""} ${moments.get(d) ? "has-moment" : ""}`}
                disabled={d < cycle.startDate || (cycle.endDate !== null && d > cycle.endDate) || d > today}
                aria-label={`${fmtDate(d, locale, { weekday: "long", day: "numeric", month: "long" })}${moments.get(d) ? `: ${moments.get(d)!.title}` : ""}`}
                onClick={() => setOpenDay(d)}>
                <span className="day-num">{Number(d.slice(8))}</span>
                {moments.get(d) && <span className="moment-title">{moments.get(d)!.title || "•"}</span>}
              </button>
            )
          )}
        </div>
      </div>

      {openDay && <MomentPopup date={openDay} cycleId={cycle.id} moment={moments.get(openDay) ?? null} onClose={() => setOpenDay(null)} />}
    </div>
  );
}

function MomentPopup({ date, cycleId, moment, onClose }: { date: string; cycleId: string; moment: Moment | null; onClose: () => void }) {
  const { t, lang, locale } = useI18n();
  const [title, setTitle] = useState(moment?.title ?? "");
  const [text, setText] = useState(moment?.text ?? "");
  const detail = useLiveQuery(() => dayDetail(db, date, cycleId), [date, cycleId]);
  const navigate = useNavigate();
  useEffect(() => {
    setTitle(moment?.title ?? "");
    setText(moment?.text ?? "");
  }, [date, moment?.id]);

  const has = detail && (detail.habits.length || detail.mood !== null || detail.sleep || detail.journal.length || detail.ring.length);

  return (
    <Modal title={fmtDate(date, locale, { weekday: "long", day: "numeric", month: "long" })} label={t("moments.dialog", { date })} onClose={onClose}>
      {has ? (
        <section className="day-detail">
          <h4 className="panel-title">{t("moments.logged")}</h4>
          {detail!.habits.length > 0 && (
            <ul className="day-habits">
              {detail!.habits.map((h) => (
                <li key={h.id}><span className="dot" style={{ background: h.color }} />{h.name}<span className="muted">{t(`habits.status.${h.status}` as DictKey)}</span></li>
              ))}
            </ul>
          )}
          {(detail!.mood !== null || detail!.sleep) && (
            <p className="day-line">
              {detail!.mood !== null && t("moments.mood", { v: t(`trackers.mood.${detail!.mood}` as DictKey) })}
              {detail!.mood !== null && detail!.sleep && " · "}
              {detail!.sleep && t("moments.slept", { d: dur(detail!.sleep.durationMin, lang), bed: detail!.sleep.bedTime, wake: detail!.sleep.wakeTime })}
            </p>
          )}
          {detail!.ring.length > 0 && (
            <button className="day-ring-link" onClick={() => { onClose(); navigate(`/dayring?date=${date}`); }}>
              <span className="panel-title" style={{ margin: 0 }}>{t("moments.plan")}</span>
              <span className="ring-chips">
                {detail!.ring.slice(0, 6).map((r) => (
                  <span key={r.id} className="ring-chip"><span className="dot" style={{ background: r.color }} />{fmt(r.start)} {r.title}</span>
                ))}
              </span>
            </button>
          )}
          {detail!.journal.map((e) => (
            <button key={e.id} className="day-journal" onClick={() => { onClose(); navigate(`/journal?entry=${e.id}`); }}>
              <span className="mono muted">{e.at.slice(11)}</span> {e.text.length > 90 ? `${e.text.slice(0, 90)}…` : e.text}
            </button>
          ))}
        </section>
      ) : null}
      <label className="field">
        <span>{t("moments.titleField")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("moments.titlePh")} autoFocus maxLength={80} />
      </label>
      <label className="field">
        <span>{t("moments.text")}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={t("moments.textPh")} />
      </label>
      <div className="form-actions">
        {moment && (
          <button className="btn btn-danger" onClick={() => {
            onClose();
            void softDelete(db, "moments", moment.id);
            showUndo({ message: t("moments.removed", { name: moment.title || "•" }), undo: () => void restoreRow(db, "moments", moment.id) });
          }}>{t("common.remove")}</button>
        )}
        <span className="spacer" />
        <button className="btn btn-primary" disabled={!title.trim() && !text.trim()} onClick={() => {
          onClose();
          void saveMoment(db, date, title.trim(), text.trim());
        }}>{t("moments.save")}</button>
      </div>
    </Modal>
  );
}
