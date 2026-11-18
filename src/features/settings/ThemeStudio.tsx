import { useMemo, useState, type CSSProperties } from "react";
import { isHex } from "../../lib/color";
import {
  contrastReport,
  PRESETS,
  randomPalette,
  SECTIONS,
  themeTokens,
  type DisplayFont,
  type Section,
  type ThemeDef,
} from "../../lib/theme";
import {
  removeCustomTheme,
  restoreSelection,
  saveCustomTheme,
  setGlobalTheme,
  setSectionTheme,
  useAppearance,
} from "../../lib/appearance";
import { showToast, showUndo } from "../../lib/undoBus";
import { db, restoreRow } from "../../db/schema";
import { useI18n, type DictKey } from "../../i18n";
import Icon from "../../components/Icons";

type Scope = "global" | Section;

const SECTION_LABEL: Record<Section, DictKey> = {
  habits: "nav.habits",
  dayring: "nav.dayring",
  calendar: "nav.calendar",
  journal: "nav.journal",
  trackers: "nav.trackers",
  board: "nav.board",
  identity: "nav.identity",
  contact: "nav.contact",
};

/** Theme card: a literal 60/30/10 swatch so the rule is visible, not abstract. */
function ThemeCard({ th, active, onPick, onEdit }: { th: ThemeDef; active: boolean; onPick: () => void; onEdit?: () => void }) {
  const { t } = useI18n();
  return (
    <div className={`theme-card ${active ? "is-active" : ""}`}>
      <button className="theme-card-main" onClick={onPick} aria-pressed={active} aria-label={t("theme.select", { name: th.name })}>
        <span className="ratio" aria-hidden>
          <span style={{ background: th.dominant, flex: 6 }} />
          <span style={{ background: th.secondary, flex: 3 }} />
          <span style={{ background: th.accent, flex: 1 }} />
        </span>
        <span className="theme-card-name">{th.name}</span>
        {active && <span className="chip">{t("theme.active")}</span>}
      </button>
      {onEdit && (
        <button className="btn btn-small btn-ghost theme-card-edit" onClick={onEdit} aria-label={t("theme.editX", { name: th.name })}>
          {t("common.edit")}
        </button>
      )}
    </div>
  );
}

