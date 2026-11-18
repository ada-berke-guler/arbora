import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, restoreRow, softDelete } from "../../db/schema";
import { activeStatements, addStatement, moveStatement, updateStatement } from "../../db/entries";
import type { IdentityStatement } from "../../db/types";
import { showUndo } from "../../lib/undoBus";
import { useI18n } from "../../i18n";
import "../pages.css";

/** The one quiet screen: no stats, no streaks, by design. */
export default function IdentityPage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const list = useLiveQuery(() => activeStatements(db), []);
  if (!list) return null;
  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    void addStatement(db, v);
    setDraft("");
  };
  return (
    <div className="identity-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("nav.identity")}</h1>
          <p className="page-subtitle">{t("identity.subtitle")}</p>
        </div>
      </header>
      <form className="identity-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("identity.placeholder")} aria-label={t("identity.new")} maxLength={200} />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>{t("identity.declare")}</button>
      </form>
      {list.length === 0 ? (
        <p className="identity-empty">{t("identity.empty")}</p>
      ) : (
        <ol className="identity-list">
          {list.map((s, i) => <Row key={s.id} s={s} first={i === 0} last={i === list.length - 1} />)}
        </ol>
      )}
    </div>
  );
}

function Row({ s, first, last }: { s: IdentityStatement; first: boolean; last: boolean }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  return (
    <li className="identity-row">
      {editing ? (
        <input className="input identity-editor" defaultValue={s.text} autoFocus aria-label={t("identity.editField")}
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => { setEditing(false); const v = e.target.value.trim(); if (v && v !== s.text) void updateStatement(db, s.id, v); }} />
      ) : (
        <p className="identity-text" onDoubleClick={() => setEditing(true)}>{s.text}</p>
      )}
      <span className="identity-actions">
        <button className="btn btn-small btn-ghost" aria-label={t("identity.up", { text: s.text })} disabled={first} onClick={() => void moveStatement(db, s.id, -1)}>↑</button>
        <button className="btn btn-small btn-ghost" aria-label={t("identity.down", { text: s.text })} disabled={last} onClick={() => void moveStatement(db, s.id, 1)}>↓</button>
        <button className="btn btn-small btn-ghost" aria-label={t("identity.editX", { text: s.text })} onClick={() => setEditing(true)}>{t("common.edit")}</button>
        <button className="del" aria-label={t("identity.removeX", { text: s.text })} onClick={() => {
          void softDelete(db, "identity", s.id);
          showUndo({ message: t("identity.removed"), undo: () => void restoreRow(db, "identity", s.id) });
        }}>×</button>
      </span>
    </li>
  );
}
