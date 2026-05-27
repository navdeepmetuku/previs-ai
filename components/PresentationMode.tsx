"use client";

/**
 * PresentationMode — fullscreen cinematic viewer.
 *
 * Feels like a director's pitch presentation:
 *   • Dark immersive fullscreen overlay
 *   • Anamorphic letterbox framing
 *   • Smooth cross-fade between shots
 *   • Auto-play with per-shot duration
 *   • Keyboard navigation (← → Space Esc)
 *   • Thumbnail filmstrip at bottom
 *   • HUD overlay with shot metadata
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { Project, Scene } from "@/types";

interface Props {
  project: Project;
  startIndex?: number;
  onClose: () => void;
}

const DEFAULT_DURATION = 4; // seconds per shot in autoplay
const FADE_MS          = 600;

const MOOD_BG_CLASS: Record<string, string> = {
  Tense:       "mood-bg-tense",
  Dramatic:    "mood-bg-dramatic",
  Romantic:    "mood-bg-romantic",
  Action:      "mood-bg-action",
  Mysterious:  "mood-bg-mysterious",
  Melancholic: "mood-bg-melancholic",
  Triumphant:  "mood-bg-triumphant",
  Horror:      "mood-bg-horror",
  Comedic:     "mood-bg-comedic",
  Serene:      "mood-bg-serene",
};
const TRANSITION_LABELS: Record<string, string> = {
  "cut":       "CUT TO",
  "dissolve":  "DISSOLVE",
  "fade":      "FADE",
  "wipe":      "WIPE",
  "smash-cut": "SMASH CUT",
  "match-cut": "MATCH CUT",
};

export default function PresentationMode({ project, startIndex = 0, onClose }: Props) {
  const scenes = project.scenes;
  const [idx,        setIdx]        = useState(startIndex);
  const [visible,    setVisible]    = useState(true);   // controls opacity fade
  const [autoPlay,   setAutoPlay]   = useState(false);
  const [showHUD,    setShowHUD]    = useState(true);
  const [transLabel, setTransLabel] = useState<string | null>(null);

  const autoTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stripRef   = useRef<HTMLDivElement>(null);

  const scene = scenes[idx];
  const isFirst = idx === 0;
  const isLast  = idx === scenes.length - 1;

  // Preload adjacent images
  useEffect(() => {
    [idx - 1, idx + 1].forEach(i => {
      const s = scenes[i];
      if (s?.imageUrl) {
        const img = new Image();
        img.src = s.imageUrl;
      }
    });
  }, [idx, scenes]);

  // Scroll thumbnail strip to keep active shot visible
  useEffect(() => {
    if (!stripRef.current) return;
    const active = stripRef.current.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [idx]);

  // Cross-fade then update index
  const goTo = useCallback((nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= scenes.length) return;
    if (fadeTimer.current) clearTimeout(fadeTimer.current);

    // Show transition label
    const outScene = scenes[idx];
    const tType    = outScene.timelineMeta?.transitionType ?? "cut";
    if (tType !== "cut") {
      setTransLabel(TRANSITION_LABELS[tType] ?? tType.toUpperCase());
      fadeTimer.current = setTimeout(() => setTransLabel(null), FADE_MS + 200);
    }

    setVisible(false);
    fadeTimer.current = setTimeout(() => {
      setIdx(nextIdx);
      setVisible(true);
    }, tType === "cut" ? 80 : FADE_MS);
  }, [idx, scenes]);

  const next = useCallback(() => { if (!isLast)  goTo(idx + 1); }, [idx, isLast, goTo]);
  const prev = useCallback(() => { if (!isFirst) goTo(idx - 1); }, [idx, isFirst, goTo]);

  // Autoplay
  useEffect(() => {
    if (!autoPlay) { if (autoTimer.current) clearTimeout(autoTimer.current); return; }
    const dur = (scene.timelineMeta?.durationSeconds ?? DEFAULT_DURATION) * 1000;
    autoTimer.current = setTimeout(() => {
      if (isLast) setAutoPlay(false);
      else next();
    }, dur);
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
  }, [autoPlay, idx, isLast, next, scene]);

  // Keyboard handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": e.preventDefault(); next(); break;
        case "ArrowLeft":  case "ArrowUp":   e.preventDefault(); prev(); break;
        case " ":          e.preventDefault(); setAutoPlay(a => !a); break;
        case "Escape":     onClose(); break;
        case "h":          setShowHUD(h => !h); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black flex flex-col transition-all duration-700`}
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic presentation"
    >
      {/* Ambient mood background — shifts with each scene */}
      <div
        className={`absolute inset-0 pointer-events-none transition-all duration-[700ms] ${MOOD_BG_CLASS[scene.mood] ?? ""}`}
        aria-hidden
      />
      {/* ── Main viewer ── */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">

        {/* Image */}
        <div
          className="relative w-full"
          style={{
            maxHeight: "calc(100vh - 120px)",
            aspectRatio: "2.39 / 1",  // anamorphic format
          }}
        >
          {/* Cross-fade image */}
          <div
            className="absolute inset-0 transition-opacity"
            style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
          >
            {scene.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scene.imageUrl}
                alt={scene.title}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                <span className="text-white/10 text-4xl">🎬</span>
              </div>
            )}
          </div>

          {/* Letterbox bars — 2.39:1 crop feel */}
          <div className="absolute inset-x-0 top-0    h-[4%] bg-black pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-[4%] bg-black pointer-events-none z-10" />

          {/* Subtle vignette */}
          <div className="absolute inset-0 pointer-events-none z-10"
            style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />

          {/* Frame corners */}
          {(["top-[5%] left-4 border-t border-l","top-[5%] right-4 border-t border-r",
             "bottom-[5%] left-4 border-b border-l","bottom-[5%] right-4 border-b border-r"] as const)
            .map((cls, i) => (
              <div key={i} className={`absolute w-6 h-6 z-20 pointer-events-none border-white/25 ${cls}`} />
            ))}

          {/* HUD overlay */}
          {showHUD && (
            <>
              {/* Top-left: shot info */}
              <div className="absolute top-[6%] left-5 z-20 flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                  {project.title}
                </span>
                <span className="text-[9px] font-mono text-white/20">
                  Shot {String(scene.order).padStart(2, "0")} / {scenes.length}
                </span>
              </div>

              {/* Top-right: shot type + lens */}
              <div className="absolute top-[6%] right-5 z-20 text-right flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                  {scene.shotType}
                </span>
                {scene.cinematicMeta?.focalLengthMm && (
                  <span className="text-[9px] font-mono text-white/20">
                    {scene.cinematicMeta.focalLengthMm}mm
                  </span>
                )}
              </div>

              {/* Bottom-left: title + mood */}
              <div className="absolute bottom-[6%] left-5 z-20">
                <p className="text-lg font-bold text-white leading-tight drop-shadow-lg">
                  {scene.title}
                </p>
                <p className="text-[10px] font-mono text-white/40 mt-0.5">{scene.mood} · {scene.lighting}</p>
              </div>

              {/* Bottom-right: location */}
              <div className="absolute bottom-[6%] right-5 z-20 text-right">
                <p className="text-[10px] font-mono text-white/30 max-w-[180px] text-right leading-snug">
                  {scene.location}
                </p>
              </div>
            </>
          )}

          {/* Transition label flash */}
          {transLabel && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <span className="text-[11px] font-mono text-white/50 tracking-[0.3em] uppercase">
                {transLabel}
              </span>
            </div>
          )}
        </div>

        {/* ── Click nav zones ── */}
        {!isFirst && (
          <button onClick={prev}
            className="absolute left-0 top-0 bottom-[120px] w-1/5 z-30 cursor-w-resize opacity-0 hover:opacity-100 flex items-center justify-start pl-4 transition-opacity"
            aria-label="Previous shot">
            <span className="text-white/40 text-2xl">‹</span>
          </button>
        )}
        {!isLast && (
          <button onClick={next}
            className="absolute right-0 top-0 bottom-[120px] w-1/5 z-30 cursor-e-resize opacity-0 hover:opacity-100 flex items-center justify-end pr-4 transition-opacity"
            aria-label="Next shot">
            <span className="text-white/40 text-2xl">›</span>
          </button>
        )}
      </div>

      {/* ── Bottom strip ── */}
      <div className="relative shrink-0 bg-black/90 border-t border-white/5 backdrop-blur-sm" style={{ height: 120 }}>
        {/* Controls row */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <button onClick={prev} disabled={isFirst}
              className="text-white/35 hover:text-white disabled:opacity-20 transition-colors text-lg px-1"
              aria-label="Previous">‹</button>

            <button onClick={() => setAutoPlay(a => !a)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[10px] font-mono text-white/40 hover:text-white hover:border-white/25 transition-all"
              aria-label={autoPlay ? "Pause" : "Play"}>
              {autoPlay
                ? <><span className="text-[8px]">⏸</span> Pause</>
                : <><span className="text-[8px]">▶</span> Auto-play</>
              }
            </button>

            <button onClick={next} disabled={isLast}
              className="text-white/35 hover:text-white disabled:opacity-20 transition-colors text-lg px-1"
              aria-label="Next">›</button>

            <span className="text-[9px] font-mono text-white/20">
              {idx + 1} <span className="text-white/10">/</span> {scenes.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setShowHUD(h => !h)}
              className={`text-[9px] font-mono transition-colors ${showHUD ? "text-amber-400/60" : "text-white/20 hover:text-white/40"}`}>
              HUD
            </button>
            <span className="hidden sm:inline text-[8px] font-mono text-white/12">
              ← → · Space · H · Esc
            </span>
            <button onClick={onClose}
              className="rounded-full border border-white/8 px-3 py-1 text-[9px] font-mono text-white/30 hover:text-white hover:border-white/20 transition-all"
              aria-label="Exit presentation">
              ✕ Exit
            </button>
          </div>
        </div>

        {/* Filmstrip thumbnail row */}
        <div
          ref={stripRef}
          className="flex gap-1.5 overflow-x-auto items-center px-3 py-1.5 timeline-scroll"
          style={{ height: 72 }}
        >
          {scenes.map((s, i) => (
            <button
              key={s.id}
              data-idx={i}
              onClick={() => goTo(i)}
              className={[
                "relative shrink-0 rounded-sm overflow-hidden border transition-all",
                "h-10 aspect-video",
                i === idx
                  ? "border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                  : "border-white/10 opacity-50 hover:opacity-80 hover:border-white/30",
              ].join(" ")}
              aria-label={`Shot ${i + 1}: ${s.title}`}
              aria-pressed={i === idx}
            >
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt={s.title}
                  className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-zinc-900" />
              )}
              {/* Shot number */}
              <div className="absolute top-0.5 left-0.5 h-3 w-3 rounded-sm bg-amber-400 flex items-center justify-center">
                <span className="text-[6px] font-black text-black leading-none">{s.order}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
