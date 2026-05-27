"use client";

/**
 * CinematicTimeline — horizontal shot-sequencing strip.
 *
 * Feels like a simplified DaVinci Resolve / Premiere Pro timeline.
 * Each scene = one shot block. Clicking selects the scene.
 * Drag-and-drop reordering with automatic renumbering.
 * Transition badges between shots.
 */

import { useState, useRef, useCallback } from "react";
import type { Scene } from "@/types";

interface Props {
  scenes:          Scene[];
  selectedId:      string | null;
  onSelect:        (scene: Scene) => void;
  onReorder:       (scenes: Scene[]) => void;
  onUpdateScene:   (scene: Scene) => void;
}

// ── Transition options ───────────────────────────────────────────────────────
type TransitionType = NonNullable<NonNullable<Scene["timelineMeta"]>["transitionType"]>;

const TRANSITIONS: { value: TransitionType; label: string; symbol: string }[] = [
  { value: "cut",       label: "Cut",       symbol: "▶" },
  { value: "dissolve",  label: "Dissolve",  symbol: "◈" },
  { value: "fade",      label: "Fade",      symbol: "◐" },
  { value: "wipe",      label: "Wipe",      symbol: "▷" },
  { value: "smash-cut", label: "Smash",     symbol: "▶▶" },
  { value: "match-cut", label: "Match",     symbol: "⊙" },
];

const DEFAULT_DURATION = 3; // seconds

// Mood colour bars along the bottom of each shot block
const MOOD_BAR: Record<string, string> = {
  Tense:       "bg-red-500",
  Dramatic:    "bg-purple-500",
  Romantic:    "bg-pink-500",
  Action:      "bg-orange-500",
  Mysterious:  "bg-indigo-500",
  Melancholic: "bg-blue-500",
  Triumphant:  "bg-yellow-400",
  Horror:      "bg-zinc-500",
  Comedic:     "bg-green-500",
  Serene:      "bg-cyan-500",
};

function shotAbbr(shotType: string): string {
  const m: Record<string, string> = {
    "Extreme Wide Shot": "EWS", "Wide Shot": "WS", "Medium Shot": "MS",
    "Close-Up": "CU", "Extreme Close-Up": "ECU", "Over-the-Shoulder": "OTS",
    "POV Shot": "POV", "Dutch Angle": "DUTCH", "Aerial Shot": "AERIAL",
  };
  return m[shotType] ?? shotType.slice(0, 3).toUpperCase();
}

