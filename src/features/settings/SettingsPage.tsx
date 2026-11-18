import { useEffect, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, putSetting } from "../../db/schema";
import { downloadJson, exportBackup } from "../../db/backup";
import { backupNag, daysSince } from "../../lib/nag";
import { deleteAccount, getSession, signOut, syncNow, syncStore } from "../../lib/sync";
import AccountForm, { syncErrorText } from "../../components/AccountForm";
import { todayLocal } from "../../lib/dates";
import { showToast } from "../../lib/undoBus";
import { useI18n } from "../../i18n";
import { LangSwitch } from "../../components/Intro";
import ImportBackup from "../../components/ImportBackup";
import Icon from "../../components/Icons";
import ThemeStudio from "./ThemeStudio";
import { Link } from "react-router-dom";
import "./settings.css";

export default function SettingsPage() {
  const { t, lang } = useI18n();
  const [importing, setImporting] = useState(false);
  return (
    <div className="settings-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="page-subtitle">{t("settings.subtitle")}</p>
        </div>
      </header>

      <nav className="settings-toc" aria-label={t("settings.title")}>
        {(["appearance", "language", "backup", "sync", "privacy", "danger"] as const).map((k) => (
          <a key={k} href={`#s-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`s-${k}`)?.scrollIntoView?.({ behavior: "smooth" }); }}>
            {t(`settings.${k}`)}
          </a>
        ))}
      </nav>

      <section className="panel settings-sec" id="s-appearance">
        <h2 className="sec-title">{t("settings.appearance")}</h2>
        <ThemeStudio />
      </section>

      <section className="panel settings-sec" id="s-language">
        <h2 className="sec-title">{t("settings.language")}</h2>
        <div className="row">
          <LangSwitch lang={lang} />
          <span className="spacer" />
          <button className="btn" onClick={() => void putSetting(db, "introSeen", false)}>{t("settings.replay")}</button>
        </div>
      </section>

      <section className="panel settings-sec" id="s-backup">
        <h2 className="sec-title">{t("settings.backup")}</h2>
        <BackupStatus />
        <div className="row" style={{ marginTop: ".9rem" }}>
          <button className="btn btn-primary" onClick={async () => {
            downloadJson(await exportBackup(db), `arbora-${todayLocal()}.json`);
            showToast(t("settings.exported"));
          }}><Icon name="download" size={16} />{t("settings.export")}</button>
          <button className="btn" onClick={() => setImporting(true)}><Icon name="upload" size={16} />{t("settings.import")}</button>
        </div>
        <p className="muted small">{t("settings.importHint")}</p>
        <StorageInfo />
      </section>

      <section className="panel settings-sec" id="s-sync">
        <h2 className="sec-title">{t("settings.sync")}</h2>
        <SyncPanel />
      </section>

      <section className="panel settings-sec" id="s-privacy">
        <h2 className="sec-title">{t("settings.privacy")}</h2>
        <p className="privacy-text">{t("settings.privacyText")}</p>
        <Link className="btn" to="/privacy">{t("privacy.open")}</Link>
      </section>

      <section className="panel settings-sec danger" id="s-danger">
        <h2 className="sec-title">{t("settings.danger")}</h2>
        <Wipe />
      </section>

      {importing && <ImportBackup onClose={() => setImporting(false)} />}
    </div>
  );
}

function BackupStatus() {
  const { t } = useI18n();
  const last = useLiveQuery(async () => ({ v: await getSetting<string>(db, "lastBackupAt") }));
  if (!last) return null;
  const lvl = backupNag(last.v, Date.now());
  if (lvl === "ok") {
    const d = daysSince(last.v!, Date.now());
    return <p className="status-ok">{d === 0 ? t("settings.backedToday") : d === 1 ? t("settings.backedYesterday") : t("settings.backedDays", { n: d })}</p>;
  }
  return <p className="msg" role="status">{t(lvl === "never" ? "settings.nagNever" : "settings.nagDue")}</p>;
}

function StorageInfo() {
  const { t } = useI18n();
  const [used, setUsed] = useState<string | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsed(e.usage > 1e6 ? `${(e.usage / 1e6).toFixed(1)} MB` : `${Math.round(e.usage / 1e3)} KB`);
    });
  }, []);
  return used ? <p className="muted small">{t("settings.storage", { used })}</p> : null;
}

function SyncPanel() {
  const { t, locale } = useI18n();
  const st = useSyncExternalStore(syncStore.subscribe, syncStore.get);
  const session = useLiveQuery(async () => ({ v: await getSession(db) }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!session) return null;

  if (!session.v) {
    return (
      <div>
        <p className="muted small" style={{ marginTop: 0, marginBottom: "1rem" }}>{t("sync.lead")}</p>
        <AccountForm initialMode="create" />
      </div>
    );
  }

  const last = st.lastAt ? new Date(st.lastAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div>
      <p className="status-ok" style={{ marginTop: 0 }}>{t("sync.signedInAs", { name: session.v.username })}</p>
      <p className="muted small" role="status">
        {st.phase === "syncing" ? t("sync.working")
          : st.phase === "error" ? syncErrorText(t, st.error ?? "")
          : last ? t("sync.lastAt", { when: last }) : t("sync.auto")}
      </p>
      <p className="muted small">{t("sync.autoHint")}</p>
      {err && <p className="msg" role="alert">{err}</p>}
      <div className="row" style={{ marginTop: ".9rem" }}>
        <button className="btn btn-primary" disabled={st.phase === "syncing"} onClick={() => void syncNow(db)}>{t("sync.now")}</button>
        <button className="btn" onClick={() => void signOut(db).then(() => showToast(t("sync.signedOut")))}>{t("sync.signOut")}</button>
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <button className="btn btn-danger" disabled={busy} onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await deleteAccount(db);
                showToast(t("sync.deleted"));
              } catch (e) {
                setErr(syncErrorText(t, e instanceof Error ? e.message : String(e)));
              } finally {
                setBusy(false);
                setConfirmDelete(false);
              }
            }}>{busy ? t("sync.working") : t("sync.deleteConfirm")}</button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>{t("sync.delete")}</button>
        )}
      </div>
      <p className="muted small">{t("sync.signOutHint")}</p>
      <p className="muted small mono">{t("sync.serverNote")}</p>
    </div>
  );
}

function Wipe() {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState("");
  const word = t("settings.wipeWord");
  return (
    <div>
      <p className="muted small" style={{ marginTop: 0 }}>{t("settings.wipeLead")}</p>
      <label className="field" style={{ maxWidth: "22rem" }}>
        <span>{t("settings.wipeConfirm")}</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button className="btn btn-danger" disabled={confirm.trim().toLocaleUpperCase() !== word.toLocaleUpperCase()} onClick={async () => {
        await db.delete();
        try {
          localStorage.clear();
        } catch {
          /* ignore */
        }
        window.location.reload();
      }}>{t("settings.wipe")}</button>
    </div>
  );
}