export default function ThemeStudio() {
  const { t } = useI18n();
  const { selection, customs, global, themeFor } = useAppearance();
  const [scope, setScope] = useState<Scope>("global");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<ThemeDef, "id">>(() => ({
    name: t("theme.newName"),
    dominant: global.dominant,
    secondary: global.secondary,
    accent: global.accent,
    displayFont: global.displayFont,
  }));

  const activeId = scope === "global" ? selection.global : selection.sections[scope] ?? null;

  async function pick(id: string) {
    if (scope === "global") await setGlobalTheme(id);
    else await setSectionTheme(scope, id);
    showToast(t("theme.applied"));
  }

  function edit(th: ThemeDef) {
    setEditId(customs.some((c) => c.id === th.id) ? th.id : null);
    setDraft({ name: th.name, dominant: th.dominant, secondary: th.secondary, accent: th.accent, displayFont: th.displayFont });
    document.getElementById("theme-builder")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function save(asNew: boolean) {
    const id = await saveCustomTheme({ ...draft, name: draft.name.trim() || t("theme.newName") }, asNew ? undefined : editId ?? undefined);
    setEditId(id);
    await pick(id);
  }

  return (
    <div className="stack">
      <div className="scope-bar">
        <label className="field" style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
          <span>{t("theme.scope")}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="global">{t("theme.scopeGlobal")}</option>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>{t("theme.scopeSection", { name: t(SECTION_LABEL[s]) })}</option>
            ))}
          </select>
        </label>
        {scope !== "global" && (
          <button className="btn" disabled={!selection.sections[scope]} onClick={() => void setSectionTheme(scope, null)}>
            {t("theme.useGlobal")}
          </button>
        )}
      </div>

      <div>
        <h3 className="panel-title">{t("theme.presets")}</h3>
        <div className="theme-grid">
          {PRESETS.map((p) => (
            <ThemeCard key={p.id} th={p} active={activeId === p.id} onPick={() => void pick(p.id)} onEdit={() => edit(p)} />
          ))}
        </div>
      </div>

      {customs.length > 0 && (
        <div>
          <h3 className="panel-title">{t("theme.custom")}</h3>
          <div className="theme-grid">
            {customs.map((c) => (
              <div key={c.id} className="custom-wrap">
                <ThemeCard th={c} active={activeId === c.id} onPick={() => void pick(c.id)} onEdit={() => edit(c)} />
                <button className="del custom-del" aria-label={`${t("common.delete")}: ${c.name}`} onClick={async () => {
                  const prev = await removeCustomTheme(c.id);
                  showUndo({
                    message: t("theme.removed", { name: c.name }),
                    undo: () => void restoreRow(db, "customThemes", c.id).then(() => restoreSelection(prev)),
                  });
                  if (editId === c.id) setEditId(null);
                }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Builder draft={draft} setDraft={setDraft} editing={!!editId} onSave={(n) => void save(n)} />

      <SectionTable themeFor={themeFor} />
    </div>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const shown = text.toUpperCase() === value.toUpperCase() ? text : value;
  return (
    <div className="color-field">
      <label className="color-well" style={{ background: value }}>
        <input type="color" value={value} aria-label={label} onChange={(e) => { onChange(e.target.value.toUpperCase()); setText(e.target.value.toUpperCase()); }} />
      </label>
      <div className="color-meta">
        <span className="field-label">{label}</span>
        <span className="muted" style={{ fontSize: ".75rem" }}>{hint}</span>
        <input className="input mono hex-input" value={shown} maxLength={7} aria-label={`${label} HEX`}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setText(v);
            if (isHex(v) && v.length === 7) onChange(v.toUpperCase());
          }} />
      </div>
    </div>
  );
}

function Builder({ draft, setDraft, editing, onSave }: {
  draft: Omit<ThemeDef, "id">;
  setDraft: (d: Omit<ThemeDef, "id">) => void;
  editing: boolean;
  onSave: (asNew: boolean) => void;
}) {
  const { t } = useI18n();
  const def: ThemeDef = useMemo(() => ({ id: "draft", ...draft }), [draft]);
  const tokens = useMemo(() => themeTokens(def), [def]);
  const report = useMemo(() => contrastReport(def), [def]);
  const set = (k: keyof Omit<ThemeDef, "id">) => (v: string) => setDraft({ ...draft, [k]: v });
  const fmtR = (n: number) => `${n.toFixed(1)}:1`;

  return (
    <section className="builder" id="theme-builder" aria-label={t("theme.builder")}>
      <h3 className="panel-title">{t("theme.builder")}</h3>
      <p className="muted" style={{ fontSize: ".85rem", marginBottom: "1rem" }}>{t("theme.builderLead")}</p>
      <div className="builder-cols">
        <div>
          <ColorField label={t("theme.dominant")} hint={t("theme.dominantHint")} value={draft.dominant} onChange={set("dominant")} />
          <ColorField label={t("theme.secondary")} hint={t("theme.secondaryHint")} value={draft.secondary} onChange={set("secondary")} />
          <ColorField label={t("theme.accent")} hint={t("theme.accentHint")} value={draft.accent} onChange={set("accent")} />
          <div className="field">
            <span>{t("theme.font")}</span>
            <div className="seg-control">
              {(["serif", "sans", "mono"] as DisplayFont[]).map((f) => (
                <button key={f} aria-pressed={draft.displayFont === f} onClick={() => setDraft({ ...draft, displayFont: f })}>
                  {t(`theme.font.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-block" onClick={() => setDraft({ ...draft, ...randomPalette() })}>
            <Icon name="shuffle" size={16} /> {t("theme.random")}
          </button>
        </div>

        <div>
          <span className="field-label">{t("theme.preview")}</span>
          <div className="preview" style={tokens as CSSProperties}>
            <div className="preview-side">
              <span className="preview-brand">Arbora</span>
              <span className="preview-nav is-on" />
              <span className="preview-nav" />
              <span className="preview-nav" />
            </div>
            <div className="preview-main">
              <span className="preview-title">{t("theme.previewTitle")}</span>
              <div className="preview-panel">
                <span>{t("theme.previewText")}</span>
                <span className="preview-row">
                  <span className="preview-btn">{t("theme.previewBtn")}</span>
                  <span className="preview-ghost">{t("common.cancel")}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="ratio ratio-lg" aria-hidden>
            <span style={{ background: draft.dominant, flex: 6, color: tokens["--fg"] }}>60</span>
            <span style={{ background: draft.secondary, flex: 3, color: tokens["--fg-30"] }}>30</span>
            <span style={{ background: draft.accent, flex: 1, color: tokens["--on-accent"] }}>10</span>
          </div>
          <div className={`contrast ${report.ok ? "is-ok" : "is-bad"}`} role="status">
            <strong>{t("theme.contrast")}: {report.ok ? t("theme.contrastOk") : t("theme.contrastBad")}</strong>
            <ul>
              <li><span>{t("theme.c.text")}</span><span className="mono">{fmtR(report.textOnDominant)}</span></li>
              <li><span>{t("theme.c.panel")}</span><span className="mono">{fmtR(report.textOnSecondary)}</span></li>
              <li><span>{t("theme.c.button")}</span><span className="mono">{fmtR(report.onAccent)}</span></li>
              <li className={report.accentVsDominant < 3 ? "warn" : ""}><span>{t("theme.c.accent")}</span><span className="mono">{fmtR(report.accentVsDominant)}</span></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: "1rem" }}>
        <label className="field" style={{ margin: 0, flex: 1, minWidth: "10rem" }}>
          <span>{t("common.name")}</span>
          <input value={draft.name} maxLength={30} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        {editing && <button className="btn" style={{ alignSelf: "end" }} onClick={() => onSave(false)}>{t("theme.update")}</button>}
        <button className="btn btn-primary" style={{ alignSelf: "end" }} onClick={() => onSave(true)}>{t("theme.saveNew")}</button>
      </div>
    </section>
  );
}

function SectionTable({ themeFor }: { themeFor: (s: Section) => ThemeDef }) {
  const { t } = useI18n();
  const { selection, customs } = useAppearance();
  const all = [...PRESETS, ...customs];
  return (
    <section>
      <h3 className="panel-title">{t("theme.sections")}</h3>
      <p className="muted" style={{ fontSize: ".85rem", marginBottom: ".8rem" }}>{t("theme.sectionsLead")}</p>
      <ul className="section-list">
        {SECTIONS.map((s) => {
          const th = themeFor(s);
          return (
            <li key={s}>
              <span className="ratio ratio-sm" aria-hidden>
                <span style={{ background: th.dominant, flex: 6 }} />
                <span style={{ background: th.secondary, flex: 3 }} />
                <span style={{ background: th.accent, flex: 1 }} />
              </span>
              <span className="section-name">{t(SECTION_LABEL[s])}</span>
              <select className="input" value={selection.sections[s] ?? ""} aria-label={t("theme.scopeSection", { name: t(SECTION_LABEL[s]) })}
                onChange={(e) => void setSectionTheme(s, e.target.value || null)}>
                <option value="">{t("theme.useGlobal")}</option>
                {all.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
