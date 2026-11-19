import { useEffect, useState } from "react";
import { db } from "../db/schema";
import { connect, DEFAULT_SYNC_SERVER, getServer } from "../lib/sync";
import { isValidUsername, MIN_PASSWORD } from "../lib/vault";
import { weakPassword } from "../lib/passwordCheck";
import { showToast } from "../lib/undoBus";
import { useI18n } from "../i18n";

export function syncErrorText(t: ReturnType<typeof useI18n>["t"], m: string): string {
  if (m === "wrong-passphrase" || m === "unauthorized") return t("sync.wrongPass");
  if (m === "not-found") return t("sync.notFound");
  if (m === "exists") return t("sync.exists");
  if (m === "conflict") return t("sync.conflict");
  if (m === "too-large") return t("sync.tooLarge");
  if (m === "rate-limited") return t("sync.rateLimited");
  return t("sync.failed", { msg: m });
}

/** Sign in / create account. Shared by Settings and the first-run screen. */
export default function AccountForm({ initialMode = "login", onDone }: { initialMode?: "login" | "create"; onDone?: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(initialMode);
  const [server, setServer] = useState(DEFAULT_SYNC_SERVER);
  const [advanced, setAdvanced] = useState(!DEFAULT_SYNC_SERVER);
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getServer(db).then((s) => s && setServer(s));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const srv = server.trim();
    if (!/^https?:\/\//.test(srv) || !isValidUsername(username) || pass.length < MIN_PASSWORD) {
      setAdvanced(advanced || !/^https?:\/\//.test(srv));
      return setErr(t("sync.needAll", { n: MIN_PASSWORD }));
    }
    if (mode === "create" && pass !== pass2) return setErr(t("sync.mismatch"));
    if (mode === "create" && !consent) return setErr(t("sync.needConsent"));
    setBusy(true);
    setErr(null);
    try {
      if (mode === "create") {
        const weak = await weakPassword(pass, username);
        if (weak) return setErr(t(`sync.weak.${weak}`));
      }
      await connect(db, srv, username, pass, mode);
      showToast(t(mode === "create" ? "sync.created" : "sync.signedIn"));
      setPass("");
      setPass2("");
      onDone?.();
    } catch (ex) {
      setErr(syncErrorText(t, ex instanceof Error ? ex.message : String(ex)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={(e) => void submit(e)}>
      <div className="seg-control account-mode" role="group" aria-label={t("sync.title")}>
        <button type="button" aria-pressed={mode === "login"} onClick={() => { setMode("login"); setErr(null); }}>{t("sync.login")}</button>
        <button type="button" aria-pressed={mode === "create"} onClick={() => { setMode("create"); setErr(null); }}>{t("sync.create")}</button>
      </div>
      <p className="msg" role="note"><strong>{t("sync.noResetTitle")}</strong> {t("sync.noReset")}</p>
      <label className="field">
        <span>{t("sync.username")}</span>
        <input value={username} autoComplete="username" spellCheck={false} autoCapitalize="none" onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label className="field">
        <span>{t("sync.pass")}</span>
        <input type="password" value={pass} autoComplete={mode === "create" ? "new-password" : "current-password"} onChange={(e) => setPass(e.target.value)} />
      </label>
      {mode === "create" && (
        <label className="field">
          <span>{t("sync.pass2")}</span>
          <input type="password" value={pass2} autoComplete="new-password" onChange={(e) => setPass2(e.target.value)} />
        </label>
      )}
      <p className="muted small" style={{ marginTop: "-.4rem" }}>{t("sync.passHint", { n: MIN_PASSWORD })}</p>
      {mode === "create" && (
        <label className="check-row small">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t("sync.consent")} <a href="#/privacy">{t("privacy.title")}</a></span>
        </label>
      )}
      {advanced ? (
        <label className="field">
          <span>{t("sync.server")}</span>
          <input value={server} placeholder={t("sync.serverPh")} inputMode="url" autoComplete="off" onChange={(e) => setServer(e.target.value)} />
        </label>
      ) : (
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setAdvanced(true)}>{t("sync.advanced")}</button>
      )}
      {err && <p className="msg" role="alert">{err}</p>}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? t("sync.working") : t(mode === "create" ? "sync.create" : "sync.login")}
      </button>
    </form>
  );
}
