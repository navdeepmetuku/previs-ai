"use client";

import { useState, useEffect, useRef } from "react";
import type { Scene, ShotVersion } from "@/types";
import { buildCinematicPrompt } from "@/lib/image-prompts";
import { getCachedImageUrl, cacheImageUrl } from "@/lib/image-cache";

interface Props {
  scene: Scene;
  onUpdate: (scene: Scene) => void;
  onClose:  () => void;
}

type Stage = "loading" | "loaded" | "failed";
const TIMEOUT_MS = 90_000;

// Transition options
const TRANSITIONS = ["cut","dissolve","fade","wipe","smash-cut","match-cut"] as const;
// Focal lengths
const FOCAL_LENGTHS = [14, 24, 35, 50, 85, 100, 135];
// Camera movements
const CAM_MOVEMENTS: NonNullable<NonNullable<Scene["cinematicMeta"]>["cameraMovement"]>[] =
  ["static","dolly","handheld","crane","drone"];
// Beat markers
const BEATS: NonNullable<NonNullable<Scene["timelineMeta"]>["beatMarker"]>[] =
  ["setup","action","dialogue","climax","silence"];

export default function SceneDetail({ scene, onUpdate, onClose }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [displaySrc,   setDisplaySrc]   = useState<string | null>(null);
  const [isLoaded,     setIsLoaded]     = useState(false);
  const [stage,        setStage]        = useState<Stage>("loading");
  const [failReason,   setFailReason]   = useState<string>("Generation failed");
  const [fadeKey,      setFadeKey]      = useState(0);

  // Accordion open state
  const [openNotes,    setOpenNotes]    = useState(false);
  const [openCamera,   setOpenCamera]   = useState(false);
  const [openTimeline, setOpenTimeline] = useState(false);
  const [openVersions, setOpenVersions] = useState(false);

  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (timeoutTimer.current) { clearTimeout(timeoutTimer.current); timeoutTimer.current = null; }
    if (retryTimer.current)   { clearTimeout(retryTimer.current);   retryTimer.current   = null; }
  }

  function startTimeout(s: Stage) {
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
    timeoutTimer.current = setTimeout(() => {
      console.warn(`[SceneDetail] scene ${scene.order} ⏱ timeout after 90s (${s})`);
      setStage("failed");
      setIsLoaded(false);
      setDisplaySrc(null);
      setFailReason("Load timeout");
    }, TIMEOUT_MS);
  }

  function advanceStage(failed: Stage) {
    clearTimers();
    // Both attempts exhausted — show explicit failed state, no SVG
    setStage("failed");
    setIsLoaded(false);
    setDisplaySrc(null);
    setFailReason(failed === "loading" ? "Image load failed" : "Failed");
  }

  useEffect(() => {
    clearTimers();
    setIsLoaded(false);
    setFadeKey(k => k + 1);

    const url = scene.imageUrl;
    if (!url) { setStage("failed"); setFailReason("No image URL"); setDisplaySrc(null); return; }

    const cached = getCachedImageUrl(scene.id);
    if (cached) { setStage("loading"); setDisplaySrc(cached); return; }

    setStage("loading"); setDisplaySrc(url); startTimeout("loading");
    return clearTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.imageUrl, scene.id, scene.mood]);

  function handleLoad() {
    clearTimers();
    if ((stage === "loading") && displaySrc) cacheImageUrl(scene.id, displaySrc);
    setIsLoaded(true);
    setStage("loaded");
  }
  function handleError() {
    clearTimers();
    if (stage === "failed") return;
    advanceStage(stage);
  }

  function handleRegenerate() {
    clearTimers();
    setRegenerating(true);
    setIsLoaded(false);
    setDisplaySrc(null);
    setStage("loading");
    const prompt = scene.imagePrompt ?? buildCinematicPrompt(scene);
    fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, seed: Math.floor(Math.random() * 98000) + 1000, sceneId: scene.id }),
    })
      .then(r => r.json())
      .then((data: { ok: boolean; dataUrl?: string; error?: string }) => {
        if (data.ok && data.dataUrl) {
          onUpdate({ ...scene, imageUrl: data.dataUrl });
        } else {
          setStage("failed");
          setFailReason(data.error ?? "Regeneration failed");
          console.error("[SceneDetail] regen failed:", data.error);
        }
      })
      .catch(e => {
        setStage("failed");
        setFailReason("Network error");
        console.error("[SceneDetail] regen error:", e);
      })
      .finally(() => setRegenerating(false));
  }

  // Helpers for updating nested metadata without clobbering other fields
  function updateCinematicMeta(patch: Partial<Scene["cinematicMeta"]>) {
    onUpdate({ ...scene, cinematicMeta: { ...scene.cinematicMeta, ...patch } });
  }
  function updateTimelineMeta(patch: Partial<Scene["timelineMeta"]>) {
    onUpdate({ ...scene, timelineMeta: { ...scene.timelineMeta, ...patch } });
  }

  const showSkeleton = !isLoaded && stage === "loading";
  const isReal       = stage === "loading" || stage === "loaded";

  return (
    <div className="flex flex-col h-full overflow-y-auto text-white">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-0.5">
            Shot {String(scene.order).padStart(2, "0")}
          </p>
          <h3 className="text-sm font-bold text-white/90 leading-tight">{scene.title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Favorite toggle */}
          <button
            onClick={() => onUpdate({
              ...scene,
              reviewMeta: { ...scene.reviewMeta, isFavorite: !scene.reviewMeta?.isFavorite }
            })}
            className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
              scene.reviewMeta?.isFavorite
                ? "text-amber-400 bg-amber-400/10"
                : "text-white/20 hover:text-white/50 hover:bg-white/8"
            }`}
            aria-label={scene.reviewMeta?.isFavorite ? "Remove from favorites" : "Mark as favorite"}
            title={scene.reviewMeta?.isFavorite ? "Favorited" : "Mark as favorite"}
          >
            ★
          </button>
          <button onClick={onClose} aria-label="Close"
            className="h-7 w-7 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/8 transition-all">
            ✕
          </button>
        </div>
      </div>

      {/* ── Cinematic viewer ── */}
      <div className="relative mx-4 rounded-lg overflow-hidden bg-zinc-950 shrink-0"
        style={{ aspectRatio: "16/9" }}>

        {/* Skeleton while loading */}
        {showSkeleton && stage === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col gap-3 items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-amber-400/30 animate-pulse" />
            </div>
            <div className="w-2/3 h-1 rounded-full bg-white/8 shimmer" />
            <div className="w-1/2 h-1 rounded-full bg-white/5 shimmer" style={{ animationDelay: "0.2s" }} />
            <span className="text-[8px] font-mono text-amber-400/40 animate-pulse tracking-widest uppercase">
              generating
            </span>
          </div>
        )}

        {/* Explicit failed state — no silent SVG fallback */}
        {stage === "failed" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950 gap-2">
            <p className="text-[9px] font-mono text-white/20">{failReason}</p>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="text-[8px] font-mono text-amber-400/50 hover:text-amber-400 border border-amber-400/15 hover:border-amber-400/40 rounded-sm px-2 py-0.5 transition-all disabled:opacity-30"
            >
              {regenerating ? "…" : "↺ Retry"}
            </button>
          </div>
        )}

        {displaySrc && stage !== "failed" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${displaySrc}-${fadeKey}`}
            src={displaySrc}
            alt={scene.title}
            className={["absolute inset-0 w-full h-full object-cover transition-opacity duration-700",
              isLoaded ? "opacity-100" : "opacity-0"].join(" ")}
            onLoad={handleLoad}
            onError={handleError}
          />
        )}

        {/* Overlays */}
        <div className="absolute inset-x-0 top-0    h-[7%] bg-black pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black pointer-events-none z-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none z-20" />

        {/* Corner markers */}
        {(["top-[8%] left-3 border-t border-l","top-[8%] right-3 border-t border-r",
           "bottom-[8%] left-3 border-b border-l","bottom-[8%] right-3 border-b border-r"] as const)
          .map((cls, i) => (
            <div key={i} className={`absolute w-4 h-4 z-30 pointer-events-none border-white/20 ${cls}`} />
          ))}

        {/* Badges */}
        {isLoaded && (
          <div className="absolute top-[9%] right-3 z-30">
            <span className={`text-[7px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${
              isReal ? "bg-green-900/70 text-green-400" : "bg-yellow-900/70 text-yellow-400"}`}>
              {isReal ? "AI" : "FB"}
            </span>
          </div>
        )}

        <button onClick={handleRegenerate} disabled={regenerating}
          className="absolute bottom-[9%] right-3 z-30 rounded-md bg-black/75 border border-white/10 px-2 py-1 text-[9px] font-mono text-white/50 hover:text-white hover:bg-black/90 transition-all disabled:opacity-30">
          {regenerating ? "…" : "↺ Regen"}
        </button>
      </div>

      {/* ── Static metadata grid ── */}
      <div className="px-4 pt-4 space-y-2 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <MetaBox label="Shot"     value={scene.shotType} />
          <MetaBox label="Mood"     value={scene.mood} accent={moodAccent(scene.mood)} />
          <MetaBox label="Lighting" value={scene.lighting} />
          <MetaBox label="Location" value={scene.location} truncate />
        </div>
        {scene.characters && (
          <MetaBox label="Characters" value={scene.characters} />
        )}

        {/* Description */}
        <div className="rounded-md bg-white/[0.02] border border-white/5 px-2.5 py-2">
          <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1">Description</p>
          <p className="text-[10px] text-white/55 leading-relaxed">{scene.description}</p>
        </div>
      </div>

      {/* ── Accordion: Director Notes ── */}
      <Accordion
        title="Director Notes"
        open={openNotes}
        onToggle={() => setOpenNotes(o => !o)}
      >
        <textarea
          key={`notes-${scene.id}`}
          rows={3}
          placeholder="Shot intentions, performance notes, mise-en-scène…"
          defaultValue={scene.timelineMeta?.directorNotes ?? ""}
          onBlur={(e) => updateTimelineMeta({ directorNotes: e.target.value || null })}
          className="w-full bg-white/[0.03] border border-white/8 rounded-md px-2.5 py-2 text-[10px] text-white/65 placeholder-white/15 outline-none focus:border-amber-400/30 resize-none leading-relaxed font-mono"
        />
      </Accordion>

      {/* ── Accordion: Camera & Lens ── */}
      <Accordion
        title="Camera & Lens"
        open={openCamera}
        onToggle={() => setOpenCamera(o => !o)}
      >
        <div className="space-y-3">
          {/* Focal length */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Focal Length</p>
            <div className="flex flex-wrap gap-1">
              {FOCAL_LENGTHS.map(mm => {
                const active = scene.cinematicMeta?.focalLengthMm === mm;
                return (
                  <button key={mm}
                    onClick={() => updateCinematicMeta({ focalLengthMm: active ? null : mm })}
                    className={["rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all",
                      active ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                             : "border-white/8 text-white/35 hover:border-white/20"].join(" ")}>
                    {mm}mm
                  </button>
                );
              })}
            </div>
          </div>

          {/* Camera movement */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Movement</p>
            <div className="flex flex-wrap gap-1">
              {CAM_MOVEMENTS.map(m => {
                const active = scene.cinematicMeta?.cameraMovement === m;
                return (
                  <button key={m}
                    onClick={() => updateCinematicMeta({ cameraMovement: active ? null : m })}
                    className={["rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all capitalize",
                      active ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                             : "border-white/8 text-white/35 hover:border-white/20"].join(" ")}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lens type */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Lens Type</p>
            <div className="flex gap-1">
              {(["spherical","anamorphic","macro"] as const).map(lt => {
                const active = scene.cinematicMeta?.lensType === lt;
                return (
                  <button key={lt}
                    onClick={() => updateCinematicMeta({ lensType: active ? null : lt })}
                    className={["rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all capitalize",
                      active ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                             : "border-white/8 text-white/35 hover:border-white/20"].join(" ")}>
                    {lt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3D previs prep */}
          <div className="rounded-md border border-dashed border-white/6 p-2">
            <p className="text-[8px] font-mono text-white/15 uppercase tracking-widest mb-0.5">3D Previs</p>
            <p className="text-[9px] text-white/20">
              Depth: {scene.cinematicMeta?.depthLayers?.join(" · ") || "—"}<br />
              Blocking: {scene.cinematicMeta?.characterBlocking || "—"}
            </p>
            <p className="text-[8px] text-white/10 mt-1">Blender integration coming soon</p>
          </div>
        </div>
      </Accordion>

      {/* ── Accordion: Timeline ── */}
      <Accordion
        title="Timeline"
        open={openTimeline}
        onToggle={() => setOpenTimeline(o => !o)}
      >
        <div className="space-y-3">
          {/* Duration */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Duration (seconds)</p>
            <input
              key={`dur-${scene.id}`}
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              defaultValue={scene.timelineMeta?.durationSeconds ?? 3}
              onBlur={(e) => updateTimelineMeta({ durationSeconds: parseFloat(e.target.value) || null })}
              className="w-24 bg-white/[0.03] border border-white/8 rounded-md px-2 py-1 text-[10px] text-white/65 outline-none focus:border-amber-400/30 font-mono"
            />
          </div>

          {/* Transition type */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Transition Out</p>
            <div className="flex flex-wrap gap-1">
              {TRANSITIONS.map(t => {
                const active = (scene.timelineMeta?.transitionType ?? "cut") === t;
                return (
                  <button key={t}
                    onClick={() => updateTimelineMeta({ transitionType: t })}
                    className={["rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all",
                      active ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                             : "border-white/8 text-white/35 hover:border-white/20"].join(" ")}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Beat marker */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Beat</p>
            <div className="flex flex-wrap gap-1">
              {BEATS.map(b => {
                const active = scene.timelineMeta?.beatMarker === b;
                return (
                  <button key={b}
                    onClick={() => updateTimelineMeta({ beatMarker: active ? null : b })}
                    className={["rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all capitalize",
                      active ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                             : "border-white/8 text-white/35 hover:border-white/20"].join(" ")}>
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Production tag */}
          <div>
            <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Production Tag</p>
            <div className="flex flex-wrap gap-1">
              {(["approved","revision","hold","ready"] as const).map(t => {
                const active = scene.reviewMeta?.productionTag === t;
                const cls = {
                  approved: active ? "border-green-500/50 bg-green-500/10 text-green-400"  : "border-white/8 text-white/35",
                  revision: active ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400" : "border-white/8 text-white/35",
                  hold:     active ? "border-red-500/50 bg-red-500/10 text-red-400"        : "border-white/8 text-white/35",
                  ready:    active ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"     : "border-white/8 text-white/35",
                }[t];
                return (
                  <button key={t}
                    onClick={() => onUpdate({ ...scene, reviewMeta: {
                      ...scene.reviewMeta, productionTag: active ? null : t
                    }})}
                    className={`rounded-sm px-2 py-0.5 text-[9px] font-mono border transition-all capitalize ${cls} hover:border-white/20`}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Accordion>

      {/* ── Accordion: Versions ── */}
      <Accordion
        title={`Versions${scene.versions?.length ? ` (${scene.versions.length})` : ""}`}
        open={openVersions}
        onToggle={() => setOpenVersions(o => !o)}
      >
        <VersionsPanel scene={scene} onUpdate={onUpdate} />
      </Accordion>

      <div className="h-6 shrink-0" /> {/* bottom padding */}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function Accordion({
  title, open, onToggle, children,
}: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/5 shrink-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[9px] font-mono text-white/35 uppercase tracking-widest">{title}</span>
        <span className={`text-[9px] text-white/25 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

function MetaBox({ label, value, accent, truncate }: {
  label: string; value: string; accent?: string; truncate?: boolean;
}) {
  return (
    <div className="rounded-md bg-white/[0.03] border border-white/5 px-2.5 py-2">
      <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-[11px] font-medium leading-tight ${accent ?? "text-white/70"} ${truncate ? "truncate" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function moodAccent(mood: string): string {
  const m: Record<string, string> = {
    Tense: "text-red-400",        Dramatic: "text-purple-400",   Romantic: "text-pink-400",
    Action: "text-orange-400",    Mysterious: "text-indigo-400", Melancholic: "text-blue-400",
    Triumphant: "text-yellow-400",Horror: "text-zinc-400",       Comedic: "text-green-400",
    Serene: "text-cyan-400",
  };
  return m[mood] ?? "text-white/70";
}

// ── Versions panel ─────────────────────────────────────────────────────────────

function VersionsPanel({ scene, onUpdate }: { scene: Scene; onUpdate: (s: Scene) => void }) {
  const versions = scene.versions ?? [];

  function saveCurrentVersion() {
    if (!scene.imageUrl || !scene.imagePrompt) return;
    const v: ShotVersion = {
      id:          `v-${Date.now()}`,
      imageUrl:    scene.imageUrl,
      imagePrompt: scene.imagePrompt,
      createdAt:   Date.now(),
      label:       `Version ${versions.length + 1}`,
    };
    onUpdate({ ...scene, versions: [...versions, v] });
  }

  function restoreVersion(v: ShotVersion) {
    onUpdate({ ...scene, imageUrl: v.imageUrl, imagePrompt: v.imagePrompt });
  }

  function deleteVersion(id: string) {
    onUpdate({ ...scene, versions: versions.filter(x => x.id !== id) });
  }

  return (
    <div className="space-y-3">
      <button onClick={saveCurrentVersion} disabled={!scene.imageUrl}
        className="w-full rounded-md border border-white/8 py-2 text-[9px] font-mono text-white/35 hover:border-amber-400/25 hover:text-amber-400/60 transition-all disabled:opacity-25">
        + Save current image as a version
      </button>

      {versions.length === 0 && (
        <p className="text-[9px] text-white/15 leading-snug">
          No saved versions. Save versions to compare iterations.
        </p>
      )}

      <div className="space-y-2">
        {versions.map((v) => {
          const isActive = scene.imageUrl === v.imageUrl;
          const date = new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={v.id}
              className={[
                "rounded-md border p-2 flex gap-2 items-start",
                isActive ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-white/6 bg-white/[0.015]",
              ].join(" ")}>
              <div className="shrink-0 w-16 rounded-sm overflow-hidden bg-zinc-950" style={{ aspectRatio: "16/9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.imageUrl} alt={v.label} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-semibold text-white/65 truncate">{v.label}</p>
                <p className="text-[7px] font-mono text-white/20 mt-0.5">{date}</p>
                <div className="flex gap-2 mt-1.5">
                  {isActive
                    ? <span className="text-[7px] font-mono text-amber-400/40">active</span>
                    : <button onClick={() => restoreVersion(v)} className="text-[8px] font-mono text-amber-400/50 hover:text-amber-400/80 transition-colors">↺ Restore</button>
                  }
                  <button onClick={() => deleteVersion(v.id)}
                    className="text-[7px] font-mono text-white/15 hover:text-red-400/50 transition-colors ml-auto">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {versions.length > 0 && (
        <p className="text-[7px] font-mono text-white/12">
          {versions.length} version{versions.length !== 1 ? "s" : ""} · persisted in project save
        </p>
      )}
    </div>
  );
}
