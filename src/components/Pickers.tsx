import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { addMonths, monthGrid, monthKey, todayLocal } from "../lib/dates";
import { fmtDate, monthName, useI18n, weekdayNames } from "../i18n";
import "./pickers.css";

/* Shared popover shell: outside-click / Escape close, flips at viewport edges. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState({ right: false, up: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    if (r.width === 0) return; // jsdom
    setFlip({ right: r.right > window.innerWidth - 8, up: r.bottom > window.innerHeight - 8 && r.top > r.height });
  }, [open]);

  return { open, setOpen, flip, rootRef, popRef };
}

function Pop({
  pop,
  label,
  children,
}: {
  pop: ReturnType<typeof usePopover>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={pop.popRef}
      className={`picker-pop ${pop.flip.right ? "pop-right" : ""} ${pop.flip.up ? "pop-up" : ""}`}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  );
}

interface DateProps {
  value: string;
  onChange: (d: string) => void;
  min?: string;
  max?: string;
  ariaLabel: string;
}

export function DatePicker({ value, onChange, min, max, ariaLabel }: DateProps) {
  const { t, locale } = useI18n();
  const pop = usePopover();
  const [view, setView] = useState(() => monthKey(value || todayLocal()));
  useEffect(() => {
    if (pop.open) setView(monthKey(value || todayLocal()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop.open]);

  const today = todayLocal();
  const out = (d: string) => (min && d < min) || (max && d > max);
  const minMonth = min ? monthKey(min) : null;
  const maxMonth = max ? monthKey(max) : null;

  return (
    <div className="picker" ref={pop.rootRef}>
      <button
        type="button"
        className="picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        onClick={() => pop.setOpen(!pop.open)}
      >
        <span>{value ? fmtDate(value, locale, { day: "numeric", month: "short", year: "numeric" }) : t("common.selectDate")}</span>
        <svg viewBox="0 0 16 16" aria-hidden className="picker-ico">
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {pop.open && (
        <Pop pop={pop} label={t("common.chooseDate", { label: ariaLabel })}>
          <div className="cal-head">
            <button type="button" className="btn btn-small btn-ghost" aria-label={t("common.prevMonth")}
              disabled={!!minMonth && view <= minMonth} onClick={() => setView(addMonths(view, -1))}>‹</button>
            <span className="cal-month">{monthName(view, locale)}</span>
            <button type="button" className="btn btn-small btn-ghost" aria-label={t("common.nextMonth")}
              disabled={!!maxMonth && view >= maxMonth} onClick={() => setView(addMonths(view, 1))}>›</button>
          </div>
          <div className="cal-grid">
            {weekdayNames(locale, "narrow").map((w, i) => (
              <span key={i} className="cal-dow">{w}</span>
            ))}
            {monthGrid(view).map((d, i) =>
              d === null ? (
                <span key={`b${i}`} />
              ) : (
                <button
                  type="button"
                  key={d}
                  className={`cal-day ${d === value ? "is-selected" : ""} ${d === today ? "is-today" : ""}`}
                  disabled={!!out(d)}
                  aria-label={fmtDate(d, locale, { day: "numeric", month: "long", year: "numeric" })}
                  aria-pressed={d === value}
                  onClick={() => {
                    onChange(d);
                    pop.setOpen(false);
                  }}
                >
                  {Number(d.slice(8))}
                </button>
              )
            )}
          </div>
          <div className="cal-foot">
            <button type="button" className="btn btn-small" disabled={!!out(today)}
              onClick={() => { onChange(today); pop.setOpen(false); }}>
              {t("common.today")}
            </button>
          </div>
        </Pop>
      )}
    </div>
  );
}

interface TimeProps {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  ariaLabel: string;
  step?: number;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * On-theme time picker. Picking an HOUR keeps the popup open (half a
 * selection); picking a MINUTE commits and closes. The trigger is also a
 * plain text input so keyboard users can just type "14:30".
 */
export function TimePicker({ value, onChange, ariaLabel, step = 5 }: TimeProps) {
  const { t } = useI18n();
  const pop = usePopover();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [h, m] = (value || "00:00").split(":").map(Number);
  const minutes = Array.from({ length: 60 / step }, (_, i) => i * step);
  const hourRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!pop.open || !hourRef.current) return;
    const sel = hourRef.current.querySelector<HTMLElement>(".is-selected");
    sel?.scrollIntoView?.({ block: "center" });
  }, [pop.open]);

  function commitDraft() {
    const ok = /^(\d{1,2}):(\d{2})$/.exec(draft.trim());
    if (ok && +ok[1] < 24 && +ok[2] < 60) onChange(`${p2(+ok[1])}:${ok[2]}`);
    else setDraft(value);
  }

  return (
    <div className="picker" ref={pop.rootRef}>
      <div className="picker-trigger time-trigger">
        <input
          className="time-text"
          value={draft}
          inputMode="numeric"
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === "Enter" && commitDraft()}
        />
        <button type="button" className="time-open" aria-label={t("common.chooseTime", { label: ariaLabel })}
          aria-haspopup="dialog" aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}>
          <svg viewBox="0 0 16 16" aria-hidden className="picker-ico">
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {pop.open && (
        <Pop pop={pop} label={t("common.chooseTime", { label: ariaLabel })}>
          <div className="time-cols">
            <div className="time-col" ref={hourRef}>
              {Array.from({ length: 24 }, (_, i) => (
                <button type="button" key={i} className={`time-opt ${i === h ? "is-selected" : ""}`}
                  aria-label={t("common.hour", { n: p2(i) })} aria-pressed={i === h}
                  onClick={() => onChange(`${p2(i)}:${p2(m || 0)}`)}>
                  {p2(i)}
                </button>
              ))}
            </div>
            <div className="time-col">
              {minutes.map((mm) => (
                <button type="button" key={mm} className={`time-opt ${mm === m ? "is-selected" : ""}`}
                  aria-label={t("common.minute", { n: p2(mm) })} aria-pressed={mm === m}
                  onClick={() => { onChange(`${p2(h || 0)}:${p2(mm)}`); pop.setOpen(false); }}>
                  {p2(mm)}
                </button>
              ))}
            </div>
          </div>
          <div className="cal-foot">
            <button type="button" className="btn btn-small" onClick={() => {
              const d = new Date();
              onChange(`${p2(d.getHours())}:${p2(d.getMinutes())}`);
              pop.setOpen(false);
            }}>{t("common.now")}</button>
          </div>
        </Pop>
      )}
    </div>
  );
}

interface ColorProps {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
  label: string;
}

/** Palette swatches + a free color picker (Gün Kadranı style). */
export function ColorPicker({ colors, value, onChange, label }: ColorProps) {
  const { t } = useI18n();
  const inPalette = colors.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="swatches" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch-btn"
          style={{ background: c }}
          aria-pressed={c.toLowerCase() === value.toLowerCase()}
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
      <span className={`swatch-custom ${!inPalette ? "is-on" : ""}`} title={t("common.customColor")}
        style={!inPalette ? { background: value } : undefined}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"} aria-label={t("common.customColor")}
          onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </span>
    </div>
  );
}
