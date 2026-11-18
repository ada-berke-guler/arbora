import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, restoreRow, softDelete } from "../../db/schema";
import { addJournalEntry, journalLog, updateJournalEntry } from "../../db/entries";
import type { JournalEntry } from "../../db/types";
import { nowHM, todayLocal } from "../../lib/dates";
import { showUndo } from "../../lib/undoBus";
import { fmtDate, useI18n } from "../../i18n";
import { DatePicker, TimePicker } from "../../components/Pickers";
import Modal from "../../components/Modal";
import "../pages.css";

const split = (at: string) => ({ date: at.slice(0, 10), time: at.slice(11) || "00:00" });

export default function JournalPage() {
  const { t, locale } = useI18n();
  const [date, setDate] = useState(todayLocal);
  const [time, setTime] = useState(nowHM);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const refs = useRef(new Map<string, HTMLElement>());
  const log = useLiveQuery(() => journalLog(db), []);

  /* ?entry=<id>: scroll + highlight, then clear the param. */
  useEffect(() => {
    const id = params.get("entry");
    if (!id || !log || !log.some((e) => e.id === id)) return;
    refs.current.get(id)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, log]);
  /* Separate effect on purpose: clearing the param re-runs the one above and
   * would cancel this timer if they shared an effect. */
  useEffect(() => {
    if (!highlight) return;
    const tm = window.setTimeout(() => setHighlight(null), 2600);
    return () => window.clearTimeout(tm);
  }, [highlight]);

  if (!log) return null;

  function add() {
    if (!text.trim()) return;
    void addJournalEntry(db, `${date}T${time}`, text.trim());
    setText("");
    setDate(todayLocal());
    setTime(nowHM());
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("nav.journal")}</h1>
          <p className="page-subtitle">{t("journal.subtitle")}</p>
        </div>
      </header>
      <section className="panel composer">
        <div className="field-row">
          <div className="field"><span>{t("journal.date")}</span><DatePicker value={date} onChange={setDate} ariaLabel={t("journal.date")} /></div>
          <div className="field"><span>{t("journal.time")}</span><TimePicker value={time} onChange={setTime} ariaLabel={t("journal.time")} step={1} /></div>
        </div>
        <label className="field">
          <span>{t("journal.entry")}</span>
          <textarea value={text} rows={5} onChange={(e) => setText(e.target.value)} placeholder={t("journal.entryPh")}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") add(); }} />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!text.trim()} onClick={add}>{t("journal.add")}</button>
        </div>
      </section>

      <section className="journal-log" aria-label={t("journal.log")}>
        {log.length === 0 ? (
          <p className="empty-hint">{t("journal.empty")}</p>
        ) : (
          log.map((e) => (
            <article key={e.id} ref={(el) => { if (el) refs.current.set(e.id, el); else refs.current.delete(e.id); }}
              className={`journal-entry ${highlight === e.id ? "is-highlighted" : ""}`}>
              <header className="entry-head">
                <time className="entry-at">
                  {fmtDate(e.at.slice(0, 10), locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {e.at.slice(11)}
                </time>
                <span className="row">
                  <button className="btn btn-small btn-ghost" onClick={() => navigate(`/calendar?date=${e.at.slice(0, 10)}`)}>{t("journal.viewDay")}</button>
                  <button className="btn btn-small" onClick={() => setEditing(e)}>{t("common.edit")}</button>
                </span>
              </header>
              <p className="entry-text">{e.text}</p>
            </article>
          ))
        )}
      </section>
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditEntry({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const { t } = useI18n();
  const [{ date, time }, setAt] = useState(() => split(entry.at));
  const [text, setText] = useState(entry.text);
  return (
    <Modal title={t("journal.editTitle")} label={t("journal.editTitle")} onClose={onClose}>
      <div className="field-row">
        <div className="field"><span>{t("journal.date")}</span><DatePicker value={date} onChange={(d) => setAt((a) => ({ ...a, date: d }))} ariaLabel={t("journal.date")} /></div>
        <div className="field"><span>{t("journal.time")}</span><TimePicker value={time} onChange={(v) => setAt((a) => ({ ...a, time: v }))} ariaLabel={t("journal.time")} step={1} /></div>
      </div>
      <label className="field">
        <span>{t("journal.entry")}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} autoFocus />
      </label>
      <div className="form-actions">
        <button className="btn btn-danger" onClick={() => {
          onClose();
          void softDelete(db, "journalEntries", entry.id);
          showUndo({ message: t("journal.removed"), undo: () => void restoreRow(db, "journalEntries", entry.id) });
        }}>{t("common.delete")}</button>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => {
          onClose();
          void updateJournalEntry(db, entry.id, { at: `${date}T${time}`, text: text.trim() });
        }}>{t("common.saveChanges")}</button>
      </div>
    </Modal>
  );
}
