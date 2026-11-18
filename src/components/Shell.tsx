import { useEffect, useState } from "react";
import { useMedia } from "../lib/useMedia";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, putSetting } from "../db/schema";
import { currentCycle, journeyStatus } from "../db/cycles";
import { todayLocal } from "../lib/dates";
import { backupNag } from "../lib/nag";
import { useAppearance } from "../lib/appearance";
import type { Section } from "../lib/theme";
import { fmtDate, useI18n, type DictKey } from "../i18n";
import Tree, { stageIndexForProgress } from "./tree/Tree";
import Icon, { type IconName } from "./Icons";
import SearchOverlay from "./SearchOverlay";
import { JourneySettings, NewJourney, Recap } from "./JourneyModals";

interface NavItem {
  to: string;
  label: DictKey;
  icon: IconName;
  section?: Section;
}

export const NAV: NavItem[] = [
  { to: "/habits", label: "nav.habits", icon: "habits", section: "habits" },
  { to: "/dayring", label: "nav.dayring", icon: "dayring", section: "dayring" },
  { to: "/calendar", label: "nav.calendar", icon: "calendar", section: "calendar" },
  { to: "/journal", label: "nav.journal", icon: "journal", section: "journal" },
  { to: "/trackers", label: "nav.trackers", icon: "trackers", section: "trackers" },
  { to: "/board", label: "nav.board", icon: "board", section: "board" },
  { to: "/identity", label: "nav.identity", icon: "identity", section: "identity" },
  { to: "/contact", label: "nav.contact", icon: "contact", section: "contact" },
];
const MOBILE_PRIMARY = 4;

export default function Shell() {
  const { t, locale } = useI18n();
  const { sectionStyle, global } = useAppearance();
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayLocal();
  const cycle = useLiveQuery(() => currentCycle(db));
  const lastBackupAt = useLiveQuery(async () => ({ v: await getSetting<string>(db, "lastBackupAt") }));
  const recapSeen = useLiveQuery(
    async () => (cycle ? { seen: (await getSetting<boolean>(db, `recapSeen:${cycle.id}`)) ?? false } : undefined),
    [cycle?.id]
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mobile = useMedia("(max-width: 48rem)");

  const status = cycle ? journeyStatus(cycle, today) : null;
  const ended = status?.phase === "ended";

  /* auto-open the recap exactly once per journey */
  useEffect(() => {
    if (ended && cycle && recapSeen && !recapSeen.seen) {
      setRecapOpen(true);
      void putSetting(db, `recapSeen:${cycle.id}`, true);
    }
  }, [ended, cycle, recapSeen]);

  /* Ctrl/⌘+K opens search anywhere */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  const section = NAV.find((n) => location.pathname.startsWith(n.to))?.section;
  const mainStyle = section ? sectionStyle(section) : undefined;

  const dayLabel = !status
    ? ""
    : status.phase === "before"
      ? t("journey.startsOn", { date: fmtDate(cycle!.startDate, locale, { day: "numeric", month: "short" }) })
      : status.phase === "ended"
        ? t("journey.complete")
        : status.total === null
          ? t("journey.day", { day: status.day })
          : t("journey.dayOf", { day: status.day, total: status.total });
  const progress = status?.progress ?? 0;
  const stage = t(`stage.${stageIndexForProgress(progress)}` as DictKey);
  const nag = lastBackupAt ? backupNag(lastBackupAt.v, Date.now()) : "ok";

  const brand = (size: number, cls: string) => (
    <button className={`brand ${cls}`} onClick={() => setSettingsOpen(true)} disabled={!cycle}
      aria-label={`${t("journey.settings")} · ${dayLabel} · ${t("journey.stage", { stage })}`}>
      <Tree progress={progress} size={size} themeKey={global.id} label={t("journey.stage", { stage })} maxDpr={2} />
      <span className="brand-text">
        <span className="brand-name">Arbora</span>
        <span className="brand-day">{dayLabel}</span>
      </span>
    </button>
  );

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        {t("common.skip")}
      </a>

      <aside className="sidebar" aria-label={t("nav.menu")}>
        {!mobile && brand(84, "brand-side")}
        {status && status.total !== null && (
          <div className="journey-track" aria-hidden>
            <div className="journey-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <p className="brand-stage">{t("journey.stage", { stage })}</p>

        {ended && (
          <div className="ended-actions">
            <button className="btn btn-small" onClick={() => setRecapOpen(true)}>{t("journey.viewRecap")}</button>
            <button className="btn btn-small btn-primary" onClick={() => setNewOpen(true)}>{t("journey.startNew")}</button>
          </div>
        )}

        <button className="search-trigger" onClick={() => setSearchOpen(true)}>
          <Icon name="search" size={16} />
          <span>{t("nav.search")}</span>
          <kbd>Ctrl K</kbd>
        </button>

        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <Icon name={n.icon} />
              <span>{t(n.label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          {nag !== "ok" && (
            <button className="nag" onClick={() => navigate("/settings")} role="status">
              {t(nag === "never" ? "settings.nagNever" : "settings.nagDue")}
            </button>
          )}
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon name="settings" />
            <span>{t("nav.settings")}</span>
          </NavLink>
        </div>
      </aside>

      <header className="topbar">
        {mobile && brand(40, "brand-top")}
        <div className="spacer" />
        <button className="btn btn-icon btn-ghost" aria-label={t("nav.search")} onClick={() => setSearchOpen(true)}>
          <Icon name="search" />
        </button>
        <NavLink to="/settings" className="btn btn-icon btn-ghost" aria-label={t("nav.settings")}>
          <Icon name="settings" />
        </NavLink>
      </header>

      <main id="main" className="main" style={mainStyle} tabIndex={-1} data-section={section}>
        {ended && (
          <div className="ended-banner">
            <span>{t("journey.complete")}</span>
            <button className="btn btn-small" onClick={() => setRecapOpen(true)}>{t("journey.viewRecap")}</button>
            <button className="btn btn-small btn-primary" onClick={() => setNewOpen(true)}>{t("journey.startNew")}</button>
          </div>
        )}
        <div className="page-enter" key={location.pathname}>
          <Outlet />
        </div>
      </main>

      <nav className="tabbar" aria-label={t("nav.menu")}>
        {NAV.slice(0, MOBILE_PRIMARY).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon name={n.icon} size={21} />
            <span>{t(n.label)}</span>
          </NavLink>
        ))}
        <button className={`tab ${NAV.slice(MOBILE_PRIMARY).some((n) => location.pathname.startsWith(n.to)) ? "active" : ""}`}
          aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
          <Icon name="more" size={21} />
          <span>{t("nav.more")}</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            {NAV.slice(MOBILE_PRIMARY).map((n) => (
              <NavLink key={n.to} to={n.to} className="more-item">
                <Icon name={n.icon} size={22} />
                <span>{t(n.label)}</span>
              </NavLink>
            ))}
            <NavLink to="/settings" className="more-item">
              <Icon name="settings" size={22} />
              <span>{t("nav.settings")}</span>
            </NavLink>
          </div>
        </div>
      )}

      {settingsOpen && cycle && <JourneySettings cycle={cycle} onClose={() => setSettingsOpen(false)} />}
      {recapOpen && cycle && (
        <Recap cycle={cycle} onClose={() => setRecapOpen(false)} onStartNew={() => { setRecapOpen(false); setNewOpen(true); }} />
      )}
      {newOpen && cycle && <NewJourney previous={cycle} onClose={() => setNewOpen(false)} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
