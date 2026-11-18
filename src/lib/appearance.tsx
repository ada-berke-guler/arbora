import { createContext, useContext, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, newRow, putSetting, touch } from "../db/schema";
import type { CustomTheme } from "../db/types";
import {
  DEFAULT_SELECTION,
  resolveTheme,
  themeTokens,
  type Section,
  type ThemeDef,
  type ThemeSelection,
} from "./theme";

const CACHE_KEY = "arbora.rootTokens";

interface AppearanceCtx {
  selection: ThemeSelection;
  customs: ThemeDef[];
  global: ThemeDef;
  themeFor: (s: Section) => ThemeDef;
  /** Inline CSS vars for a section that has its own theme (undefined = inherit global). */
  sectionStyle: (s: Section) => CSSProperties | undefined;
}

const Ctx = createContext<AppearanceCtx | null>(null);

export function customToDef(c: CustomTheme): ThemeDef {
  return { id: c.id, name: c.name, dominant: c.dominant, secondary: c.secondary, accent: c.accent, displayFont: c.displayFont };
}

export function applyRootTokens(tokens: Record<string, string>): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  root.style.colorScheme = tokens["--scheme"];
  root.dataset.scheme = tokens["--scheme"];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens["--bg"]);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(tokens));
  } catch {
    /* storage blocked — only costs a theme flash on next load */
  }
}

/** Paint the last-used theme before IndexedDB answers (avoids a flash of the default). */
export function paintCachedTheme(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      applyRootTokens(JSON.parse(raw));
      return;
    }
  } catch {
    /* fall through to default */
  }
  applyRootTokens(themeTokens(resolveTheme(undefined, [])));
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const data = useLiveQuery(async () => ({
    selection: (await getSetting<ThemeSelection>(db, "themeSelection")) ?? DEFAULT_SELECTION,
    customs: (await db.customThemes.filter((c) => c.deletedAt === null).toArray()).map(customToDef),
  }));

  const value = useMemo<AppearanceCtx>(() => {
    const selection = data?.selection ?? DEFAULT_SELECTION;
    const customs = data?.customs ?? [];
    const global = resolveTheme(selection.global, customs);
    const themeFor = (s: Section) => {
      const id = selection.sections[s];
      return id ? resolveTheme(id, customs) : global;
    };
    const sectionStyle = (s: Section) => {
      const id = selection.sections[s];
      if (!id || id === global.id) return undefined;
      return themeTokens(resolveTheme(id, customs)) as CSSProperties;
    };
    return { selection, customs, global, themeFor, sectionStyle };
  }, [data]);

  useEffect(() => {
    if (data) applyRootTokens(themeTokens(value.global));
  }, [data, value.global]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppearance(): AppearanceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppearance outside AppearanceProvider");
  return v;
}

/* ── writes ── */

export async function setGlobalTheme(id: string): Promise<void> {
  const sel = (await getSetting<ThemeSelection>(db, "themeSelection")) ?? DEFAULT_SELECTION;
  await putSetting(db, "themeSelection", { ...sel, global: id });
}

export async function setSectionTheme(section: Section, id: string | null): Promise<void> {
  const sel = (await getSetting<ThemeSelection>(db, "themeSelection")) ?? DEFAULT_SELECTION;
  const sections = { ...sel.sections };
  if (id === null) delete sections[section];
  else sections[section] = id;
  await putSetting(db, "themeSelection", { ...sel, sections });
}

export async function saveCustomTheme(
  input: Omit<ThemeDef, "id" | "ring">,
  id?: string
): Promise<string> {
  if (id) {
    const row = await db.customThemes.get(id);
    if (row) {
      await db.customThemes.put(touch({ ...row, ...input }));
      return id;
    }
  }
  const row: CustomTheme = { ...newRow(), ...input };
  await db.customThemes.add(row);
  return row.id;
}

/** Soft-delete a custom theme and point anything using it back at the default. */
export async function removeCustomTheme(id: string): Promise<ThemeSelection> {
  const sel = (await getSetting<ThemeSelection>(db, "themeSelection")) ?? DEFAULT_SELECTION;
  const row = await db.customThemes.get(id);
  if (row) await db.customThemes.put({ ...touch(row), deletedAt: new Date().toISOString() });
  const next: ThemeSelection = {
    global: sel.global === id ? DEFAULT_SELECTION.global : sel.global,
    sections: Object.fromEntries(Object.entries(sel.sections).filter(([, v]) => v !== id)),
  };
  await putSetting(db, "themeSelection", next);
  return sel;
}

export async function restoreSelection(sel: ThemeSelection): Promise<void> {
  await putSetting(db, "themeSelection", sel);
}
