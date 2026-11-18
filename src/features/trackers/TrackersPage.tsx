import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, restoreRow, softDelete } from "../../db/schema";
import { clearMood, moodSeries, saveMood, saveSleep, sleepDurationMin, sleepSeries } from "../../db/entries";
import type { MoodValue } from "../../db/types";
import { todayLocal } from "../../lib/dates";
import { dur } from "../../lib/ringMath";
import { showUndo } from "../../lib/undoBus";
import { fmtDate, useI18n } from "../../i18n";
import { DatePicker, TimePicker } from "../../components/Pickers";
import LineChart from "../../components/LineChart";
import "../pages.css";

export default function TrackersPage() {
  const { t } = useI18n();
  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("nav.trackers")}</h1>
          <p className="page-subtitle">{t("trackers.subtitle")}</p>
        </div>
      </header>
      <div className="stack">
        <SleepPanel />
        <MoodPanel />
      </div>
    </div>
  );
}

function SleepPanel() {
  const { t, lang, locale } = useI18n();
  const today = todayLocal();
  const [wake, setWake] = useState(today);
  const [bedT, setBedT] = useState("23:30");
  const [wakeT, setWakeT] = useState("07:30");
  const [showTimes, setShowTimes] = useState(false);
  const series = useLiveQuery(() => sleepSeries(db), []);
  if (!series) return null;
  const maxH = Math.max(10, ...series.map((s) => Math.ceil(s.durationMin / 60)));
  const short = (d: string) => fmtDate(d, locale, { day: "numeric", month: "short" });

  return (
    <section className="panel">
      <h2 className="panel-title">{t("trackers.sleep")}</h2>
      <div className="tracker-form">
        <div className="field"><span>{t("trackers.wokeOn")}</span><DatePicker value={wake} max={today} onChange={setWake} ariaLabel={t("trackers.wokeOn")} /></div>
        <div className="field"><span>{t("trackers.bed")}</span><TimePicker value={bedT} onChange={setBedT} ariaLabel={t("trackers.bed")} /></div>
        <div className="field"><span>{t("trackers.wake")}</span><TimePicker value={wakeT} onChange={setWakeT} ariaLabel={t("trackers.wake")} /></div>
        <div className="field tracker-submit">
          <span className="mono">{dur(sleepDurationMin(bedT, wakeT), lang)}</span>
          <button className="btn btn-primary" disabled={wake > today} onClick={() => void saveSleep(db, wake, bedT, wakeT)}>{t("trackers.log")}</button>
        </div>
      </div>
      <LineChart points={series.map((s) => ({ label: short(s.wakeDate), value: s.durationMin / 60 }))}
        yMin={0} yMax={maxH} yTicks={[0, Math.round(maxH / 2), maxH]} yFormat={(v) => (lang === "tr" ? `${Math.round(v * 10) / 10}s` : `${Math.round(v * 10) / 10}h`)}
        ariaLabel={t("trackers.sleepChart")} />
      {series.length > 0 && (
        <label className="check-row" style={{ marginTop: ".9rem" }}>
          <input type="checkbox" checked={showTimes} onChange={(e) => setShowTimes(e.target.checked)} />
          {t("trackers.showTimes")}
        </label>
      )}
      {showTimes && series.length > 0 && (
        <div className="table-wrap">
          <table className="times-table">
            <thead><tr><th>{t("trackers.day")}</th><th>{t("trackers.bed")}</th><th>{t("trackers.wake")}</th><th>{t("trackers.slept")}</th><th /></tr></thead>
            <tbody>
              {[...series].reverse().map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.wakeDate, locale, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="mono">{s.bedTime}</td>
                  <td className="mono">{s.wakeTime}</td>
                  <td className="mono">{dur(s.durationMin, lang)}</td>
                  <td>
                    <button className="del" aria-label={t("trackers.deleteSleep", { date: s.wakeDate })} onClick={() => {
                      void softDelete(db, "sleepEntries", s.id);
                      showUndo({ message: t("trackers.sleepRemoved", { date: s.wakeDate }), undo: () => void restoreRow(db, "sleepEntries", s.id) });
                    }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const MOODS: { value: MoodValue; mouth: string }[] = [
  { value: 1, mouth: "M8 17 Q12 13 16 17" },
  { value: 2, mouth: "M8 15.5 L16 15.5" },
  { value: 3, mouth: "M8 14 Q12 18 16 14" },
];

function MoodPanel() {
  const { t, locale } = useI18n();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const series = useLiveQuery(() => moodSeries(db), []);
  if (!series) return null;
  const current = series.find((m) => m.date === date)?.value ?? null;
  const label = (v: number) => t(v === 1 ? "trackers.mood.1" : v === 2 ? "trackers.mood.2" : "trackers.mood.3");

  return (
    <section className="panel">
      <h2 className="panel-title">{t("trackers.mood")}</h2>
      <div className="tracker-form">
        <div className="field"><span>{t("trackers.day")}</span><DatePicker value={date} max={today} onChange={setDate} ariaLabel={t("trackers.day")} /></div>
        <div className="field">
          <span>{t("trackers.howWas")}</span>
          <div className="mood-row" role="group" aria-label={t("trackers.mood")}>
            {MOODS.map((m) => (
              <button key={m.value} className="mood-btn" aria-pressed={current === m.value} aria-label={t("trackers.moodX", { v: label(m.value) })}
                onClick={() => void (current === m.value ? clearMood(db, date) : saveMood(db, date, m.value))}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="10" className="mood-face" />
                  <circle cx="8.5" cy="9.5" r="1.2" className="mood-eye" />
                  <circle cx="15.5" cy="9.5" r="1.2" className="mood-eye" />
                  <path d={m.mouth} className="mood-mouth" fill="none" />
                </svg>
                <span>{label(m.value)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <LineChart points={series.map((m) => ({ label: fmtDate(m.date, locale, { day: "numeric", month: "short" }), value: m.value }))}
        yMin={1} yMax={3} yTicks={[1, 2, 3]} yFormat={label} ariaLabel={t("trackers.moodChart")} />
    </section>
  );
}