export default function CinematicTimeline({
  scenes, selectedId, onSelect, onReorder, onUpdateScene,
}: Props) {
  const [dragIdx,    setDragIdx]    = useState<number | null>(null);
  const [dragOver,   setDragOver]   = useState<number | null>(null);
  const [editingDur, setEditingDur] = useState<string | null>(null); // scene.id being edited
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((idx: number) => setDragIdx(idx), []);
  const handleDragEnter = useCallback((idx: number) => setDragOver(idx), []);

  const handleDrop = useCallback((dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOver(null); return; }
    const next = [...scenes];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    // Renumber
    const renumbered = next.map((s, i) => ({ ...s, order: i + 1 }));
    onReorder(renumbered);
    setDragIdx(null);
    setDragOver(null);
  }, [dragIdx, scenes, onReorder]);

  const handleDragEnd = useCallback(() => { setDragIdx(null); setDragOver(null); }, []);

  // ── Duration inline edit ──────────────────────────────────────────────────
  function commitDuration(scene: Scene, val: string) {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      onUpdateScene({
        ...scene,
        timelineMeta: { ...scene.timelineMeta, durationSeconds: Math.round(n * 10) / 10 },
      });
    }
    setEditingDur(null);
  }

  // ── Cycle transition ──────────────────────────────────────────────────────
  function cycleTransition(scene: Scene) {
    const current = scene.timelineMeta?.transitionType ?? "cut";
    const idx     = TRANSITIONS.findIndex(t => t.value === current);
    const next    = TRANSITIONS[(idx + 1) % TRANSITIONS.length].value;
    onUpdateScene({ ...scene, timelineMeta: { ...scene.timelineMeta, transitionType: next } });
  }

  // Total duration
  const totalSec = scenes.reduce((acc, s) =>
    acc + (s.timelineMeta?.durationSeconds ?? DEFAULT_DURATION), 0);

  return (
    <div className="flex flex-col border-t border-white/5 bg-[#0a0a0e] shrink-0">

      {/* ── Ruler header ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/5">
        <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Timeline</span>
        <span className="text-[9px] font-mono text-white/18">
          {scenes.length} shots · {totalSec.toFixed(1)}s total
        </span>
        <div className="ml-auto flex items-center gap-1 text-[8px] font-mono text-white/18">
          <span className="text-amber-400/40">drag to reorder</span>
          <span className="text-white/12">· click transition badge to cycle</span>
        </div>
      </div>

      {/* ── Shot track ── */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-0 overflow-x-auto py-3 px-4 timeline-scroll"
        style={{ minHeight: 88 }}
      >
        {scenes.map((scene, idx) => {
          const dur        = scene.timelineMeta?.durationSeconds ?? DEFAULT_DURATION;
          const transition = scene.timelineMeta?.transitionType  ?? "cut";
          const transObj   = TRANSITIONS.find(t => t.value === transition) ?? TRANSITIONS[0];
          const isSelected = scene.id === selectedId;
          const isDragging = dragIdx  === idx;
          const isTarget   = dragOver === idx;
          const moodBar    = MOOD_BAR[scene.mood] ?? "bg-zinc-600";

          return (
            <div key={scene.id} className="flex items-stretch shrink-0">

              {/* Shot block */}
              <div
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={(e) => { e.preventDefault(); handleDragEnter(idx); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelect(scene)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelect(scene)}
                aria-pressed={isSelected}
                className={[
                  "relative flex flex-col justify-between cursor-pointer select-none",
                  "rounded-sm border transition-all duration-150",
                  "w-28 shrink-0",
                  isDragging  ? "opacity-30 scale-95" : "",
                  isTarget    ? "border-amber-400/50 bg-amber-400/5" : "",
                  isSelected  ? "border-amber-400/70 bg-white/[0.06] shadow-[0_0_16px_rgba(251,191,36,0.2)]"
                              : "border-white/8 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {/* Thumbnail strip */}
                <div className="relative h-12 overflow-hidden rounded-t-sm bg-zinc-950">
                  {scene.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scene.imageUrl}
                      alt={scene.title}
                      className="w-full h-full object-cover opacity-70"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950" />
                  )}
                  {/* Letterbox bars */}
                  <div className="absolute inset-x-0 top-0 h-[12%] bg-black pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-[12%] bg-black pointer-events-none" />
                  {/* Shot number */}
                  <div className="absolute top-1 left-1 h-4 w-4 rounded-sm bg-amber-400 flex items-center justify-center">
                    <span className="text-[8px] font-black text-black leading-none">{scene.order}</span>
                  </div>
                  {/* Shot type */}
                  <div className="absolute top-1 right-1">
                    <span className="text-[7px] font-mono text-white/50 bg-black/70 px-1 py-0.5 rounded-sm">
                      {shotAbbr(scene.shotType)}
                    </span>
                  </div>
                </div>

                {/* Label row */}
                <div className="px-1.5 py-1 flex-1 flex flex-col justify-between">
                  <p className="text-[9px] font-semibold text-white/75 truncate leading-tight">
                    {scene.title}
                  </p>
                  {/* Duration — click to edit inline */}
                  {editingDur === scene.id ? (
                    <input
                      autoFocus
                      defaultValue={String(dur)}
                      className="w-full text-[9px] font-mono bg-white/10 text-amber-400 rounded px-1 outline-none border border-amber-400/40"
                      onBlur={(e) => commitDuration(scene, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")  commitDuration(scene, (e.target as HTMLInputElement).value);
                        if (e.key === "Escape") setEditingDur(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDur(scene.id); }}
                      className="text-left text-[9px] font-mono text-white/25 hover:text-amber-400/70 transition-colors"
                      title="Click to edit duration"
                    >
                      {dur}s
                    </button>
                  )}
                </div>

                {/* Mood bar */}
                <div className={`h-0.5 w-full rounded-b-sm ${moodBar} opacity-60`} />
              </div>

              {/* Transition badge — between shots, not after last */}
              {idx < scenes.length - 1 && (
                <div className="flex items-center px-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); cycleTransition(scene); }}
                    title={`Transition: ${transObj.label} (click to change)`}
                    className="flex flex-col items-center gap-0.5 group"
                  >
                    <span className="text-[10px] text-white/20 group-hover:text-amber-400/60 transition-colors leading-none font-mono">
                      {transObj.symbol}
                    </span>
                    <span className="text-[6px] font-mono text-white/12 group-hover:text-white/30 uppercase tracking-wide">
                      {transObj.label}
                    </span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* End cap */}
        <div className="flex items-center pl-3 shrink-0">
          <div className="h-8 w-px bg-white/5" />
          <span className="ml-2 text-[8px] font-mono text-white/12 uppercase tracking-widest">END</span>
        </div>
      </div>
    </div>
  );
}
