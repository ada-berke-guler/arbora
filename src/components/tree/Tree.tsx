import { useEffect, useRef, useState } from "react";
import { mix } from "../../lib/color";
import type { TreeColors, TreeScene } from "./treeScene";

export const STAGE_COUNT = 6;

/** 0 seed · 1 sprout · 2 seedling · 3 sapling · 4 young tree · 5 fruit. Day 1 is a sprout. */
export function stageIndexForProgress(p: number): number {
  if (p < 0.15) return 1;
  if (p < 0.35) return 2;
  if (p < 0.6) return 3;
  if (p < 0.88) return 4;
  return 5;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readColors(el: HTMLElement): TreeColors {
  const cs = getComputedStyle(el);
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  const accent = v("--accent", "#C9A96E");
  const fg = v("--fg", "#F5F0E8");
  const soil = v("--surface-raised", "#2A2A2A");
  const isHexColor = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  const safe = (c: string, fb: string) => (isHexColor(c) ? c : fb);
  const a = safe(accent, "#C9A96E");
  return {
    leaf: mix(a, "#2F6B3A", 0.35),
    leafLight: mix(a, "#9ED36A", 0.3),
    trunk: mix("#6B4A32", a, 0.12),
    soil: safe(soil, "#2A2A2A"),
    fruit: mix("#D9473F", a, 0.18),
    seed: mix("#8A6440", safe(fg, "#F5F0E8"), 0.1),
  };
}

interface Props {
  /** 0..1 journey progress. Ignored while `autoPlaySec` runs. */
  progress?: number;
  autoPlaySec?: number;
  onAutoPlayDone?: () => void;
  size?: number | string;
  rotate?: boolean;
  className?: string;
  label?: string;
  /** Re-read theme colors when this changes (theme id). */
  themeKey?: string;
  maxDpr?: number;
}

/**
 * Arbora's growing tree. Renders a lightweight SVG immediately, then swaps in
 * the Three.js scene once it has loaded — and keeps the SVG when WebGL is
 * unavailable (tests, old devices) or the person prefers reduced motion
 * with no autoplay.
 */
export default function Tree({
  progress = 0,
  autoPlaySec,
  onAutoPlayDone,
  size = 120,
  rotate = true,
  className,
  label,
  themeKey,
  maxDpr = 2,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TreeScene | null>(null);
  const [ready, setReady] = useState(false);
  const [svgP, setSvgP] = useState(autoPlaySec ? 0 : progress);
  const doneRef = useRef(onAutoPlayDone);
  doneRef.current = onAutoPlayDone;

  /* mount the 3D scene (lazy) */
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const reduced = prefersReducedMotion();
    void (async () => {
      const mod = await import("./treeScene").catch(() => null);
      if (!mod || disposed || !canvasRef.current || !wrapRef.current || !mod.webglAvailable()) {
        if (disposed) return;
        if (autoPlaySec) {
          setSvgP(1);
          window.setTimeout(() => doneRef.current?.(), reduced ? 600 : autoPlaySec * 1000);
        }
        return;
      }
      let scene: TreeScene;
      try {
        scene = new mod.TreeScene({
          canvas: canvasRef.current,
          colors: readColors(wrapRef.current),
          rotate: rotate && !reduced,
          maxDpr,
        });
      } catch {
        return; // context creation can still fail (GPU blocklist) — stay on the SVG
      }
      sceneRef.current = scene;
      const fit = () => {
        if (!wrapRef.current) return; // unmounted between observer tick and callback
        const r = wrapRef.current.getBoundingClientRect();
        scene.resize(Math.max(1, r.width), Math.max(1, r.height));
      };
      fit();
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(fit);
        ro.observe(wrapRef.current);
      }
      if (autoPlaySec) {
        if (reduced) {
          scene.setProgress(1, true);
          window.setTimeout(() => doneRef.current?.(), 600);
        } else scene.play(autoPlaySec, () => doneRef.current?.());
      } else scene.setProgress(progress, true);
      setReady(true);
    })();
    const onVis = () => sceneRef.current?.resume();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoPlaySec) return;
    setSvgP(progress);
    sceneRef.current?.setProgress(progress);
  }, [progress, autoPlaySec]);

  useEffect(() => {
    if (sceneRef.current && wrapRef.current) sceneRef.current.setColors(readColors(wrapRef.current));
  }, [themeKey]);

  const dim = typeof size === "number" ? `${size}px` : size;

  return (
    <div
      ref={wrapRef}
      className={`tree ${className ?? ""}`}
      style={{ width: dim, height: dim }}
      role="img"
      aria-label={label}
    >
      <canvas ref={canvasRef} className="tree-canvas" style={{ opacity: ready ? 1 : 0 }} aria-hidden />
      {!ready && <TreeSvg progress={svgP} animate={!!autoPlaySec} />}
    </div>
  );
}

/** 2D fallback that shows the same stage the 3D tree would. */
export function TreeSvg({ progress, animate }: { progress: number; animate?: boolean }) {
  const stage = stageIndexForProgress(progress);
  const show = (s: number) => (stage >= s ? 1 : 0);
  return (
    <svg viewBox="0 0 120 120" className={`tree-svg ${animate ? "is-anim" : ""}`} aria-hidden>
      <ellipse cx="60" cy="100" rx="40" ry="6" fill="var(--surface-raised)" />
      <ellipse cx="60" cy="96" rx="6" ry="4" fill="var(--muted)" opacity={stage >= 3 ? 0.3 : 1} />
      <path d="M60 96 L60 80" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity={show(1)} />
      <path d="M60 82 C52 80 49 74 51 69" stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity={stage >= 1 && stage < 4 ? 1 : 0} />
      <path d="M60 82 C68 80 71 74 69 69" stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity={stage >= 1 && stage < 4 ? 1 : 0} />
      <path d="M60 80 L60 62" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity={show(2)} />
      <path d="M55 98 L58 52 L62 52 L65 98 Z" fill="var(--accent-strong)" opacity={show(3)} />
      <g opacity={show(3)}>
        <circle cx="50" cy="48" r="12" fill="var(--accent)" opacity=".85" />
        <circle cx="70" cy="48" r="12" fill="var(--accent)" opacity=".85" />
        <circle cx="60" cy="36" r="13" fill="var(--accent)" />
      </g>
      <g opacity={show(4)}>
        <circle cx="40" cy="52" r="11" fill="var(--accent)" opacity=".8" />
        <circle cx="80" cy="52" r="11" fill="var(--accent)" opacity=".8" />
        <circle cx="52" cy="28" r="12" fill="var(--accent)" opacity=".9" />
        <circle cx="70" cy="26" r="12" fill="var(--accent)" opacity=".9" />
      </g>
      <g opacity={show(5)} fill="var(--danger)">
        <circle cx="47" cy="42" r="3.4" />
        <circle cx="72" cy="36" r="3.4" />
        <circle cx="60" cy="52" r="3.6" />
        <circle cx="80" cy="56" r="3.2" />
      </g>
    </svg>
  );
}
