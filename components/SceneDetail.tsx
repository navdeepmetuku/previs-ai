"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Scene, ShotVersion, Project } from "@/types";
import { buildFullPrompt, sceneToSeed } from "@/lib/image-prompts";
import { getCachedImageUrl, cacheImageUrl } from "@/lib/image-cache";

interface Props {
  scene:    Scene;
  project?: Pick<Project, "genre" | "storyMemory" | "visualContext">;
  onUpdate: (scene: Scene) => void;
  onClose:  () => void;
}

type Stage = "loading" | "loaded" | "failed";

// ── Option sets ───────────────────────────────────────────────────────────────

const SHOT_TYPES = [
  "Extreme Wide Shot","Wide Shot","Medium Shot","Close-Up",
  "Extreme Close-Up","Over-the-Shoulder","POV Shot","Dutch Angle","Aerial Shot",
];
const MOODS = [
  "Tense","Dramatic","Romantic","Action","Mysterious",
  "Melancholic","Triumphant","Horror","Comedic","Serene",
];
const LIGHTINGS = [
  "Natural daylight","Golden hour","Blue hour","Night/low-key",
  "High-key","Neon","Candlelight","Overcast","Harsh sunlight",
];
const FOCAL_LENGTHS = [14, 24, 35, 50, 85, 100, 135];
const CAM_MOVEMENTS: NonNullable<NonNullable<Scene["cinematicMeta"]>["cameraMovement"]>[] =
  ["static","dolly","handheld","crane","drone"];
const CAM_HEIGHTS: NonNullable<NonNullable<Scene["cinematicMeta"]>["cameraHeight"]>[] =
  ["eye-level","low","high","overhead"];
const LENS_TYPES: NonNullable<NonNullable<Scene["cinematicMeta"]>["lensType"]>[] =
  ["spherical","anamorphic","macro"];
const TRANSITIONS = ["cut","dissolve","fade","wipe","smash-cut","match-cut"] as const;
const BEATS: NonNullable<NonNullable<Scene["timelineMeta"]>["beatMarker"]>[] =
  ["setup","action","dialogue","climax","silence"];

// ── Mood accent colours ───────────────────────────────────────────────────────

const MOOD_ACCENT: Record<string, string> = {
  Tense:"#ff3311",Dramatic:"#aa44ff",Romantic:"#ff5588",Action:"#ff8800",
  Mysterious:"#3366ff",Melancholic:"#4488cc",Triumphant:"#ffcc00",
  Horror:"#00cc44",Comedic:"#44ee88",Serene:"#00cccc",
};

