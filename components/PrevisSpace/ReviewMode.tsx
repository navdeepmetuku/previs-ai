"use client";

/**
 * ReviewMode — fullscreen cinematic storyboard presentation.
 *
 * Features:
 *   - Fullscreen immersive overlay, all editor UI hidden
 *   - Shot-by-shot navigation: arrow keys, on-screen buttons, spacebar auto-play
 *   - Timed auto-playback respecting scene.timelineMeta.durationSeconds
 *   - CSS cross-fade transitions between shots (cinematic dissolve)
 *   - Minimal cinematic HUD: sequence progress, shot info, duration
 *   - Shot comparison mode: side-by-side A/B of any two shots
 *   - Playback scrubber bar
 *   - ESC or close button to exit
 *   - Export prep: "Export PDF" placeholder button (structure ready)
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Scene } from "@/types";

// ── Mood palette (mirrors SceneCard3D) ───────────────────────────────────────

const MOOD_BG: Record<string, [string, string]> = {
  Tense:       ["#3d0a06", "#0a0000"], Dramatic:    ["#200535", "#06010e"],
  Romantic:    ["#2e0618", "#0a0208"], Action:      ["#2a1400", "#0a0400"],
  Mysterious:  ["#060422", "#010108"], Melancholic: ["#061528", "#010408"],
  Triumphant:  ["#1c1400", "#060400"], Horror:      ["#050505", "#000000"],
  Comedic:     ["#061c0a", "#010602"], Serene:      ["#041620", "#01080a"],
};

const MOOD_ACCENT: Record<string, string> = {
  Tense:"#ff3311",Dramatic:"#aa44ff",Romantic:"#ff5588",Action:"#ff8800",
  Mysterious:"#3366ff",Melancholic:"#4488cc",Triumphant:"#ffcc00",
  Horror:"#00cc44",Comedic:"#44ee88",Serene:"#00cccc",
};

// ── Transition states ─────────────────────────────────────────────────────────

type TransitionState = "visible" | "fading-out" | "fading-in";

interface Props {
  scenes:  Scene[];
  initial: number;  // starting index
  onClose: () => void;
}

// ── Shot frame — image or mood-gradient placeholder ──────────────────────────

function ShotFrame({
  scene,
  opacity = 1,
  small   = false,
}: {
  scene:   Scene;
  opacity?: number;
  small?:  boolean;
}) {
  const [bg0, bg1] = MOOD_BG[scene.mood] ?? ["#0a0a1a", "#020208"];
  const accent     = MOOD_ACCENT[scene.mood] ?? "#fbbf24";

  return (
    <div
      style={{
        position:      "relative",
        width:         "100%",
        height:        "100%",
        opacity,
        transition:    "opacity 0.55s ease",
        overflow:      "hidden",
        background:    scene.imageUrl
          ? "#000"
          : `radial-gradient(ellipse at 40% 38%, ${bg0} 0%, ${bg1} 100%)`,
      }}
    >
      {/* Real image */}
      {scene.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.imageUrl}
          alt={scene.title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {/* Placeholder overlay when no image */}
      {!scene.imageUrl && (
        <>
          {/* Vignette */}
          <div style={{
            position:   "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.72) 100%)",
          }} />
          {/* Framing guides */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.06,
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.5) 0.5px, transparent 0.5px),
              linear-gradient(to bottom, rgba(255,255,255,0.5) 0.5px, transparent 0.5px)
            `,
            backgroundSize: "33.33% 33.33%",
          }} />
          {/* Accent glow */}
          <div style={{
            position:   "absolute", inset: 0,
            background: `radial-gradient(ellipse at 35% 30%, ${accent}28 0%, transparent 60%)`,
          }} />
          {/* Scene title centre */}
          {!small && (
            <div style={{
              position:  "absolute", inset: 0,
              display:   "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10,
            }}>
              <div style={{
                fontFamily:    "monospace", fontSize: 11,
                color:         `${accent}88`, letterSpacing: "0.3em",
                textTransform: "uppercase",
              }}>
                {scene.shotType}
              </div>
              <div style={{
                fontFamily: "sans-serif", fontWeight: 600, fontSize: 22,
                color:       "rgba(255,255,255,0.82)", textAlign: "center",
                padding:     "0 40px", lineHeight: 1.3,
              }}>
                {scene.title}
              </div>
            </div>
          )}
        </>
      )}

      {/* Letterbox bars */}
      <div style={{ position:"absolute", inset:"0 0 auto 0", height:"8%", background:"#000" }} />
      <div style={{ position:"absolute", inset:"auto 0 0 0", height:"8%", background:"#000" }} />

      {/* Accent bottom line */}
      <div style={{
        position:   "absolute", bottom: "8%", left: 0, right: 0,
        height:     1, background: accent, opacity: 0.35,
      }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReviewMode({ scenes, initial, onClose }: Props) {
  const [idx,         setIdx]         = useState(Math.max(0, Math.min(initial, scenes.length - 1)));
  const [transition,  setTransition]  = useState<TransitionState>("visible");
  const [autoPlay,    setAutoPlay]    = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIdx,  setCompareIdx]  = useState<number>(() => Math.min(initial + 1, scenes.length - 1));
  const autoRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdx = useRef<number | null>(null);

  const scene   = scenes[idx];
  const dur     = scene?.timelineMeta?.durationSeconds ?? 4;
  const accent  = MOOD_ACCENT[scene?.mood ?? ""] ?? "#fbbf24";

  // ── Navigation with cross-fade ────────────────────────────────────────────

  const goTo = useCallback((newIdx: number) => {
    if (transition !== "visible" || newIdx === idx) return;
    const clamped = Math.max(0, Math.min(newIdx, scenes.length - 1));
    pendingIdx.current = clamped;
    setTransition("fading-out");
  }, [idx, transition, scenes.length]);

  // After fade-out: swap shot and fade in
  useEffect(() => {
    if (transition !== "fading-out") return;
    const t = setTimeout(() => {
      if (pendingIdx.current !== null) {
        setIdx(pendingIdx.current);
        pendingIdx.current = null;
      }
      setTransition("fading-in");
      const t2 = setTimeout(() => setTransition("visible"), 80);
      return () => clearTimeout(t2);
    }, 420);
    return () => clearTimeout(t);
  }, [transition]);

  // ── Auto-play ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!autoPlay) { if (autoRef.current) clearTimeout(autoRef.current); return; }
    autoRef.current = setTimeout(() => {
      if (idx < scenes.length - 1) goTo(idx + 1);
      else setAutoPlay(false);
    }, dur * 1000);
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, [autoPlay, idx, dur, goTo, scenes.length]);

  // ── Keyboard controls ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape")       { e.preventDefault(); onClose(); }
      if (e.key === "ArrowRight")   { e.preventDefault(); goTo(idx + 1); }
      if (e.key === "ArrowLeft")    { e.preventDefault(); goTo(idx - 1); }
      if (e.key === " ")            { e.preventDefault(); setAutoPlay(p => !p); }
      if (e.key === "c")            { setCompareMode(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, goTo, onClose]);

  // ── Progress percentage ───────────────────────────────────────────────────

  const progress = useMemo(() => ((idx) / Math.max(scenes.length - 1, 1)) * 100, [idx, scenes.length]);

  if (!scene) return null;

  const frameOpacity = transition === "fading-out" ? 0 : 1;
  const compareScene = scenes[compareIdx] ?? null;

  return (
    <div style={{
      position:   "fixed", inset: 0, zIndex: 1000,
      background: "#000",
      display:    "flex", flexDirection: "column",
      fontFamily: "monospace",
    }}>

      {/* ── Top HUD ── */}
      <div style={{
        flexShrink:    0,
        display:       "flex",
        alignItems:    "center",
        justifyContent: "space-between",
        padding:       "10px 18px 8px",
        background:    "rgba(0,0,0,0.85)",
        borderBottom:  `1px solid ${accent}22`,
        backdropFilter: "blur(10px)",
      }}>
        {/* Left: identity */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:9, height:9, borderRadius:"50%", background:accent,
            boxShadow:`0 0 8px ${accent}`,
          }} />
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.45)", letterSpacing:"0.25em", textTransform:"uppercase" }}>
            Review Mode
          </span>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.15)", marginLeft:4 }}>·</span>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.30)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {scene.title}
          </span>
        </div>

        {/* Centre: shot counter */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.70)" }}>
            {String(idx + 1).padStart(2,"0")}
          </span>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.20)" }}>/ {scenes.length}</span>
        </div>

        {/* Right: controls */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {/* Compare toggle */}
          <button
            onClick={() => setCompareMode(p => !p)}
            title="Compare shots (C)"
            style={btnStyle(compareMode, accent)}
          >
            ⊞ Compare
          </button>

          {/* Export placeholder */}
          <button
            onClick={() => window.alert("Export coming soon — PDF storyboard export.")}
            style={btnStyle(false, accent)}
          >
            ↗ Export
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Exit (ESC)"
            style={{
              ...btnStyle(false, "#888"),
              fontSize:8,
            }}
          >
            ✕ Exit
          </button>
        </div>
      </div>

      {/* ── Main frame area ── */}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
        {!compareMode ? (
          /* ── Single shot view ── */
          <div style={{ width:"100%", height:"100%" }}>
            <ShotFrame scene={scene} opacity={frameOpacity} />
          </div>
        ) : (
          /* ── Comparison split view ── */
          <div style={{ display:"flex", height:"100%", gap:2, padding:2 }}>
            {/* Shot A */}
            <div style={{ flex:1, position:"relative" }}>
              <ShotFrame scene={scene} opacity={frameOpacity} />
              <div style={{
                position:"absolute", top:10, left:12, padding:"3px 8px",
                background:"rgba(0,0,0,0.72)", borderRadius:3,
                fontSize:8, color:accent, letterSpacing:"0.15em",
              }}>
                A — Shot {idx + 1}
              </div>
            </div>

            {/* Shot B picker */}
            <div style={{ flex:1, position:"relative" }}>
              {compareScene && <ShotFrame scene={compareScene} opacity={1} />}
              <div style={{ position:"absolute", top:10, left:12 }}>
                <select
                  value={compareIdx}
                  onChange={e => setCompareIdx(Number(e.target.value))}
                  style={{
                    background:"rgba(0,0,0,0.72)", border:`1px solid ${accent}44`,
                    borderRadius:3, color:"rgba(255,255,255,0.65)",
                    fontSize:8, padding:"2px 6px", cursor:"pointer",
                    fontFamily:"monospace",
                  }}
                >
                  {scenes.map((s, i) => (
                    <option key={s.id} value={i}>B — Shot {i+1}: {s.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Prev / Next arrow overlays */}
        {idx > 0 && (
          <button
            onClick={() => goTo(idx - 1)}
            style={{
              position:"absolute", left:16, top:"50%", transform:"translateY(-50%)",
              background:"rgba(0,0,0,0.55)", border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:"50%", width:40, height:40, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"rgba(255,255,255,0.65)", fontSize:16, backdropFilter:"blur(6px)",
              transition:"all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.85)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.55)")}
          >
            ‹
          </button>
        )}
        {idx < scenes.length - 1 && (
          <button
            onClick={() => goTo(idx + 1)}
            style={{
              position:"absolute", right:16, top:"50%", transform:"translateY(-50%)",
              background:"rgba(0,0,0,0.55)", border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:"50%", width:40, height:40, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"rgba(255,255,255,0.65)", fontSize:16, backdropFilter:"blur(6px)",
              transition:"all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.85)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.55)")}
          >
            ›
          </button>
        )}
      </div>

      {/* ── Bottom HUD ── */}
      <div style={{
        flexShrink:0,
        background:    "rgba(0,0,0,0.90)",
        borderTop:     `1px solid ${accent}20`,
        backdropFilter:"blur(10px)",
      }}>
        {/* Progress bar */}
        <div style={{ height:2, background:"rgba(255,255,255,0.06)" }}>
          <div style={{
            height:"100%", background:accent,
            width:`${progress}%`,
            transition:"width 0.45s ease",
            boxShadow:`0 0 8px ${accent}`,
          }} />
        </div>

        {/* Controls row */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"8px 18px 10px",
        }}>
          {/* Left: shot metadata */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              <span style={{ fontSize:8, color:accent, letterSpacing:"0.2em", textTransform:"uppercase" }}>
                {scene.shotType}
              </span>
              <span style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.80)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {scene.title}
              </span>
            </div>
            <div style={{ width:1, height:28, background:"rgba(255,255,255,0.08)" }} />
            <MetaItem label="Mood"     value={scene.mood} />
            <MetaItem label="Location" value={scene.location} />
            <MetaItem label="Duration" value={`${dur}s`} />
            {scene.cinematicMeta?.lensType && (
              <MetaItem label="Lens" value={scene.cinematicMeta.lensType} />
            )}
          </div>

          {/* Centre: playback controls */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => goTo(0)} title="First shot"
              style={navBtnStyle}>
              ⏮
            </button>
            <button onClick={() => goTo(idx - 1)} title="Previous (←)"
              style={navBtnStyle}>
              ⏪
            </button>
            <button
              onClick={() => setAutoPlay(p => !p)}
              title="Play/Pause (Space)"
              style={{
                ...navBtnStyle,
                background: autoPlay ? `${accent}22` : "rgba(255,255,255,0.05)",
                border:     `1px solid ${autoPlay ? accent + "66" : "rgba(255,255,255,0.10)"}`,
                color:      autoPlay ? accent : "rgba(255,255,255,0.65)",
                width:36, height:36,
              }}
            >
              {autoPlay ? "⏸" : "▶"}
            </button>
            <button onClick={() => goTo(idx + 1)} title="Next (→)"
              style={navBtnStyle}>
              ⏩
            </button>
            <button onClick={() => goTo(scenes.length - 1)} title="Last shot"
              style={navBtnStyle}>
              ⏭
            </button>
          </div>

          {/* Right: sequence scrubber */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:8, color:"rgba(255,255,255,0.20)" }}>
              {String(idx+1).padStart(2,"0")} / {scenes.length}
            </span>
            <input
              type="range"
              min={0}
              max={scenes.length - 1}
              value={idx}
              onChange={e => goTo(Number(e.target.value))}
              style={{
                width:140, accentColor:accent, cursor:"pointer",
                height:3,
              }}
            />
          </div>
        </div>

        {/* Keyboard hint */}
        <div style={{
          paddingBottom:6, textAlign:"center",
          fontSize:7, color:"rgba(255,255,255,0.10)", letterSpacing:"0.15em",
        }}>
          ← → navigate &nbsp;·&nbsp; Space play/pause &nbsp;·&nbsp; C compare &nbsp;·&nbsp; ESC exit
        </div>
      </div>
    </div>
  );
}

// ── Shared small components ───────────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <span style={{ fontSize:6, color:"rgba(255,255,255,0.22)", letterSpacing:"0.18em", textTransform:"uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize:8, color:"rgba(255,255,255,0.55)", maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {value}
      </span>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function btnStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    fontSize:      8,
    fontFamily:    "monospace",
    padding:       "4px 10px",
    borderRadius:  3,
    border:        `1px solid ${active ? accent + "66" : "rgba(255,255,255,0.10)"}`,
    background:    active ? `${accent}18` : "rgba(255,255,255,0.04)",
    color:         active ? accent : "rgba(255,255,255,0.45)",
    cursor:        "pointer",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    transition:    "all 0.15s",
  };
}

const navBtnStyle: React.CSSProperties = {
  width:        30,
  height:       30,
  borderRadius: "50%",
  background:   "rgba(255,255,255,0.05)",
  border:       "1px solid rgba(255,255,255,0.10)",
  color:        "rgba(255,255,255,0.55)",
  cursor:       "pointer",
  display:      "flex",
  alignItems:   "center",
  justifyContent: "center",
  fontSize:     12,
  transition:   "all 0.15s",
};
