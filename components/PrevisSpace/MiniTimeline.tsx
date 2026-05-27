"use client";

/**
 * SequenceTimeline — professional shot sequencer rail.
 *
 * Production workflow features:
 *   - Drag-to-reorder shots (HTML5 DnD, no extra deps)
 *   - Duration-proportional card widths (26px per second)
 *   - Total sequence duration in header
 *   - Mood-coded thumbnails, active highlight, shot type badge
 *   - Ruler tick marks
 */

import { useState } from "react";
import type { Scene } from "@/types";

interface Props {
  scenes:     Scene[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
  onReorder:  (fromIdx: number, toIdx: number) => void;
}

const MOOD_GLOW: Record<string, string> = {
  Tense:       "rgba(220,40,30,0.55)",   Dramatic:    "rgba(140,40,220,0.55)",
  Romantic:    "rgba(220,60,110,0.55)",  Action:      "rgba(220,110,20,0.55)",
  Mysterious:  "rgba(40,80,220,0.55)",   Melancholic: "rgba(40,110,200,0.55)",
  Triumphant:  "rgba(220,180,20,0.55)",  Horror:      "rgba(0,180,60,0.45)",
  Comedic:     "rgba(40,200,100,0.55)",  Serene:      "rgba(20,180,190,0.55)",
};

const MOOD_COLOR: Record<string, string> = {
  Tense:"#cc3320",Dramatic:"#8822cc",Romantic:"#cc3066",Action:"#cc6610",
  Mysterious:"#2244cc",Melancholic:"#2266bb",Triumphant:"#ccaa10",
  Horror:"#00cc44",Comedic:"#22cc66",Serene:"#11aaaa",
};

const MOOD_BG: Record<string, string> = {
  Tense:"#1a0604",Dramatic:"#120418",Romantic:"#1a0510",Action:"#1a0c04",
  Mysterious:"#040418",Melancholic:"#040c18",Triumphant:"#140e04",
  Horror:"#040604",Comedic:"#040e06",Serene:"#040e12",
};

const SHOT_ABBR: Record<string, string> = {
  "Extreme Wide Shot":"EWS","Wide Shot":"WS","Medium Shot":"MS","Close-Up":"CU",
  "Extreme Close-Up":"ECU","Over-the-Shoulder":"OTS","POV Shot":"POV",
  "Dutch Angle":"DUTCH","Aerial Shot":"AERIAL",
};

function ThumbnailPlaceholder({ mood }: { mood: string }) {
  return (
    <div className="w-full h-full" style={{
      background: `radial-gradient(ellipse at 40% 35%, ${MOOD_COLOR[mood] ?? "#555577"}55 0%, ${MOOD_BG[mood] ?? "#08080f"} 70%)`,
    }} />
  );
}

export default function MiniTimeline({ scenes, selectedId, onSelect, onReorder }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (scenes.length === 0) return null;

  const totalSecs = scenes.reduce((s, sc) => s + (sc.timelineMeta?.durationSeconds ?? 3), 0);
  const totalStr  = totalSecs >= 60
    ? `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`
    : `${totalSecs}s`;

  return (
    <div
      className="absolute bottom-0 inset-x-0 z-20 flex flex-col select-none"
      style={{ background: "rgba(22,22,28,0.97)", borderTop: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{ height: 22, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
      >
        <span className="text-[6px] font-mono text-amber-400/50 uppercase tracking-[0.3em]">Sequence</span>
        <span className="text-[5px] font-mono text-white/20 pl-2 border-l border-white/8">{scenes.length} shots</span>
        <span className="text-[5px] font-mono text-white/15">{totalStr} total</span>

        {/* Ruler ticks */}
        <div className="flex-1 flex items-center overflow-hidden">
          {scenes.map((_, i) => (
            <div key={i} className="flex-1 flex items-center">
              <div className="w-px shrink-0" style={{
                height:     i % 5 === 0 ? 10 : 5,
                background: i % 5 === 0 ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
              }} />
            </div>
          ))}
        </div>

        <span className="text-[6px] font-mono text-white/10 uppercase tracking-widest">Drag to reorder</span>
      </div>

      {/* ── Shot filmstrip ── */}
      <div
        className="flex gap-1 overflow-x-auto px-2 py-1.5"
        style={{ height: 74 }}
        onDragOver={(e) => e.preventDefault()}
      >
        {scenes.map((scene, idx) => {
          const isActive      = scene.id === selectedId;
          const isDragSource  = dragFrom === idx;
          const isDragTarget  = dragOver === idx && dragFrom !== idx;
          const accent        = MOOD_COLOR[scene.mood]  ?? "#5555aa";
          const glow          = MOOD_GLOW[scene.mood]   ?? "rgba(80,80,150,0.4)";
          const shotAbbr      = SHOT_ABBR[scene.shotType] ?? scene.shotType.slice(0, 4).toUpperCase();
          const dur           = scene.timelineMeta?.durationSeconds ?? 3;
          // Duration-proportional width: 26px per second, clamped 72–150px
          const cardWidth     = Math.max(72, Math.min(150, Math.round(dur * 26)));

          return (
            <button
              key={scene.id}
              draggable
              onClick={() => onSelect(scene.id)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                // Ghost image is the button itself
                setDragFrom(idx);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== idx) setDragOver(idx);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== idx) onReorder(dragFrom, idx);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              style={{
                width:        cardWidth,
                flexShrink:   0,
                borderRadius: 3,
                border:       isDragTarget
                  ? "2px solid rgba(99,102,241,0.85)"
                  : isActive
                  ? `1px solid ${accent}`
                  : "1px solid rgba(255,255,255,0.07)",
                background:   isDragSource ? "rgba(8,8,18,0.35)" : "rgba(8,8,18,0.90)",
                opacity:      isDragSource ? 0.38 : 1,
                transform:    isActive ? "scale(1.06) translateY(-1px)" : "scale(1)",
                boxShadow:    isActive
                  ? `0 0 16px ${glow}, 0 0 4px ${accent}66 inset`
                  : "0 1px 4px rgba(0,0,0,0.6)",
                cursor:       "grab",
                display:      "flex",
                flexDirection:"column",
                overflow:     "hidden",
                outline:      "none",
                transition:   "opacity 0.1s, border-color 0.1s, transform 0.1s",
              }}
            >
              {/* Thumbnail */}
              <div className="relative overflow-hidden" style={{ height: 44, flexShrink: 0 }}>
                {scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <ThumbnailPlaceholder mood={scene.mood} />
                )}

                <div className="absolute inset-x-0 top-0 h-[5px] bg-black pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-[5px] bg-black pointer-events-none" />

                {/* Scene number */}
                <div className="absolute top-[6px] left-1 flex items-center justify-center"
                  style={{ width: 16, height: 12, background: isActive ? accent : "rgba(251,191,36,0.85)", borderRadius: 1.5 }}>
                  <span className="text-[6px] font-black text-black leading-none">{scene.order}</span>
                </div>

                {/* Shot type */}
                <div className="absolute top-[6px] right-1">
                  <span className="text-[5px] font-mono" style={{
                    background: "rgba(0,0,0,0.72)", color: "rgba(255,255,255,0.45)",
                    padding: "1px 2px", borderRadius: 1,
                  }}>
                    {shotAbbr}
                  </span>
                </div>

                {isActive && (
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ border: `1px solid ${accent}`, borderRadius: 2, boxShadow: `inset 0 0 8px ${accent}44` }} />
                )}

                {/* Drop target indicator — left edge stripe */}
                {isDragTarget && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 pointer-events-none"
                    style={{ background: "rgba(99,102,241,0.9)" }} />
                )}
              </div>

              {/* Label row */}
              <div className="flex items-center justify-between px-1.5" style={{ height: 18, flexShrink: 0 }}>
                <span className="text-[6px] font-semibold truncate flex-1 leading-none"
                  style={{ color: isActive ? "#e8e8f0" : "rgba(255,255,255,0.45)" }}>
                  {scene.title}
                </span>
                <span className="text-[5px] font-mono ml-1 shrink-0 leading-none"
                  style={{ color: "rgba(255,255,255,0.18)" }}>
                  {dur}s
                </span>
              </div>

              {/* Mood bar */}
              <div className="w-full shrink-0" style={{
                height:     2,
                background: isActive
                  ? `linear-gradient(90deg, transparent, ${accent}, transparent)`
                  : `${accent}55`,
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
