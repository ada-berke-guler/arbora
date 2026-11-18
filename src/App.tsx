import { useEffect } from "react";
import { startAutoSync } from "./lib/sync";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting } from "./db/schema";
import { currentCycle } from "./db/cycles";
import { I18nProvider, type Lang } from "./i18n";
import { AppearanceProvider } from "./lib/appearance";
import Shell from "./components/Shell";
import Intro from "./components/Intro";
import StartJourney from "./components/StartJourney";
import Toasts from "./components/Toasts";
import HabitsPage from "./features/habits/HabitsPage";
import DayRingPage from "./features/dayring/DayRingPage";
import MomentsPage from "./features/moments/MomentsPage";
import JournalPage from "./features/journal/JournalPage";
import TrackersPage from "./features/trackers/TrackersPage";
import BoardPage from "./features/board/BoardPage";
import IdentityPage from "./features/identity/IdentityPage";
import ContactPage from "./features/contact/ContactPage";
import SettingsPage from "./features/settings/SettingsPage";
import PrivacyPage from "./features/privacy/PrivacyPage";

/* Hash router: works from any static host or straight from disk. */
export const routes = [
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Navigate to="/habits" replace /> },
      { path: "/habits", element: <HabitsPage /> },
      { path: "/dayring", element: <DayRingPage /> },
      { path: "/calendar", element: <MomentsPage /> },
      { path: "/journal", element: <JournalPage /> },
      { path: "/trackers", element: <TrackersPage /> },
      { path: "/board", element: <BoardPage /> },
      { path: "/identity", element: <IdentityPage /> },
      { path: "/contact", element: <ContactPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/privacy", element: <PrivacyPage /> },
      { path: "*", element: <Navigate to="/habits" replace /> },
    ],
  },
];

const router = createHashRouter(routes);

export function detectLang(): Lang {
  const n = (typeof navigator !== "undefined" && navigator.language) || "tr";
  return n.toLowerCase().startsWith("tr") ? "tr" : n.toLowerCase().startsWith("en") ? "en" : "tr";
}

export default function App() {
  /* `.last()`-style queries resolve to undefined both while loading AND when
   * empty — wrap in an object so "loading" (undefined) stays distinct from
   * "loaded, none" ({ cycle: null }), or a first-time user sees a blank screen. */
  const state = useLiveQuery(async () => ({
    cycle: (await currentCycle(db)) ?? null,
    introSeen: (await getSetting<boolean>(db, "introSeen")) ?? false,
    introBefore: (await getSetting<boolean>(db, "hasCompletedIntroBefore")) ?? false,
    lang: (await getSetting<Lang>(db, "lang")) ?? detectLang(),
  }));

  useEffect(() => startAutoSync(db), []);

  useEffect(() => {
    if (state) document.documentElement.lang = state.lang;
  }, [state?.lang]);

  if (state === undefined) return null;

  return (
    <I18nProvider lang={state.lang}>
      <AppearanceProvider>
        {!state.introSeen ? (
          <Intro isReplay={state.introBefore} />
        ) : !state.cycle ? (
          <StartJourney />
        ) : (
          <RouterProvider router={router} />
        )}
        <Toasts />
      </AppearanceProvider>
    </I18nProvider>
  );
}
