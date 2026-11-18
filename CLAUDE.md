# Arbora v2 — agent rules and conventions

Spec: `docs/PRD.md`. Commands: `npm run test`, `npm run build` (both must pass before calling work done).

## Non-negotiables

- **Zero data collection.** No analytics, no telemetry, no third-party requests at
  runtime (fonts are bundled via @fontsource). The only network code is the opt-in
  vault sync in `lib/vault.ts`, and it only ever sends ciphertext.
- **Local-first.** IndexedDB via Dexie. Every row (except `settings`) has
  `id/createdAt/updatedAt/deletedAt`; call `touch()` on update; deletes are soft
  and paired with an undo toast (`showUndo`). No confirm dialogs for deletes.
- **Dates** are local `"YYYY-MM-DD"` strings; never derive a date from `toISOString()`.
- **Upserts** go through `d.transaction("rw", …)`.
- **Schema changes**: add `this.version(n+1)` in `db/schema.ts`; never edit v1.
  Any new table MUST be added to `TABLES` in `db/backup.ts` — a test asserts
  `TABLES` equals the Dexie table list.
- **Backups** accept v2 ("arbora") and v1 ("life-tracker") files; keep `migrateV1`.

## Themes (60-30-10)

- Components use ONLY tokens from `lib/theme.ts → themeTokens()`:
  `--bg` (60), `--surface` (30), `--accent` (10) plus derived `--fg`, `--fg-30`,
  `--muted(-30)`, `--accent-ink(-30)`, `--on-accent`, `--border(-strong)`, `--ring-1..8`.
  Never hard-code colors in CSS: per-section themes work by setting these vars
  inline on `<main>` (Shell → `sectionStyle`). The sidebar keeps the global theme.
- Text on surfaces (the 30%) uses the `-30` variants.
- Every preset must pass `contrastReport().ok` (tested).

## Day Ring (Gün Kadranı model)

- `RingTask.start` 0..1439, `end` in (start, start+1440] or `null` (point task).
  Half-open intervals: 10:00–11:00 and 11:00–12:00 don't collide.
- Blocks never overlap — `addRingTask`/`updateRingTask` throw `RingConflictError`
  (the UI shows which task and when). Point tasks never conflict.
- Geometry lives in `lib/ringMath.ts` (pure, tested). Dial viewBox 620×632,
  inner band 92–170, outer 192–268.

## 3D tree

- `components/tree/treeScene.ts` is lazy-imported; `Tree.tsx` shows an SVG of
  the same stage until WebGL is ready and keeps it when WebGL is unavailable
  (tests/jsdom). Only ONE Tree should be mounted in the shell at a time
  (sidebar on desktop, top bar on mobile via `useMedia`).

## i18n

- All UI strings go through `t("key")`; keys live in `i18n/tr.ts` (source of
  truth) and `i18n/en.ts`. `i18n.test.ts` fails on missing/mismatched keys.

## Testing notes

- `src/test/setup.ts` shims `Request` (jsdom AbortSignal vs undici) for the data router.
- Flow tests seed the singleton `db`, set `window.location.hash`, render `<App/>`.
