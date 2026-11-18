import { useState } from "react";
import { db } from "../db/schema";
import { DEFAULT_JOURNEY_DAYS, journeyEndDate, journeySpan, MAX_JOURNEY_DAYS, startJourney } from "../db/cycles";
import { addDays, todayLocal } from "../lib/dates";
import { useI18n } from "../i18n";
import { DatePicker } from "./Pickers";
import Tree from "./tree/Tree";
import { LangSwitch } from "./Intro";
import ImportBackup from "./ImportBackup";
import Modal from "./Modal";
import AccountForm from "./AccountForm";
import "./journey.css";

export const SETUP_MS = 1800;

/**
 * Last onboarding step: name + start + end (≤ 365 days). The cycle is
 * created only AFTER the setup beat, because the App-level live query
 * unmounts this screen the moment a cycle row lands. A person who lost
 * their data can restore a backup from here instead.
 */
export default function StartJourney() {
  const { t, lang } = useI18n();
  const today = todayLocal();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => journeyEndDate(today, DEFAULT_JOURNEY_DAYS));
  const [phase, setPhase] = useState<"form" | "setup">("form");
  const [importing, setImporting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const span = journeySpan(startDate, endDate);

  function onStart(d: string) {
    setStartDate(d);
    if (endDate < d) setEndDate(d);
    else if (endDate > addDays(d, MAX_JOURNEY_DAYS - 1)) setEndDate(addDays(d, MAX_JOURNEY_DAYS - 1));
  }

  function begin() {
    setPhase("setup");
    window.setTimeout(() => {
      void startJourney(db, startDate, name.trim() || t("journey.defaultName"), span.days);
    }, SETUP_MS);
  }

  if (phase === "setup") {
    return (
      <div className="journey-screen">
        <div className="setup" role="status" aria-label={t("journey.settingUp")}>
          <div className="setup-thread" />
          <p className="setup-title">{t("journey.settingUp")}</p>
          <p className="muted">{t("journey.settingUpSub", { days: span.days })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="journey-screen">
      <div className="journey-lang"><LangSwitch lang={lang} /></div>
      <div className="journey-card panel">
        <div className="journey-brand">
          <Tree progress={0.12} size={76} rotate={false} maxDpr={2} />
          <div>
            <p className="eyebrow">{t("app.name")}</p>
            <h1 className="page-title">{t("journey.title")}</h1>
          </div>
        </div>
        <p className="page-subtitle journey-lead">{t("journey.lead")}</p>

        <label className="field">
          <span>{t("journey.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("journey.defaultName")} maxLength={60} />
        </label>
        <div className="field-row">
          <div className="field">
            <span>{t("journey.starts")}</span>
            <DatePicker value={startDate} max={today} ariaLabel={t("journey.starts")} onChange={onStart} />
          </div>
          <div className="field">
            <span>{t("journey.ends")}</span>
            <DatePicker value={endDate} min={startDate} max={addDays(startDate, MAX_JOURNEY_DAYS - 1)} ariaLabel={t("journey.ends")} onChange={setEndDate} />
          </div>
        </div>
        <p className="duration-preview" role="status">{t("journey.span", span)}</p>
        <button className="btn btn-primary btn-block journey-begin" onClick={begin}>{t("journey.begin")}</button>
        <button className="btn btn-ghost btn-block" onClick={() => setSigningIn(true)}>{t("journey.signIn")}</button>
        <button className="btn btn-ghost btn-block" onClick={() => setImporting(true)}>{t("journey.importInstead")}</button>
      </div>
      {importing && <ImportBackup onClose={() => setImporting(false)} />}
      {signingIn && (
        <Modal title={t("journey.signIn")} label={t("journey.signIn")} onClose={() => setSigningIn(false)}>
          <AccountForm initialMode="login" onDone={() => setSigningIn(false)} />
        </Modal>
      )}
    </div>
  );
}
