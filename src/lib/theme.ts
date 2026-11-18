import {
  bestBW,
  contrast,
  ensureContrast,
  hexToHsl,
  hslToHex,
  isDark,
  mix,
  textOn,
  withAlpha,
} from "./color";

/** The three choices a theme is made of. */
export interface Palette {
  dominant: string; // 60%
  secondary: string; // 30%
  accent: string; // 10%
}

export type DisplayFont = "serif" | "sans" | "mono";

export interface ThemeDef extends Palette {
  id: string;
  name: string;
  displayFont: DisplayFont;
  /** Activity colors for the Day Ring / habits. Derived from the accent when absent. */
  ring?: string[];
}

export const SECTIONS = [
  "habits",
  "dayring",
  "calendar",
  "journal",
  "trackers",
  "board",
  "identity",
  "contact",
] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * Presets: Arbora v1's five themes + Gün Kadranı's five, re-expressed as
 * 60-30-10 triples. Accents were darkened/lightened where needed so every
 * preset passes the same contrast check the custom builder enforces.
 */
export const PRESETS: ThemeDef[] = [
  { id: "dark-gold", name: "Altın Gece", dominant: "#0F0E0C", secondary: "#1C1B18", accent: "#C9A96E", displayFont: "serif",
    ring: ["#C9A96E", "#8FA6C9", "#C98F6E", "#7FB39A", "#B98FC9", "#C96E8F", "#E8D5A3", "#6E8FC9"] },
  { id: "matcha", name: "Matcha", dominant: "#F4F0E6", secondary: "#E6E0CB", accent: "#4A5E4A", displayFont: "serif",
    ring: ["#4A5E4A", "#8A6A4A", "#4A6E8A", "#8A4A5E", "#6E8A4A", "#B08A3A", "#2E3E2E", "#7A8270"] },
  { id: "midnight-plum", name: "Gece Eriği", dominant: "#16101E", secondary: "#231A2F", accent: "#B48FE0", displayFont: "serif",
    ring: ["#9B6FC4", "#6FA0C4", "#C46F9B", "#6FC4A0", "#C4A06F", "#C46F6F", "#C4A0E8", "#7060A0"] },
  { id: "glacier", name: "Buzul", dominant: "#EEF2F5", secondary: "#DAE6EE", accent: "#2F7A93", displayFont: "sans",
    ring: ["#4A90A8", "#8CA8D8", "#CC8B7B", "#5FAE84", "#B87BCC", "#C9A35F", "#1C2830", "#7BB8CC"] },
  { id: "slate-rose", name: "Arduvaz Gül", dominant: "#1A1F2E", secondary: "#242B3E", accent: "#E295A9", displayFont: "serif",
    ring: ["#D4869A", "#86A0D4", "#D4B686", "#6BB8A0", "#B686D4", "#D4C286", "#E8B4C2", "#7A7A9A"] },
  { id: "bahce", name: "Bahçe", dominant: "#F2E8CF", secondary: "#E4D8B4", accent: "#386641", displayFont: "sans",
    ring: ["#386641", "#6A994E", "#A7C957", "#BC4749", "#E09F3E", "#3A7D8C", "#7A5195", "#2F3E46"] },
  { id: "onyx", name: "Onyx", dominant: "#0C090D", secondary: "#1A151D", accent: "#F9C22E", displayFont: "sans",
    ring: ["#E01A4F", "#F15946", "#F9C22E", "#53B3CB", "#7B5EA7", "#2FBF71", "#E8E1E5", "#1C6E8C"] },
  { id: "orkide", name: "Orkide", dominant: "#F7EFF3", secondary: "#EBDBE5", accent: "#77567A", displayFont: "serif",
    ring: ["#77567A", "#C47AC0", "#E39EC1", "#DEBAC0", "#2F323A", "#8FA3C4", "#6FB3A0", "#D9A441"] },
  { id: "kil", name: "Kil", dominant: "#EDDDD4", secondary: "#E0CBBE", accent: "#197278", displayFont: "serif",
    ring: ["#197278", "#283D3B", "#C44536", "#772E25", "#E09E50", "#4F7CA3", "#8A9A5B", "#6B4E71"] },
  { id: "cim", name: "Çim", dominant: "#1E211E", secondary: "#2A2E29", accent: "#CBFF4D", displayFont: "mono",
    ring: ["#CBFF4D", "#84DD63", "#6BAA75", "#3E8E7E", "#69747C", "#E0C64D", "#E05B4A", "#A98CFF"] },
];

export const DEFAULT_THEME_ID = "dark-gold";

/** Eight evenly-spaced, accent-anchored activity colors for a custom theme. */
export function deriveRing(p: Palette): string[] {
  const a = hexToHsl(p.accent);
  const dark = isDark(p.dominant);
  const s = Math.max(0.35, Math.min(0.75, a.s || 0.5));
  const l = dark ? Math.max(0.55, Math.min(0.7, a.l)) : Math.max(0.35, Math.min(0.5, a.l));
  const out = [p.accent];
  for (let i = 1; i < 8; i++) out.push(hslToHex({ h: a.h + i * 45, s, l }));
  return out;
}

export type ThemeTokens = Record<string, string>;