function moodTextClass(mood: string): string {
  const m: Record<string,string> = {
    Tense:"text-red-400",Dramatic:"text-purple-400",Romantic:"text-pink-400",
    Action:"text-orange-400",Mysterious:"text-indigo-400",Melancholic:"text-blue-400",
    Triumphant:"text-yellow-400",Horror:"text-zinc-400",Comedic:"text-green-400",Serene:"text-cyan-400",
  };
  return m[mood] ?? "text-white/70";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SceneDetail({ scene, project, onUpdate, onClose }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [displaySrc,   setDisplaySrc]   = useState<string | null>(null);
  const [isLoaded,     setIsLoaded]     = useState(false);
  const [stage,        setStage]        = useState<Stage>("loading");
  const [failReason,   setFailReason]   = useState("No image");
  const [fadeKey,      setFadeKey]      = useState(0);
  const [vishLoading,  setVishLoading]  = useState(false);
  const [vishTip,      setVishTip]      = useState<string | null>(null);

  // Accordion state
  const [openShot,     setOpenShot]     = useState(true);
  const [openCamera,   setOpenCamera]   = useState(false);
  const [openTimeline, setOpenTimeline] = useState(false);
  const [openNotes,    setOpenNotes]    = useState(false);
  const [openVersions, setOpenVersions] = useState(false);
  const [compareMode,  setCompareMode]  = useState(false);
  const [compareIdx,   setCompareIdx]   = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Image loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsLoaded(false); setFadeKey(k => k + 1);
    const url = scene.imageUrl;
    if (!url) { setStage("failed"); setFailReason("No image yet"); setDisplaySrc(null); return; }
    const cached = getCachedImageUrl(scene.id);
    if (cached) { setStage("loading"); setDisplaySrc(cached); return; }
    setStage("loading"); setDisplaySrc(url);
    timeoutRef.current = setTimeout(() => {
      setStage("failed"); setFailReason("Load timeout"); setDisplaySrc(null);
    }, 90_000);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.imageUrl, scene.id]);

  function handleLoad() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (displaySrc) cacheImageUrl(scene.id, displaySrc);
    setIsLoaded(true); setStage("loaded");
  }
  function handleError() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStage("failed"); setFailReason("Image load failed"); setDisplaySrc(null);
  }

  // ── Regeneration ──────────────────────────────────────────────────────────

  const regenerate = useCallback(async (sceneOverride?: Partial<Scene>) => {
    const target = sceneOverride ? { ...scene, ...sceneOverride } : scene;
    setRegenerating(true); setIsLoaded(false); setDisplaySrc(null); setStage("loading");
    try {
      const prompt = project
        ? buildFullPrompt(target as Scene, project)
        : target.imagePrompt ?? target.description;
      const seed = sceneToSeed(target.id + Date.now());
      const res  = await fetch("/api/generate-image", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ prompt, seed, sceneId: target.id }),
      });
      const data = await res.json() as { ok:boolean; dataUrl?:string; error?:string };
      if (data.ok && data.dataUrl) {
        // Save current as version before replacing
        const versions = scene.versions ?? [];
        const newVersions = scene.imageUrl ? [
          ...versions,
          { id:`v-${Date.now()}`, imageUrl:scene.imageUrl,
            imagePrompt:scene.imagePrompt ?? "", createdAt:Date.now(),
            label:`Version ${versions.length + 1}` } as ShotVersion,
        ] : versions;
        onUpdate({ ...target as Scene, imageUrl:data.dataUrl, imagePrompt:prompt, versions:newVersions });
      } else {
        setStage("failed"); setFailReason(data.error ?? "Generation failed");
      }
    } catch { setStage("failed"); setFailReason("Network error"); }
    finally  { setRegenerating(false); }
  }, [scene, project, onUpdate]);

  // ── Metadata helpers ──────────────────────────────────────────────────────

  function updateCinematicMeta(patch: Partial<Scene["cinematicMeta"]>) {
    onUpdate({ ...scene, cinematicMeta: { ...scene.cinematicMeta, ...patch } });
  }
  function updateTimelineMeta(patch: Partial<Scene["timelineMeta"]>) {
    onUpdate({ ...scene, timelineMeta: { ...scene.timelineMeta, ...patch } });
  }

  // ── VISH cinematography suggestion ───────────────────────────────────────

  async function getVishSuggestion() {
    setVishLoading(true); setVishTip(null);
    try {
      const res = await fetch("/api/ai-director", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"analyze-scene", scene }),
      });
      const data = await res.json() as { insight?:{ cameraAdvice:string; lensRecommendation:string; improvementTip:string } };
      if (data.insight) {
        setVishTip(`${data.insight.cameraAdvice} ${data.insight.lensRecommendation} — ${data.insight.improvementTip}`);
      }
    } catch { setVishTip("VISH offline."); }
    finally  { setVishLoading(false); }
  }

  const versions   = scene.versions ?? [];
  const compareVer = versions[compareIdx] ?? null;
  const accent     = MOOD_ACCENT[scene.mood] ?? "#fbbf24";

  return (
    <div className="flex flex-col h-full overflow-y-auto text-white" style={{ scrollbarWidth:"thin" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-0.5">
            Shot {String(scene.order).padStart(2,"0")}
          </p>
          <h3 className="text-sm font-bold text-white/90 leading-tight">{scene.title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onUpdate({ ...scene, reviewMeta:{ ...scene.reviewMeta, isFavorite:!scene.reviewMeta?.isFavorite } })}
            className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${scene.reviewMeta?.isFavorite ? "text-amber-400 bg-amber-400/10" : "text-white/20 hover:text-white/50 hover:bg-white/8"}`}
            title="Favorite"
          >★</button>
          <button onClick={onClose} className="h-7 w-7 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/8 transition-all">✕</button>
        </div>
      </div>

      {/* ── Cinematic viewer ── */}
      <div className="mx-4 shrink-0">
        <div className="relative rounded-lg overflow-hidden bg-zinc-950" style={{ aspectRatio:"16/9" }}>
          {stage === "loading" && !isLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col gap-2 items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950">
              <div className="w-3 h-3 rounded-full bg-amber-400/30 animate-pulse" />
              <span className="text-[8px] font-mono text-amber-400/40 animate-pulse tracking-widest uppercase">
                {regenerating ? "generating" : "loading"}
              </span>
            </div>
          )}
          {stage === "failed" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950 gap-2">
              <p className="text-[9px] font-mono text-white/20">{failReason}</p>
              <button onClick={() => regenerate()} disabled={regenerating}
                className="text-[8px] font-mono text-amber-400/50 hover:text-amber-400 border border-amber-400/15 hover:border-amber-400/40 rounded-sm px-2 py-0.5 transition-all disabled:opacity-30">
                {regenerating ? "…" : "↺ Generate"}
              </button>
            </div>
          )}
          {displaySrc && stage !== "failed" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${displaySrc}-${fadeKey}`} src={displaySrc} alt={scene.title}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={handleLoad} onError={handleError} />
          )}
          {/* Letterbox */}
          <div className="absolute inset-x-0 top-0 h-[7%] bg-black pointer-events-none z-20" />
          <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black pointer-events-none z-20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-20" />
          {/* Mood accent line */}
          <div className="absolute bottom-[7%] inset-x-0 h-px z-25 pointer-events-none" style={{ background:accent, opacity:0.5 }} />
          {/* Regen button */}
          <button onClick={() => regenerate()} disabled={regenerating}
            className="absolute bottom-[9%] right-3 z-30 rounded-md bg-black/75 border border-white/10 px-2 py-1 text-[9px] font-mono text-white/50 hover:text-white hover:bg-black/90 transition-all disabled:opacity-30">
            {regenerating ? "…" : "↺ Regen"}
          </button>
          {/* Compare toggle */}
          {versions.length > 0 && (
            <button onClick={() => setCompareMode(c => !c)}
              className={`absolute bottom-[9%] left-3 z-30 rounded-md border px-2 py-1 text-[9px] font-mono transition-all ${compareMode ? "border-amber-400/40 bg-amber-400/10 text-amber-400" : "bg-black/75 border-white/10 text-white/40 hover:text-white"}`}>
              ⊞ Compare
            </button>
          )}
        </div>

        {/* ── Compare strip ── */}
        {compareMode && versions.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {versions.map((v, i) => (
              <button key={v.id} onClick={() => setCompareIdx(i)}
                className={`shrink-0 rounded overflow-hidden border transition-all ${compareIdx === i ? "border-amber-400/60 scale-105" : "border-white/10 opacity-60 hover:opacity-90"}`}
                style={{ width:72, aspectRatio:"16/9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.imageUrl} alt={v.label} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {compareMode && compareVer && (
          <div className="mt-1.5 relative rounded-lg overflow-hidden bg-zinc-950" style={{ aspectRatio:"16/9" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={compareVer.imageUrl} alt={compareVer.label} className="w-full h-full object-cover" />
            <div className="absolute top-2 left-2 bg-black/70 rounded px-1.5 py-0.5">
              <span className="text-[7px] font-mono text-white/60">{compareVer.label}</span>
            </div>
            <button onClick={() => onUpdate({ ...scene, imageUrl:compareVer.imageUrl, imagePrompt:compareVer.imagePrompt })}
              className="absolute bottom-2 right-2 bg-amber-400/90 text-black text-[8px] font-bold px-2 py-0.5 rounded transition-all hover:bg-amber-300">
              Use this
            </button>
          </div>
        )}
      </div>

      {/* ── VISH Suggestion ── */}
      <div className="mx-4 mt-2 shrink-0">
        <button onClick={getVishSuggestion} disabled={vishLoading}
          className="w-full flex items-center gap-2 rounded-md border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2 text-left hover:border-amber-400/30 transition-all disabled:opacity-40">
          <span className="text-amber-400/60 text-[10px]">⬡</span>
          <span className="text-[9px] font-mono text-amber-400/55 flex-1 truncate">
            {vishLoading ? "VISH thinking…" : vishTip ? vishTip.slice(0,80)+"…" : "Ask VISH for cinematography advice"}
          </span>
        </button>
        {vishTip && (
          <div className="mt-1 rounded-md border border-amber-400/10 bg-amber-400/[0.03] px-3 py-2">
            <p className="text-[9px] text-amber-400/60 leading-relaxed">{vishTip}</p>
            <button onClick={() => regenerate()} disabled={regenerating}
              className="mt-1.5 text-[8px] font-mono text-amber-400/50 hover:text-amber-400 border border-amber-400/15 rounded-sm px-2 py-0.5 transition-all disabled:opacity-30">
              {regenerating ? "…" : "↺ Regen with this advice"}
            </button>
          </div>
        )}
      </div>

      {/* ── Accordion: Shot Controls ── */}
      <Accordion title="Shot Controls" open={openShot} onToggle={() => setOpenShot(o => !o)} accent={accent}>
        <div className="space-y-3">
          {/* Shot type */}
          <ControlGroup label="Shot Type">
            <div className="flex flex-wrap gap-1">
              {SHOT_TYPES.map(s => {
                const ab = { "Extreme Wide Shot":"EWS","Wide Shot":"WS","Medium Shot":"MS","Close-Up":"CU",
                  "Extreme Close-Up":"ECU","Over-the-Shoulder":"OTS","POV Shot":"POV","Dutch Angle":"DUTCH","Aerial Shot":"AERIAL" }[s] ?? s.slice(0,4);
                return (
                  <Chip key={s} label={ab} title={s} active={scene.shotType === s}
                    onClick={() => { onUpdate({ ...scene, shotType:s }); }} />
                );
              })}
            </div>
          </ControlGroup>

          {/* Mood */}
          <ControlGroup label="Mood">
            <div className="flex flex-wrap gap-1">
              {MOODS.map(m => (
                <Chip key={m} label={m} active={scene.mood === m}
                  activeColor={MOOD_ACCENT[m]}
                  onClick={() => onUpdate({ ...scene, mood:m })} />
              ))}
            </div>
          </ControlGroup>

          {/* Lighting */}
          <ControlGroup label="Lighting">
            <div className="flex flex-wrap gap-1">
              {LIGHTINGS.map(l => {
                const ab = l.replace("Natural daylight","Day").replace("Golden hour","Gold").replace("Blue hour","Blue")
                  .replace("Night/low-key","Night").replace("High-key","Hi-Key").replace("Harsh sunlight","Harsh");
                return <Chip key={l} label={ab} title={l} active={scene.lighting === l} onClick={() => onUpdate({ ...scene, lighting:l })} />;
              })}
            </div>
          </ControlGroup>

          {/* Regen with new shot params */}
          <button onClick={() => regenerate()} disabled={regenerating}
            className="w-full rounded-md border border-white/10 py-2 text-[9px] font-mono text-white/40 hover:border-amber-400/30 hover:text-amber-400/70 transition-all disabled:opacity-30">
            {regenerating ? "Generating…" : "↺ Regenerate with these settings"}
          </button>
        </div>
      </Accordion>

      {/* ── Accordion: Camera & Lens ── */}
      <Accordion title="Camera & Lens" open={openCamera} onToggle={() => setOpenCamera(o => !o)}>
        <div className="space-y-3">
          <ControlGroup label="Focal Length">
            <div className="flex flex-wrap gap-1">
              {FOCAL_LENGTHS.map(mm => (
                <Chip key={mm} label={`${mm}mm`} active={scene.cinematicMeta?.focalLengthMm === mm}
                  onClick={() => updateCinematicMeta({ focalLengthMm: scene.cinematicMeta?.focalLengthMm === mm ? null : mm })} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Movement">
            <div className="flex flex-wrap gap-1">
              {CAM_MOVEMENTS.map(m => (
                <Chip key={m} label={m} active={scene.cinematicMeta?.cameraMovement === m}
                  onClick={() => updateCinematicMeta({ cameraMovement: scene.cinematicMeta?.cameraMovement === m ? null : m })} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Camera Height">
            <div className="flex flex-wrap gap-1">
              {CAM_HEIGHTS.map(h => (
                <Chip key={h} label={h} active={scene.cinematicMeta?.cameraHeight === h}
                  onClick={() => updateCinematicMeta({ cameraHeight: scene.cinematicMeta?.cameraHeight === h ? null : h })} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Lens Type">
            <div className="flex flex-wrap gap-1">
              {LENS_TYPES.map(lt => (
                <Chip key={lt} label={lt} active={scene.cinematicMeta?.lensType === lt}
                  onClick={() => updateCinematicMeta({ lensType: scene.cinematicMeta?.lensType === lt ? null : lt })} />
              ))}
            </div>
          </ControlGroup>
          <button onClick={() => regenerate()} disabled={regenerating}
            className="w-full rounded-md border border-white/10 py-2 text-[9px] font-mono text-white/40 hover:border-amber-400/30 hover:text-amber-400/70 transition-all disabled:opacity-30">
            {regenerating ? "Generating…" : "↺ Regenerate with camera settings"}
          </button>
        </div>
      </Accordion>

      {/* ── Accordion: Timeline ── */}
      <Accordion title="Timeline" open={openTimeline} onToggle={() => setOpenTimeline(o => !o)}>
        <div className="space-y-3">
          <ControlGroup label="Duration (seconds)">
            <input type="number" min={0.5} max={60} step={0.5}
              defaultValue={scene.timelineMeta?.durationSeconds ?? 3}
              onBlur={e => updateTimelineMeta({ durationSeconds: parseFloat(e.target.value) || null })}
              className="w-20 bg-white/[0.03] border border-white/8 rounded-md px-2 py-1 text-[10px] text-white/65 outline-none focus:border-amber-400/30 font-mono" />
          </ControlGroup>
          <ControlGroup label="Transition Out">
            <div className="flex flex-wrap gap-1">
              {TRANSITIONS.map(t => (
                <Chip key={t} label={t} active={(scene.timelineMeta?.transitionType ?? "cut") === t}
                  onClick={() => updateTimelineMeta({ transitionType: t })} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Beat Marker">
            <div className="flex flex-wrap gap-1">
              {BEATS.map(b => (
                <Chip key={b} label={b} active={scene.timelineMeta?.beatMarker === b}
                  onClick={() => updateTimelineMeta({ beatMarker: scene.timelineMeta?.beatMarker === b ? null : b })} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Production Tag">
            <div className="flex flex-wrap gap-1">
              {(["approved","revision","hold","ready"] as const).map(t => {
                const colors: Record<string,string> = { approved:"#22c55e", revision:"#eab308", hold:"#ef4444", ready:"#06b6d4" };
                return (
                  <Chip key={t} label={t} active={scene.reviewMeta?.productionTag === t}
                    activeColor={colors[t]}
                    onClick={() => onUpdate({ ...scene, reviewMeta:{ ...scene.reviewMeta, productionTag: scene.reviewMeta?.productionTag === t ? null : t } })} />
                );
              })}
            </div>
          </ControlGroup>
        </div>
      </Accordion>

      {/* ── Accordion: Director Notes ── */}
      <Accordion title="Director Notes" open={openNotes} onToggle={() => setOpenNotes(o => !o)}>
        <textarea rows={3} placeholder="Shot intentions, performance notes, mise-en-scène…"
          defaultValue={scene.timelineMeta?.directorNotes ?? ""}
          onBlur={e => updateTimelineMeta({ directorNotes: e.target.value || null })}
          className="w-full bg-white/[0.03] border border-white/8 rounded-md px-2.5 py-2 text-[10px] text-white/65 placeholder-white/15 outline-none focus:border-amber-400/30 resize-none leading-relaxed font-mono" />
      </Accordion>

      {/* ── Accordion: Versions ── */}
      <Accordion title={`Versions${versions.length ? ` (${versions.length})` : ""}`} open={openVersions} onToggle={() => setOpenVersions(o => !o)}>
        <VersionsPanel scene={scene} onUpdate={onUpdate} />
      </Accordion>

      {/* ── Static metadata ── */}
      <div className="px-4 pt-2 pb-6 space-y-2 shrink-0">
        <div className="rounded-md bg-white/[0.02] border border-white/5 px-2.5 py-2">
          <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1">Description</p>
          <p className="text-[10px] text-white/50 leading-relaxed">{scene.description}</p>
        </div>
        {scene.characters && (
          <div className="rounded-md bg-white/[0.02] border border-white/5 px-2.5 py-2">
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-0.5">Characters</p>
            <p className="text-[10px] text-white/55">{scene.characters}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Accordion({ title, open, onToggle, children, accent }: {
  title: string; open: boolean; onToggle: () => void;
  children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="border-t border-white/5 shrink-0">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
        <span className="text-[9px] font-mono uppercase tracking-widest"
          style={{ color: accent ? `${accent}88` : "rgba(255,255,255,0.30)" }}>
          {title}
        </span>
        <span className={`text-[9px] text-white/20 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Chip({ label, title, active, activeColor, onClick }: {
  label: string; title?: string; active: boolean;
  activeColor?: string; onClick: () => void;
}) {
  const activeBorder = activeColor ? `${activeColor}88` : "rgba(251,191,36,0.5)";
  const activeBg     = activeColor ? `${activeColor}18` : "rgba(251,191,36,0.10)";
  const activeText   = activeColor ?? "#fbbf24";
  return (
    <button onClick={onClick} title={title}
      className="rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all capitalize"
      style={active
        ? { borderColor:activeBorder, background:activeBg, color:activeText }
        : { borderColor:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.35)" }
      }>
      {label}
    </button>
  );
}

// ── Versions panel ────────────────────────────────────────────────────────────

function VersionsPanel({ scene, onUpdate }: { scene: Scene; onUpdate: (s: Scene) => void }) {
  const versions = scene.versions ?? [];

  function saveCurrentVersion() {
    if (!scene.imageUrl) return;
    const v: ShotVersion = {
      id:`v-${Date.now()}`, imageUrl:scene.imageUrl,
      imagePrompt:scene.imagePrompt ?? "", createdAt:Date.now(),
      label:`Version ${versions.length + 1}`,
    };
    onUpdate({ ...scene, versions:[...versions, v] });
  }

  function restoreVersion(v: ShotVersion) {
    onUpdate({ ...scene, imageUrl:v.imageUrl, imagePrompt:v.imagePrompt });
  }

  function deleteVersion(id: string) {
    onUpdate({ ...scene, versions:versions.filter(x => x.id !== id) });
  }

  return (
    <div className="space-y-3">
      <button onClick={saveCurrentVersion} disabled={!scene.imageUrl}
        className="w-full rounded-md border border-white/8 py-2 text-[9px] font-mono text-white/35 hover:border-amber-400/25 hover:text-amber-400/60 transition-all disabled:opacity-25">
        + Save current as version
      </button>
      {versions.length === 0 && (
        <p className="text-[9px] text-white/15">No saved versions yet.</p>
      )}
      <div className="space-y-2">
        {versions.map(v => {
          const isActive = scene.imageUrl === v.imageUrl;
          return (
            <div key={v.id}
              className={`rounded-md border p-2 flex gap-2 items-start ${isActive ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-white/6 bg-white/[0.015]"}`}>
              <div className="shrink-0 w-16 rounded-sm overflow-hidden bg-zinc-950" style={{ aspectRatio:"16/9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.imageUrl} alt={v.label} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-semibold text-white/65 truncate">{v.label}</p>
                <p className="text-[7px] font-mono text-white/20 mt-0.5">
                  {new Date(v.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                </p>
                <div className="flex gap-2 mt-1.5">
                  {isActive
                    ? <span className="text-[7px] font-mono text-amber-400/40">active</span>
                    : <button onClick={() => restoreVersion(v)} className="text-[8px] font-mono text-amber-400/50 hover:text-amber-400/80 transition-colors">↺ Restore</button>
                  }
                  <button onClick={() => deleteVersion(v.id)}
                    className="text-[7px] font-mono text-white/15 hover:text-red-400/50 transition-colors ml-auto">✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
