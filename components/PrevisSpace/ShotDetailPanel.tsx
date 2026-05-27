"use client";

/**
 * ShotDetailPanel — production metadata sidebar for selected shot.
 *
 * Displays full shot information + inline director notes editing.
 * Positioned bottom-left, collapsible.
 */

import { useState, useCallback } from "react";
import type { Scene } from "@/types";

interface Props {
  scene:    Scene;
  onClose?: () => void;
}

const MOOD_ACCENT: Record<string, string> = {
  Tense:"#ff3311",Dramatic:"#aa44ff",Romantic:"#ff5588",Action:"#ff8800",
  Mysterious:"#3366ff",Melancholic:"#4488cc",Triumphant:"#ffcc00",
  Horror:"#00cc44",Comedic:"#44ee88",Serene:"#00cccc",
};

interface NoteCategory {
  key:   string;
  label: string;
  icon:  string;
}

const NOTE_CATEGORIES: NoteCategory[] = [
  { key: "director",  label: "Director",  icon: "🎬" },
  { key: "camera",    label: "Camera",    icon: "📷" },
  { key: "lens",      label: "Lens",      icon: "🔭" },
  { key: "acting",    label: "Acting",    icon: "🎭" },
  { key: "lighting",  label: "Lighting",  icon: "💡" },
  { key: "vfx",       label: "VFX",       icon: "✨" },
];

export default function ShotDetailPanel({ scene, onClose }: Props) {
  const [collapsed,    setCollapsed]    = useState(false);
  const [activeNote,   setActiveNote]   = useState("director");
  const [notes,        setNotes]        = useState<Record<string, string>>({});
  const accent = MOOD_ACCENT[scene.mood] ?? "#fbbf24";

  const handleNoteChange = useCallback((cat: string, val: string) => {
    setNotes(prev => ({ ...prev, [cat]: val }));
  }, []);

  const dur = scene.timelineMeta?.durationSeconds ?? 3;
  const lens = scene.cinematicMeta?.lensType ?? "—";
  const move = scene.cinematicMeta?.cameraMovement ?? "—";
  const fov  = scene.cinematicMeta?.focalLengthMm
    ? `${scene.cinematicMeta.focalLengthMm}mm`
    : "—";

  return (
    <div
      style={{
        position:       "absolute",
        top:            10,
        left:           12,
        zIndex:         30,
        width:          240,
        background:     "rgba(14,14,22,0.97)",
        border:         "1px solid rgba(255,255,255,0.10)",
        borderRadius:   6,
        backdropFilter: "blur(14px)",
        boxShadow:      "0 4px 24px rgba(0,0,0,0.45)",
        overflow:       "hidden",
        transition:     "height 0.2s ease",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ borderBottom: `1px solid ${accent}33`, background: `${accent}08` }}
        onClick={() => setCollapsed(p => !p)}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
          <span className="text-[10px] font-semibold" style={{ color: "rgba(240,240,255,0.90)" }}>
            Shot {scene.order} · {scene.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-[9px] text-white/25 hover:text-white/60 transition-colors"
              style={{ lineHeight: 1, padding: "2px 3px" }}
            >✕</button>
          )}
          <span className="text-[8px] text-white/25">{collapsed ? "▲" : "▼"}</span>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ── Metadata grid ── */}
          <div className="grid grid-cols-2 gap-px px-3 py-2.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {[
              ["SHOT",     scene.shotType],
              ["MOOD",     scene.mood],
              ["DURATION", `${dur}s`],
              ["LOCATION", scene.location],
              ["LENS",     lens],
              ["MOVEMENT", move],
              ["F-LENGTH", fov],
              ["LIGHTING", scene.lighting || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[5.5px] font-mono uppercase tracking-[0.2em]"
                  style={{ color: accent, opacity: 0.55 }}>{label}</span>
                <span className="text-[8px] font-medium truncate"
                  style={{ color: "rgba(220,220,240,0.75)" }}>{value}</span>
              </div>
            ))}
          </div>

          {/* ── Characters ── */}
          {scene.characters && (
            <div className="px-3 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="text-[5.5px] font-mono uppercase tracking-[0.2em] block mb-1"
                style={{ color: accent, opacity: 0.55 }}>Characters</span>
              <span className="text-[8px]" style={{ color: "rgba(220,220,240,0.65)" }}>
                {scene.characters}
              </span>
            </div>
          )}

          {/* ── Director Notes ── */}
          <div className="px-3 pt-2.5 pb-2">
            {/* Note category tabs */}
            <div className="flex gap-1 mb-2 flex-wrap">
              {NOTE_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setActiveNote(cat.key)}
                  style={{
                    fontSize:     6,
                    fontFamily:   "monospace",
                    padding:      "2px 5px",
                    borderRadius: 3,
                    border:       `1px solid ${activeNote === cat.key ? accent : "rgba(255,255,255,0.08)"}`,
                    background:   activeNote === cat.key ? `${accent}18` : "transparent",
                    color:        activeNote === cat.key ? accent : "rgba(255,255,255,0.30)",
                    cursor:       "pointer",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    transition:   "all 0.12s",
                  }}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Note textarea */}
            <textarea
              value={notes[activeNote] ?? ""}
              onChange={e => handleNoteChange(activeNote, e.target.value)}
              placeholder={`${NOTE_CATEGORIES.find(c => c.key === activeNote)?.label} notes…`}
              rows={3}
              style={{
                width:          "100%",
                background:     "rgba(255,255,255,0.03)",
                border:         "1px solid rgba(255,255,255,0.08)",
                borderRadius:   4,
                color:          "rgba(220,220,240,0.80)",
                fontSize:       9,
                fontFamily:     "monospace",
                lineHeight:     1.5,
                padding:        "5px 7px",
                resize:         "none",
                outline:        "none",
                boxSizing:      "border-box",
              }}
              onFocus={e => {
                (e.target as HTMLTextAreaElement).style.borderColor = `${accent}55`;
              }}
              onBlur={e => {
                (e.target as HTMLTextAreaElement).style.borderColor = "rgba(255,255,255,0.08)";
              }}
            />

            {notes[activeNote] && (
              <div className="flex justify-end mt-1">
                <span className="text-[6px] font-mono" style={{ color: `${accent}55` }}>
                  {notes[activeNote].length} chars
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
