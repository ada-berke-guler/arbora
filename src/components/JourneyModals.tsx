import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/schema";
import { DEFAULT_JOURNEY_DAYS, journeyEndDate, journeySpan, MAX_JOURNEY_DAYS, startJourney, updateJourney } from "../db/cycles";
import { journeyRecap } from "../db/aggregate";
import { dur } from "../lib/ringMath";
import { addDays, todayLocal } from "../lib/dates";
import type { Cycle } from "../db/types";
import { fmtDate, useI18n } from "../i18n";
import Modal from "./Modal";
import { DatePicker } from "./Pickers";

export function JourneySettings({ cycle, onClose }: { cycle: Cycle; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [name, setName] = useState(cycle.name);
  const [endDate, setEndDate] = useState(cycle.endDate ?? journeyEndDate(cycle.startDate, DEFAULT_JOURNEY_DAYS));
  const span = journeySpan(cycle.startDate, endDate);
  return (
    <Modal title={t("journey.settings")} label={t("journey.settings")} onClose={onClose}>
      <label className="field">
        <span>{t("common.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t("journey.started")}</span>
          <input value={fmtDate(cycle.startDate, locale, { day: "numeric", month: "short", year: "numeric" })} disabled />
        </label>
        <div className="field">
          <span>{t("journey.ends")}</span>
          <DatePicker value={endDate} min={cycle.startDate} max={addDays(cycle.startDate, MAX_JOURNEY_DAYS - 1)} ariaLabel={t("journey.ends")} onChange={setEndDate} />
        </div>
      </div>
      <p className="duration-preview">{t("journey.span", span)}</p>
      <div className="form-actions">
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => { onClose(); void updateJourney(db, cycle.id, { name, endDate }); }}>
          {t("common.saveChanges")}
        </button>
      </div>
    </Modal>
  );
}

export function NewJourney({ previous, onClose }: { previous: Cycle; onClose: () => void }) {
  const { t } = useI18n();
  const today = todayLocal();
  const minStart = previous.endDate ? addDays(previous.endDate, 1) : today;
  const first = minStart > today ? minStart : today;
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(first);
  const [endDate, setEndDate] = useState(() => journeyEndDate(first, DEFAULT_JOURNEY_DAYS));
  const span = journeySpan(startDate, endDate);
  function onStart(d: string) {
    setStartDate(d);
    if (endDate < d) setEndDate(d);
    else if (endDate > addDays(d, MAX_JOURNEY_DAYS - 1)) setEndDate(addDays(d, MAX_JOURNEY_DAYS - 1));
  }
  return (
    <Modal title={t("journey.newTitle")} label={t("journey.newTitle")} onClose={onClose}>
      <label className="field">
        <span>{t("common.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("journey.defaultName")} maxLength={60} />
      </label>
      <div className="field-row">
        <div className="field">
          <span>{t("journey.starts")}</span>
          <DatePicker value={startDate} min={minStart} max={today >= minStart ? today : minStart} ariaLabel={t("journey.starts")} onChange={onStart} />
        </div>
        <div className="field">
          <span>{t("journey.ends")}</span>
          <DatePicker value={endDate} min={startDate} max={addDays(startDate, MAX_JOURNEY_DAYS - 1)} ariaLabel={t("journey.ends")} onChange={setEndDate} />
        </div>
      </div>
      <p className="duration-preview">{t("journey.span", span)}</p>
      <div className="form-actions">
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => { onClose(); void startJourney(db, startDate, name.trim() || t("journey.defaultName"), span.days); }}>
          {t("journey.begin")}
        </button>
      </div>
    </Modal>
  );
}

export function Recap({ cycle, onClose, onStartNew }: { cycle: Cycle; onClose: () => void; onStartNew?: () => void }) {
  const { t, lang, locale } = useI18n();
  const s = useLiveQuery(() => journeyRecap(db, cycle), [cycle.id]);
  if (!s) return null;
  const moodLabel = (v: number) => t(v < 1.7 ? "trackers.mood.1" : v < 2.4 ? "trackers.mood.2" : "trackers.mood.3");
  const fd = (d: string) => fmtDate(d, locale, { day: "numeric", month: "short", year: "numeric" });
  return (
    <Modal title={t("recap.title", { name: cycle.name })} label={t("recap.title", { name: cycle.name })} onClose={onClose}>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        {fd(cycle.startDate)} → {cycle.endDate ? fd(cycle.endDate) : "…"}
        {cycle.endDate && ` · ${t("journey.span", journeySpan(cycle.startDate, cycle.endDate))}`}
      </p>
      <div className="stats">
        <Stat v={s.habitsDone} l={t("recap.habitsDone")} />
        <Stat v={s.habitsPartial} l={t("recap.habitsPartial")} />
        <Stat v={s.moments} l={t("recap.moments")} />
        <Stat v={s.journalEntries} l={t("recap.journal")} />
        <Stat v={s.avgSleepMin === null ? "–" : dur(s.avgSleepMin, lang)} l={t("recap.sleep", { n: s.sleepNights })} />
        <Stat v={s.avgMood === null ? "–" : moodLabel(s.avgMood)} l={t("recap.mood")} />
        <Stat v={dur(s.plannedMinutes, lang)} l={t("recap.planned")} />
      </div>
      {s.identityStatements > 0 && <p className="recap-identity">{t("recap.identity", { n: s.identityStatements })}</p>}
      {onStartNew && (
        <div className="form-actions">
          <button className="btn btn-primary" onClick={onStartNew}>{t("journey.startNew")}</button>
        </div>
      )}
    </Modal>
  );
}

function Stat({ v, l }: { v: string | number; l: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{v}</span>
      <span className="stat-label">{l}</span>
    </div>
  );
}
