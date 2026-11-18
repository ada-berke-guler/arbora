import { useState } from "react";
import { useI18n } from "../../i18n";
import "../pages.css";

export const CONTACT_EMAIL = "adaberkeguler@gmail.com";

/** Display only: no form, no backend, no third-party service. */
export default function ContactPage() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the address is visible and selectable anyway */
    }
  }
  return (
    <div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("contact.title")}</h1>
          <p className="page-subtitle">{t("contact.lead")}</p>
        </div>
      </header>
      <div className="contact-card panel">
        <a className="contact-email" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        <button className="btn btn-small" onClick={() => void copy()}>{copied ? t("contact.copied") : t("contact.copy")}</button>
      </div>
      <p className="muted">{t("contact.hint")}</p>
    </div>
  );
}
