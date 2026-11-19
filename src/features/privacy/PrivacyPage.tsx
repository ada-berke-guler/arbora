import { useI18n, type DictKey } from "../../i18n";
import { CONTACT_EMAIL } from "../contact/ContactPage";
import "../pages.css";

const SECTIONS: [DictKey, DictKey][] = [
  ["privacy.s1.t", "privacy.s1.b"],
  ["privacy.s2.t", "privacy.s2.b"],
  ["privacy.s3.t", "privacy.s3.b"],
  ["privacy.s4.t", "privacy.s4.b"],
  ["privacy.s5.t", "privacy.s5.b"],
  ["privacy.s6.t", "privacy.s6.b"],
  ["privacy.s7.t", "privacy.s7.b"],
  ["privacy.s8.t", "privacy.s8.b"],
  ["privacy.s9.t", "privacy.s9.b"],
  ["privacy.s10.t", "privacy.s10.b"],
];

/** KVKK / GDPR notice. Shared by the /privacy page and the first-run dialog. */
export function PrivacyNotice() {
  const { t } = useI18n();
  return (
    <div className="privacy-notice">
      <p className="privacy-alert" role="note">
        <strong>{t("privacy.noResetTitle")}</strong> {t("privacy.noReset")}
      </p>
      {SECTIONS.map(([title, body]) => (
        <section key={title}>
          <h3>{t(title)}</h3>
          <p>{t(body, { email: CONTACT_EMAIL })}</p>
        </section>
      ))}
      <p className="muted small">{t("privacy.updated")}</p>
    </div>
  );
}

export default function PrivacyPage() {
  const { t } = useI18n();
  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("privacy.title")}</h1>
          <p className="page-subtitle">{t("privacy.lead")}</p>
        </div>
      </header>
      <div className="panel privacy-panel">
        <PrivacyNotice />
      </div>
    </div>
  );
}
