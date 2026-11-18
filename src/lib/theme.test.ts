import { describe, expect, it } from "vitest";
import { bestBW, contrast, ensureContrast, hexToHsl, hslToHex, mix } from "./color";
import { contrastReport, deriveRing, PRESETS, randomPalette, resolveTheme, themeTokens } from "./theme";

describe("color math", () => {
  it("contrast ratio matches WCAG endpoints", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1);
  });
  it("bestBW picks the readable side", () => {
    expect(bestBW("#F2E8CF")).toBe("#000000");
    expect(bestBW("#0F0E0C")).toBe("#FFFFFF");
  });
  it("hsl round-trips", () => {
    for (const c of ["#C9A96E", "#386641", "#77567A", "#E01A4F"]) {
      expect(contrast(hslToHex(hexToHsl(c)), c)).toBeLessThan(1.02);
    }
  });
  it("mix and ensureContrast", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(contrast(ensureContrast("#888888", "#999999", 4.5), "#999999")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("60-30-10 themes", () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))("preset %s passes the contrast checks", (_n, p) => {
    const r = contrastReport(p);
    expect(r.textOnDominant).toBeGreaterThanOrEqual(4.5);
    expect(r.textOnSecondary).toBeGreaterThanOrEqual(4.5);
    expect(r.onAccent).toBeGreaterThanOrEqual(4.5);
    expect(r.accentVsDominant).toBeGreaterThanOrEqual(3);
  });

  it("tokens map the three roles and derive the rest", () => {
    const tk = themeTokens(PRESETS[0]);
    expect(tk["--bg"]).toBe(PRESETS[0].dominant);
    expect(tk["--surface"]).toBe(PRESETS[0].secondary);
    expect(tk["--accent"]).toBe(PRESETS[0].accent);
    for (const k of ["--fg", "--muted", "--on-accent", "--border", "--ring-1", "--ring-8"]) expect(tk[k]).toBeTruthy();
  });

  it("derived text stays readable even for awkward custom picks", () => {
    for (let i = 0; i < 40; i++) {
      const p = randomPalette(mulberry(i + 1));
      const tk = themeTokens({ id: "x", name: "x", displayFont: "sans", ...p });
      expect(contrast(tk["--fg"], p.dominant)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tk["--on-accent"], p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tk["--accent-ink"], p.dominant)).toBeGreaterThanOrEqual(3);
    }
  });

  it("a custom theme gets eight ring colors anchored on its accent", () => {
    const ring = deriveRing({ dominant: "#101010", secondary: "#202020", accent: "#E01A4F" });
    expect(ring).toHaveLength(8);
    expect(ring[0]).toBe("#E01A4F");
    expect(new Set(ring).size).toBe(8);
  });

  it("unknown theme ids fall back to the default", () => {
    expect(resolveTheme("missing", []).id).toBe("dark-gold");
  });
});

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