/**
 * Full CSS-variable set for a theme. Every rule in the app reads ONLY these
 * names, which is what lets a section carry its own theme: setting these
 * vars on a section wrapper reskins everything inside it.
 */
export function themeTokens(t: ThemeDef): ThemeTokens {
  const dark = isDark(t.dominant);
  const fg = textOn(t.dominant);
  const fgOn30 = textOn(t.secondary);
  const muted = ensureContrast(mix(fg, t.dominant, 0.42), t.dominant, 4.5);
  const mutedOn30 = ensureContrast(mix(fgOn30, t.secondary, 0.42), t.secondary, 4.5);
  /* the accent as TEXT / thin lines on the background must stay readable */
  const accentInk = ensureContrast(t.accent, t.dominant, 3);
  const accentOn30 = ensureContrast(t.accent, t.secondary, 3);
  const onAccent = ensureContrast(mix(bestBW(t.accent), t.accent, 0.08), t.accent, 4.5);
  const raised = mix(t.secondary, dark ? "#FFFFFF" : "#000000", dark ? 0.05 : 0.035);
  const sunken = mix(t.secondary, t.dominant, 0.55);
  const ring = t.ring && t.ring.length >= 6 ? t.ring : deriveRing(t);
  const fonts: Record<DisplayFont, string> = {
    serif: '"Fraunces", Georgia, serif',
    sans: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  };

  const tokens: ThemeTokens = {
    "--c60": t.dominant,
    "--c30": t.secondary,
    "--c10": t.accent,
    "--bg": t.dominant,
    "--surface": t.secondary,
    "--surface-raised": raised,
    "--surface-sunken": sunken,
    "--fg": fg,
    "--fg-30": fgOn30,
    "--muted": muted,
    "--muted-30": mutedOn30,
    "--accent": t.accent,
    "--accent-ink": accentInk,
    "--accent-ink-30": accentOn30,
    "--accent-soft": withAlpha(t.accent, dark ? 0.16 : 0.14),
    "--accent-strong": mix(t.accent, fg, 0.25),
    "--on-accent": onAccent,
    "--border": withAlpha(fg, dark ? 0.12 : 0.13),
    "--border-strong": withAlpha(fg, dark ? 0.24 : 0.26),
    "--shadow": dark ? "0 18px 48px rgba(0,0,0,.55)" : "0 18px 48px rgba(40,30,20,.16)",
    "--danger": dark ? "#F07A7A" : "#B3261E",
    "--ok": dark ? "#7FD19B" : "#2E7D4F",
    "--font-display": fonts[t.displayFont],
    "--scheme": dark ? "dark" : "light",
  };
  ring.slice(0, 8).forEach((c, i) => (tokens[`--ring-${i + 1}`] = c));
  return tokens;
}

export interface ContrastReport {
  textOnDominant: number;
  textOnSecondary: number;
  onAccent: number;
  accentVsDominant: number;
  /** true when every check meets WCAG AA (4.5 text, 3 UI) */
  ok: boolean;
}

export function contrastReport(t: ThemeDef): ContrastReport {
  const tok = themeTokens(t);
  const textOnDominant = contrast(tok["--fg"], t.dominant);
  const textOnSecondary = contrast(tok["--fg-30"], t.secondary);
  const onAccent = contrast(tok["--on-accent"], t.accent);
  const accentVsDominant = contrast(t.accent, t.dominant);
  return {
    textOnDominant,
    textOnSecondary,
    onAccent,
    accentVsDominant,
    ok: textOnDominant >= 4.5 && textOnSecondary >= 4.5 && onAccent >= 4.5 && accentVsDominant >= 3,
  };
}

/**
 * A harmonious random 60-30-10 triple: a near-neutral dominant, a secondary
 * one step off it, and a saturated accent at a harmony angle from the base hue.
 */
export function randomPalette(rand: () => number = Math.random): Palette {
  const h = Math.floor(rand() * 360);
  const dark = rand() < 0.5;
  const dominant = hslToHex({ h, s: 0.12 + rand() * 0.18, l: dark ? 0.07 + rand() * 0.05 : 0.93 + rand() * 0.04 });
  const secondary = hslToHex({ h, s: 0.12 + rand() * 0.2, l: dark ? 0.14 + rand() * 0.05 : 0.85 + rand() * 0.05 });
  const offsets = [150, 180, 210, 30, 120];
  const ah = h + offsets[Math.floor(rand() * offsets.length)];
  const accent = hslToHex({ h: ah, s: 0.55 + rand() * 0.3, l: dark ? 0.62 + rand() * 0.1 : 0.34 + rand() * 0.1 });
  return { dominant, secondary, accent };
}

/** Where a theme reference can point. */
export interface ThemeSelection {
  global: string; // theme id
  sections: Partial<Record<Section, string>>;
}

export const DEFAULT_SELECTION: ThemeSelection = { global: DEFAULT_THEME_ID, sections: {} };

export function resolveTheme(id: string | undefined, customs: ThemeDef[]): ThemeDef {
  return (
    customs.find((c) => c.id === id) ??
    PRESETS.find((p) => p.id === id) ??
    PRESETS.find((p) => p.id === DEFAULT_THEME_ID)!
  );
}
