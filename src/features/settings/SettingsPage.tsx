import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, putSetting } from "../../db/schema";
import { downloadJson, exportBackup, importBackup } from "../../db/backup";
import { backupNag, daysSince } from "../../lib/nag";
import { isVaultId, newVaultId, open, pullVault, pushVault, seal, type Sealed } from "../../lib/vault";
import { todayLocal } from "../../lib/dates";
import { showToast } from "../../lib/undoBus";
import { useI18n } from "../../i18n";
import { LangSwitch } from "../../components/Intro";
import ImportBackup from "../../components/ImportBackup";
import Icon from "../../components/Icons";
import ThemeStudio from "./ThemeStudio";
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
  const { t } = useI18n();
  const cfg = useLiveQuery(async () => ({
    server: (await getSetting<string>(db, "sync.server")) ?? "",
    vault: (await getSetting<string>(db, "sync.vault")) ?? "",
  }));
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!cfg) return null;
  const ready = /^https?:\/\//.test(cfg.server) && isVaultId(cfg.vault) && pass.length >= 8;

  async function run(kind: "push" | "pull") {
    if (!ready) return setErr(t("sync.needAll"));
    setBusy(true);
    setErr(null);
    try {
      if (kind === "push") {
        const sealed: Sealed = await seal(JSON.stringify(await exportBackup(db)), pass);
        await pushVault(cfg!.server, cfg!.vault, sealed);
        showToast(t("sync.pushed"));
      } else {
        const sealed = await pullVault(cfg!.server, cfg!.vault);
        const plain = await open(sealed, pass);
        await importBackup(db, JSON.parse(plain));
        showToast(t("sync.pulled"));
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m === "wrong-passphrase" ? t("sync.wrongPass") : m === "not-found" ? t("sync.notFound") : t("sync.failed", { msg: m }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="muted small" style={{ marginTop: 0, marginBottom: "1rem" }}>{t("sync.lead")}</p>
      <label className="field">
        <span>{t("sync.server")}</span>
        <input value={cfg.server} placeholder={t("sync.serverPh")} inputMode="url" autoComplete="off"
          onChange={(e) => void putSetting(db, "sync.server", e.target.value.trim())} />
      </label>
      <div className="field">
        <span>{t("sync.vault")}</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input mono" value={cfg.vault} autoComplete="off" spellCheck={false}
            onChange={(e) => void putSetting(db, "sync.vault", e.target.value.trim().toLowerCase())} />
          <button className="btn btn-small" onClick={() => void putSetting(db, "sync.vault", newVaultId())}>{t("sync.newVault")}</button>
          <button className="btn btn-small" disabled={!cfg.vault} onClick={() => void navigator.clipboard?.writeText(cfg.vault)}>{t("sync.copyId")}</button>
        </div>
      </div>
      <label className="field">
        <span>{t("sync.pass")}</span>
        <input type="password" value={pass} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} />
      </label>
      <p className="muted small" style={{ marginTop: "-.4rem" }}>{t("sync.passHint")}</p>
      {err && <p className="msg" role="alert">{err}</p>}
      <div className="row" style={{ marginTop: ".9rem" }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void run("push")}><Icon name="upload" size={16} />{t("sync.push")}</button>
        <button className="btn" disabled={busy} onClick={() => void run("pull")}><Icon name="download" size={16} />{t("sync.pull")}</button>
      </div>
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
