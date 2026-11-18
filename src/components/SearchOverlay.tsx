import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../db/schema";
import { search, type SearchHit } from "../db/aggregate";
import { fmtDate, useI18n } from "../i18n";
import Modal from "./Modal";

/** Journal + moments search; hits use the same deep links as the calendar. */
export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    void search(db, q).then((h) => live && setHits(h));
    return () => {
      live = false;
    };
  }, [q]);

  function go(h: SearchHit) {
    onClose();
    navigate(h.kind === "journal" ? `/journal?entry=${h.id}` : `/calendar?date=${h.date}`);
  }

  return (
    <Modal title={t("search.title")} label={t("search.title")} onClose={onClose} className="search-modal">
      <input className="input search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t("search.placeholder")} aria-label={t("search.query")} />
      {q.trim() === "" ? (
        <p className="empty-hint">{t("search.hint")}</p>
      ) : hits.length === 0 ? (
        <p className="empty-hint">{t("search.none", { q })}</p>
      ) : (
        <ul className="search-results">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button className="search-result" onClick={() => go(h)}>
                <span className="search-result-head">
                  <span className={`chip ${h.kind === "moment" ? "chip-alt" : ""}`}>
                    {t(h.kind === "journal" ? "search.journal" : "search.moment")}
                  </span>
                  <span className="muted mono">{fmtDate(h.date, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                {h.title && <span className="search-result-title">{h.title}</span>}
                <span className="search-result-snippet">{h.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
