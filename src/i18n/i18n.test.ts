// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tr } from "./tr";
import { en } from "./en";
import { translate } from "./index";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe("i18n", () => {
  it("TR and EN have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it("every literal t(\"…\") key used in the app exists", () => {
    const src = join(__dirname, "..");
    const missing = new Set<string>();
    for (const f of walk(src)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/\bt\(\s*"([a-z0-9.\-]+)"/gi)) if (!(m[1] in tr)) missing.add(`${m[1]} (${f})`);
    }
    expect([...missing]).toEqual([]);
  });

  it("interpolates variables", () => {
    expect(translate("tr", "journey.dayOf", { day: 3, total: 10 })).toBe("Gün 3 / 10");
    expect(translate("en", "journey.dayOf", { day: 3, total: 10 })).toBe("Day 3 of 10");
  });
});
