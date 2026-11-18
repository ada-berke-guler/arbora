import { useEffect, useState } from "react";
import { db, putSetting } from "../db/schema";
import { useI18n, type DictKey, type Lang } from "../i18n";
import Tree from "./tree/Tree";
import "./intro.css";

export const LOGO_SEC = 4.2;

interface Slide {
  id: string;
  title: DictKey;
  caption: DictKey;
  art: JSX.Element;
}

const SLIDES: Slide[] = [
  { id: "habits", title: "intro.habits.t", caption: "intro.habits.c", art: <HabitsArt /> },
  { id: "dayring", title: "intro.dayring.t", caption: "intro.dayring.c", art: <RingArt /> },
  { id: "calendar", title: "intro.calendar.t", caption: "intro.calendar.c", art: <MomentsArt /> },
  { id: "journal", title: "intro.journal.t", caption: "intro.journal.c", art: <JournalArt /> },
  { id: "trackers", title: "intro.trackers.t", caption: "intro.trackers.c", art: <TrackersArt /> },
  { id: "board", title: "intro.board.t", caption: "intro.board.c", art: <BoardArt /> },
  { id: "identity", title: "intro.identity.t", caption: "intro.identity.c", art: <IdentityArt /> },
  { id: "privacy", title: "intro.privacy.t", caption: "intro.privacy.c", art: <PrivacyArt /> },
];

/**
 * First run: the 3D tree grows from seed to fruit while the wordmark and
 * slogan rise, then a short captioned tour. A replay (from Settings) shows
 * only the logo beat. `hasCompletedIntroBefore` is monotonic — Replay only
 * clears `introSeen`.
 */
