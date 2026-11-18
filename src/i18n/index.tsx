import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { tr, type DictKey } from "./tr";
import { en } from "./en";

export type Lang = "tr" | "en";
export type { DictKey };

const DICTS: Record<Lang, Record<DictKey, string>> = { tr, en };

export type TFn = (key: DictKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? DICTS.tr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface Ctx {
  lang: Lang;
  t: TFn;
  locale: string;
}

const I18nContext = createContext<Ctx>({
  lang: "tr",
  t: (k, v) => translate("tr", k, v),
  locale: "tr-TR",
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = useCallback<TFn>((k, v) => translate(lang, k, v), [lang]);
  const value = useMemo(() => ({ lang, t, locale: lang === "tr" ? "tr-TR" : "en-GB" }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(I18nContext);
}

/** Localized date labels. */
export function fmtDate(date: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, opts);
}

export function monthName(key: string, locale: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** Monday-first short weekday names. */
export function weekdayNames(locale: string, style: "short" | "narrow" = "short"): string[] {
  // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: style }));
}
