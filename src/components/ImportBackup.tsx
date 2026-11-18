import { useRef, useState } from "react";
import { db } from "../db/schema";
import { BackupError, importBackup, summarizeBackup, TABLES, type BackupSummary } from "../db/backup";
import { showToast } from "../lib/undoBus";
import { useI18n, type DictKey } from "../i18n";
import Modal from "./Modal";

export function backupErrorText(err: unknown): string {
  if (err instanceof BackupError) {
    return err.code === "table" ? `${err.code}: ${err.detail}` : err.code;
  }
  if (err instanceof SyntaxError) return "JSON";
  return err instanceof Error ? err.message : String(err);
}

/**
 * Pick a file → see what's in it → confirm → replace everything. Never
 * imports without showing the summary first.
 */
export default function ImportBackup({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ raw: unknown; summary: BackupSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setError(null);
    try {
      const raw: unknown = JSON.parse(await f.text());
      setParsed({ raw, summary: summarizeBackup(raw) });
    } catch (err) {
      setParsed(null);
      setError(t("settings.importFailed", { msg: backupErrorText(err) }));
    }
  }

  async function restore() {
    if (!parsed) return;
    setBusy(true);
    try {
      await importBackup(db, parsed.raw);
      showToast(t("settings.restored"));
      onClose();
      onDone?.();
    } catch (err) {
      setError(t("settings.importFailed", { msg: backupErrorText(err) }));
      setBusy(false);
    }
  }

  return (
    <Modal title={t("settings.import")} label={t("settings.import")} onClose={onClose}>
      <p className="muted" style={{ marginBottom: "1rem" }}>{t("settings.importHint")}</p>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      {!parsed && (
        <button className="btn btn-primary btn-block" onClick={() => fileRef.current?.click()}>{t("settings.import")}</button>
      )}
      {error && <p className="msg" role="alert">{error}</p>}
      {parsed && (
        <div className="import-summary">
          <h4 className="panel-title">{t("settings.confirmImport")}</h4>
          {parsed.summary.exportedAt && (
            <p style={{ marginBottom: ".6rem" }}>
              {t("settings.backupOf", { date: new Date(parsed.summary.exportedAt).toLocaleString(locale) })}
            </p>
          )}
          {parsed.summary.legacy && <p className="msg ok">{t("settings.legacy")}</p>}
          <ul className="import-counts">
            {TABLES.filter((k) => k !== "settings" && (parsed.summary.counts[k] ?? 0) > 0).map((k) => (
              <li key={k}><strong>{parsed.summary.counts[k]}</strong> {t(`settings.table.${k}` as DictKey)}</li>
            ))}
          </ul>
          <p className="msg">{t("settings.confirmImportLead")}</p>
          <div className="form-actions">
            <button className="btn" onClick={() => fileRef.current?.click()}>{t("settings.import")}</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void restore()}>{t("settings.restore")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