export default function Intro({ isReplay = false, initialPhase = "logo" }: { isReplay?: boolean; initialPhase?: "logo" | "slides" }) {
  const { t, lang } = useI18n();
  const [phase, setPhase] = useState<"logo" | "slides">(initialPhase);
  const [grown, setGrown] = useState(false);
  const [idx, setIdx] = useState(0);

  function finish() {
    void putSetting(db, "introSeen", true);
    void putSetting(db, "hasCompletedIntroBefore", true);
  }

  function afterLogo() {
    if (isReplay) finish();
    else setPhase("slides");
  }

  const next = () => (idx >= SLIDES.length - 1 ? finish() : setIdx((i) => i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === "logo") {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") afterLogo();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") finish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  const slide = SLIDES[idx];

  return (
    <div className="intro" role="dialog" aria-label={t("intro.label")}>
      <div className="intro-top">
        <LangSwitch lang={lang} />
        <button className="btn btn-small btn-ghost" onClick={finish}>{t("intro.skip")}</button>
      </div>

      {phase === "logo" ? (
        <div className={`intro-logo ${grown ? "is-grown" : ""}`} onClick={() => grown && afterLogo()}>
          <div className="intro-glow" aria-hidden />
          <Tree
            autoPlaySec={LOGO_SEC}
            size="min(68vmin, 26rem)"
            className="intro-tree"
            label="Arbora"
            maxDpr={2}
            onAutoPlayDone={() => {
              setGrown(true);
              window.setTimeout(afterLogo, 1400);
            }}
          />
          <h1 className="intro-name">
            {"Arbora".split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${0.5 + i * 0.09}s` }}>{ch}</span>
            ))}
          </h1>
          <p className="intro-slogan">{t("app.slogan")}</p>
        </div>
      ) : (
        <div className="intro-slides">
          <div className="intro-slide" key={slide.id}>
            <div className="intro-art">{slide.art}</div>
            <h2 className="intro-slide-title">{t(slide.title)}</h2>
            <p className="intro-caption">{t(slide.caption)}</p>
          </div>
          <div className="intro-controls">
            <div className="intro-dots" role="tablist" aria-label={t("intro.slides")}>
              {SLIDES.map((s, i) => (
                <button key={s.id} role="tab" aria-selected={i === idx}
                  aria-label={t("intro.slide", { n: i + 1, title: t(s.title) })}
                  className={`intro-dot ${i === idx ? "is-active" : ""}`} onClick={() => setIdx(i)} />
              ))}
            </div>
            <button className="btn btn-primary intro-next" onClick={next}>
              {idx === SLIDES.length - 1 ? t("intro.start") : t("intro.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div className="seg-control" role="group" aria-label="Dil / Language">
      {(["tr", "en"] as const).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => void putSetting(db, "lang", l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/* ── slide art: tiny themed illustrations, no real data ── */

function HabitsArt() {
  const s = [2, 1, 0, 2, 2, 0, 2, 0, 1, 2, 1, 2, 0, 3, 1];
  return (
    <svg viewBox="0 0 200 120" className="art">
      {s.map((v, i) => {
        const cx = 30 + (i % 5) * 35;
        const cy = 25 + Math.floor(i / 5) * 35;
        return (
          <g key={i} className="art-pop" style={{ animationDelay: `${i * 40}ms` }}>
            <circle cx={cx} cy={cy} r="10" className="art-ring" />
            {v === 2 && <circle cx={cx} cy={cy} r="10" className="art-fill" />}
            {v === 1 && <path d={`M ${cx - 10} ${cy} a 10 10 0 0 0 20 0 Z`} className="art-fill" />}
            {v === 3 && <path d={`M ${cx - 6} ${cy + 6} L ${cx + 6} ${cy - 6}`} className="art-ring" />}
          </g>
        );
      })}
    </svg>
  );
}

function arc(r1: number, r2: number, a1: number, a2: number) {
  const p = (r: number, a: number) => [100 + r * Math.cos(((a - 90) * Math.PI) / 180), 60 + r * Math.sin(((a - 90) * Math.PI) / 180)];
  const [x1, y1] = p(r2, a1);
  const [x2, y2] = p(r2, a2);
  const [x3, y3] = p(r1, a2);
  const [x4, y4] = p(r1, a1);
  const l = a2 - a1 > 180 ? 1 : 0;
  return `M${x1},${y1}A${r2},${r2} 0 ${l} 1 ${x2},${y2}L${x3},${y3}A${r1},${r1} 0 ${l} 0 ${x4},${y4}Z`;
}

function RingArt() {
  return (
    <svg viewBox="0 0 200 120" className="art">
      <circle cx="100" cy="60" r="54" className="art-cell" />
      <circle cx="100" cy="60" r="30" className="art-cell" />
      <path d={arc(18, 30, 0, 95)} style={{ fill: "var(--ring-2)" }} className="art-pop" />
      <path d={arc(18, 30, 105, 200)} style={{ fill: "var(--ring-1)" }} className="art-pop" />
      <path d={arc(36, 54, 20, 120)} style={{ fill: "var(--ring-4)" }} className="art-pop" />
      <path d={arc(36, 54, 150, 230)} style={{ fill: "var(--ring-6)" }} className="art-pop" />
      <path d={arc(36, 54, 300, 355)} style={{ fill: "var(--ring-3)" }} className="art-pop" />
      <circle cx="100" cy="60" r="12" className="art-fill" />
    </svg>
  );
}

function MomentsArt() {
  return (
    <svg viewBox="0 0 200 120" className="art">
      {Array.from({ length: 28 }, (_, i) => (
        <rect key={i} x={22 + (i % 7) * 23} y={14 + Math.floor(i / 7) * 25} width="17" height="19" rx="4" className="art-cell" />
      ))}
      <circle cx={22 + 3 * 23 + 8.5} cy={14 + 25 + 9.5} r="4.5" className="art-fill art-pop" />
      <circle cx={22 + 5 * 23 + 8.5} cy={14 + 3 * 25 + 9.5} r="4.5" className="art-fill art-pop" />
    </svg>
  );
}

function JournalArt() {
  return (
    <svg viewBox="0 0 200 120" className="art">
      <rect x="25" y="16" width="56" height="12" rx="6" className="art-fill" />
      {[130, 150, 105, 145, 80].map((w, i) => (
        <rect key={i} x="25" y={42 + i * 14} width={w} height="6" rx="3" className="art-line art-pop" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </svg>
  );
}

function TrackersArt() {
  const ys = [75, 55, 68, 40, 52, 34];
  return (
    <svg viewBox="0 0 200 120" className="art">
      <polyline points="20,75 55,55 90,68 125,40 160,52 185,34" className="art-stroke art-draw" fill="none" />
      <polyline points="20,95 55,90 90,96 125,84 160,88 185,80" className="art-stroke-muted art-draw" fill="none" />
      {[20, 55, 90, 125, 160, 185].map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3.6" className="art-fill" />)}
    </svg>
  );
}

function BoardArt() {
  return (
    <svg viewBox="0 0 200 120" className="art">
      <rect x="40" y="10" width="54" height="100" rx="9" className="art-cell" />
      <rect x="48" y="22" width="38" height="30" rx="3" className="art-fill art-pop" opacity=".8" />
      <rect x="48" y="58" width="38" height="18" rx="3" className="art-line art-pop" />
      <rect x="108" y="26" width="80" height="52" rx="5" className="art-cell" />
      <rect x="116" y="34" width="30" height="24" rx="2" className="art-fill art-pop" opacity=".7" />
      <rect x="150" y="34" width="30" height="16" rx="2" className="art-line art-pop" />
      <rect x="136" y="80" width="24" height="5" rx="2" className="art-cell" />
    </svg>
  );
}

function IdentityArt() {
  const { t } = useI18n();
  return <div className="art art-identity"><span>“{t("identity.placeholder")}”</span></div>;
}

function PrivacyArt() {
  return (
    <svg viewBox="0 0 200 120" className="art">
      <rect x="70" y="50" width="60" height="50" rx="8" className="art-fill" />
      <path d="M82 50 V38 a18 18 0 0 1 36 0 V50" className="art-stroke" fill="none" />
      <circle cx="100" cy="72" r="6" style={{ fill: "var(--on-accent)" }} />
      <rect x="98" y="74" width="4" height="12" rx="2" style={{ fill: "var(--on-accent)" }} />
    </svg>
  );
}
