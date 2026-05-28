"use client";

import { useState, useEffect, useRef, memo } from "react";
import type { Scene, ImageStatus } from "@/types";
import { getCachedImageUrl, cacheImageUrl } from "@/lib/image-cache";
import { useImageStore } from "@/lib/supabase/useImageStore";
import { put as putImage } from "@/lib/supabase/image-store";
import { getImageTier } from "@/lib/model-tiers";

interface Props {
  scene:      Scene;
  isSelected: boolean;
  onClick:    () => void;
  loadDelay?: number;
  projectId?: string;
}

/**
 * Image states:
 *   idle      — waiting for loadDelay
 *   loading   — <img> tag is in flight
 *   loaded    — image rendered successfully
 *   failed    — generation failed or <img> errored; shows reason + retry button
 *
 * Manual retry triggers /api/generate-image server-side for this scene.
 * No Pollinations. No SVG fallbacks. If it fails, the user sees exactly why.
 */
type ImgStage = "idle" | "loading" | "loaded" | "failed";

const SceneCard = memo(function SceneCard({ scene, isSelected, onClick, loadDelay = 0, projectId }: Props) {
  const [displaySrc,  setDisplaySrc]  = useState<string | null>(null);
  const [imgStage,    setImgStage]    = useState<ImgStage>("idle");
  const [status,      setStatus]      = useState<ImageStatus>("idle");
  const [failReason,  setFailReason]  = useState<string>("Generation failed");
  const [isRetrying,  setIsRetrying]  = useState(false);

  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef   = useRef(scene);
  sceneRef.current = scene;

  // Phase 13 — subscribe to Supabase image store. If the image store has a
  // newer URL than the scene prop, prefer that (e.g. PREVIS SPACE generated
  // an image while Studio was open).
  const { imageUrl: storeUrl } = useImageStore(scene.id, scene.imageUrl);
  const lastEffectiveUrlRef = useRef<string | null>(null);

  function clearDelay() {
    if (delayTimer.current) { clearTimeout(delayTimer.current); delayTimer.current = null; }
  }

  // ── Reset + schedule on scene URL change ──────────────────────────────────
  useEffect(() => {
    // Phase 13: prefer image-store URL over scene prop (cross-view sync)
    const url = storeUrl ?? scene.imageUrl;

    // Dedup — if URL hasn't changed, do nothing (prevents image flicker
    // when parent re-renders for unrelated reasons)
    if (url === lastEffectiveUrlRef.current) return;
    lastEffectiveUrlRef.current = url;

    clearDelay();
    setDisplaySrc(null);
    setImgStage("idle");
    setStatus("idle");

    if (!url) {
      console.warn(`[SceneCard] scene ${scene.order} no imageUrl — showing failed`);
      setImgStage("failed");
      setStatus("failed");
      setFailReason("Generation pending");
      return;
    }

    // data: URL (already base64) — load instantly, no network needed
    if (url.startsWith("data:")) {
      console.log(`[SceneCard] scene ${scene.order} ✅ data URL instant load`);
      setDisplaySrc(url);
      setImgStage("loading");
      setStatus("generating");
      cacheImageUrl(scene.id, url);
      return;
    }

    // fal.ai CDN URL (fal.media or similar) — load instantly, no delay
    if (url.includes("fal.media") || url.includes("fal.run") || url.includes("cdn.")) {
      console.log(`[SceneCard] scene ${scene.order} ✅ CDN URL instant load`);
      setDisplaySrc(url);
      setImgStage("loading");
      setStatus("generating");
      return;
    }

    // In-memory cache hit
    const cached = getCachedImageUrl(scene.id);
    if (cached) {
      console.log(`[SceneCard] scene ${scene.order} ✅ cache hit`);
      setDisplaySrc(cached);
      setImgStage("loading");
      setStatus("generating");
      return;
    }

    console.log(`[SceneCard] scene ${scene.order} → load in ${loadDelay}ms url=${url.slice(0, 60)}…`);
    setStatus("generating");
    delayTimer.current = setTimeout(() => {
      setImgStage("loading");
      setDisplaySrc(url);
    }, loadDelay);

    return clearDelay;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.imageUrl, scene.id, storeUrl]);

  // ── <img> events ─────────────────────────────────────────────────────────
  function handleLoad() {
    console.log(`[SceneCard] scene ${sceneRef.current.order} ✅ img loaded`);
    setImgStage("loaded");
    setStatus("loaded");
    if (displaySrc) cacheImageUrl(scene.id, displaySrc);
  }

  function handleError() {
    const src = displaySrc ?? "";
    console.error(`[SceneCard] scene ${sceneRef.current.order} ❌ img error src=${src.slice(0, 60)}`);
    setImgStage("failed");
    setStatus("failed");
    setFailReason("Image load failed");
  }

  // ── Manual retry — calls /api/generate-image with scene context ─────────────
  async function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    const s = sceneRef.current;
    if (isRetrying) return;

    console.log(`[SceneCard] scene ${s.order} manual retry`);
    setIsRetrying(true);
    setImgStage("idle");
    setDisplaySrc(null);
    setStatus("generating");

    try {
      const res = await fetch("/api/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          // Use raw prompt if available, otherwise let route build it
          ...(s.imagePrompt
            ? { prompt: s.imagePrompt, seed: Math.floor(Math.random() * 98000) + 1000 }
            : { scene: s }
          ),
          sceneId: s.id,
          tier:    getImageTier(projectId),
        }),
      });
      const data = await res.json() as { ok: boolean; dataUrl?: string; error?: string; kind?: string };

      if (data.ok && data.dataUrl) {
        console.log(`[SceneCard] scene ${s.order} retry ✅`);
        setDisplaySrc(data.dataUrl);
        setImgStage("loading");
        cacheImageUrl(s.id, data.dataUrl);
        // Phase 13 — push to image store
        if (projectId) {
          putImage({
            sceneId:   s.id,
            projectId,
            imageUrl:  data.dataUrl,
            prompt:    s.imagePrompt,
          }).catch(() => {});
        }
      } else {
        console.error(`[SceneCard] scene ${s.order} retry ❌ kind=${data.kind} error=${data.error}`);
        setImgStage("failed");
        setStatus("failed");
        setFailReason(data.error ?? "Retry failed");
      }
    } catch (fetchErr) {
      console.error(`[SceneCard] scene ${s.order} retry fetch threw:`, fetchErr);
      setImgStage("failed");
      setStatus("failed");
      setFailReason("Network error");
    } finally {
      setIsRetrying(false);
    }
  }

  const isGenerating = (imgStage === "idle" || imgStage === "loading") && status !== "loaded";

  return (
    <article
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-pressed={isSelected}
      className={[
        "group relative flex flex-col rounded-sm overflow-hidden cursor-pointer select-none",
        "transition-all duration-300",
        isSelected
          ? "ring-2 ring-amber-400 shadow-[0_0_32px_rgba(251,191,36,0.3)] scale-[1.02]"
          : "ring-1 ring-white/8 hover:ring-white/25 hover:shadow-[0_8px_32px_rgba(0,0,0,0.7)] hover:scale-[1.01]",
      ].join(" ")}
    >
      <SprocketStrip />

      {/* ── Image area 16:9 ── */}
      <div className="relative aspect-video bg-zinc-950 overflow-hidden">

        {/* Shimmer while loading */}
        {isGenerating && (
          <div className="absolute inset-0 z-10 flex flex-col gap-2 items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/30 animate-pulse" />
            </div>
            <div className="w-3/4 h-0.5 rounded-full bg-white/8 shimmer" />
            <div className="w-1/2 h-0.5 rounded-full bg-white/5 shimmer" style={{ animationDelay: "0.2s" }} />
            <span className="mt-1 text-[7px] font-mono text-amber-400/35 animate-pulse tracking-widest uppercase">
              {isRetrying ? "retrying" : "generating"}
            </span>
          </div>
        )}

        {/* Failed state — specific reason + retry */}
        {imgStage === "failed" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950 gap-1.5 px-3">
            <span className="text-[8px] font-mono text-white/20 text-center leading-snug">{failReason}</span>
            {scene.imagePrompt && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="text-[8px] font-mono text-amber-400/50 hover:text-amber-400 border border-amber-400/15 hover:border-amber-400/40 rounded-sm px-2 py-0.5 transition-all disabled:opacity-30"
              >
                {isRetrying ? "…" : "↺ Retry"}
              </button>
            )}
          </div>
        )}

        {/* Real image */}
        {displaySrc && imgStage !== "failed" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={displaySrc}
            src={displaySrc}
            alt={scene.title}
            className={[
              "absolute inset-0 w-full h-full object-cover",
              "transition-opacity duration-700",
              "group-hover:scale-[1.04] transition-transform duration-500",
              imgStage === "loaded" ? "opacity-100" : "opacity-0",
            ].join(" ")}
            onLoad={handleLoad}
            onError={handleError}
          />
        )}

        {/* Letterbox + vignette */}
        <div className="absolute inset-x-0 top-0 h-[7%] bg-black pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black pointer-events-none z-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20 pointer-events-none z-20" />

        <CornerMarkers />

        {/* Scene number */}
        <div className="absolute top-[10%] left-2.5 z-30">
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-sm bg-amber-400 text-[9px] font-black text-black leading-none">
            {scene.order}
          </span>
        </div>

        {/* Shot type */}
        <div className="absolute top-[10%] right-2.5 z-30">
          <span className="rounded-sm bg-black/80 border border-white/10 px-1.5 py-0.5 text-[8px] font-mono text-white/55 uppercase tracking-wider backdrop-blur-sm">
            {abbreviateShotType(scene.shotType)}
          </span>
        </div>

        {/* Generating pulse */}
        {status === "generating" && !isRetrying && (
          <div className="absolute top-[10%] left-9 z-30">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        )}

        {/* Mood pill */}
        <div className="absolute bottom-[10%] right-2.5 z-30">
          <MoodPill mood={scene.mood} />
        </div>
      </div>

      {/* Info bar */}
      <div className="relative bg-black/90 border-t border-white/5 px-2.5 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white/88 truncate leading-tight">{scene.title}</p>
          <p className="text-[9px] text-white/28 truncate mt-0.5 font-mono leading-tight">{scene.location}</p>
        </div>
        <p className="shrink-0 text-[8px] font-mono text-white/18 uppercase tracking-wider mt-0.5 text-right leading-tight max-w-[65px] truncate">
          {scene.lighting.replace(/\//g, "-")}
        </p>
      </div>

      {isSelected && (
        <div className="absolute inset-0 pointer-events-none ring-2 ring-inset ring-amber-400/25 rounded-sm" />
      )}
    </article>
  );
});

export default SceneCard;

/* ── Sub-components ──────────────────────────────────────────────────── */

function SprocketStrip() {
  return (
    <div className="absolute left-0 top-0 bottom-0 w-1.5 z-30 flex flex-col justify-around pointer-events-none">
      {[0,1,2,3,4].map(i => (
        <div key={i} className="mx-auto w-0.5 h-1.5 rounded-full bg-white/7" />
      ))}
    </div>
  );
}

function CornerMarkers() {
  const b = "absolute w-3 h-3 z-30 pointer-events-none";
  return (
    <>
      <div className={`${b} top-[9%]    left-2.5 border-t border-l border-white/18`} />
      <div className={`${b} top-[9%]    right-2.5 border-t border-r border-white/18`} />
      <div className={`${b} bottom-[9%] left-2.5 border-b border-l border-white/18`} />
      <div className={`${b} bottom-[9%] right-2.5 border-b border-r border-white/18`} />
    </>
  );
}

function MoodPill({ mood }: { mood: string }) {
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${moodColor(mood)}`}>
      {mood}
    </span>
  );
}

function abbreviateShotType(shot: string): string {
  const m: Record<string, string> = {
    "Extreme Wide Shot":"EWS","Wide Shot":"WS","Medium Shot":"MS","Close-Up":"CU",
    "Extreme Close-Up":"ECU","Over-the-Shoulder":"OTS","POV Shot":"POV",
    "Dutch Angle":"DUTCH","Aerial Shot":"AERIAL","Tracking Shot":"TRACK",
  };
  return m[shot] ?? shot.slice(0,4).toUpperCase();
}

function moodColor(mood: string): string {
  const c: Record<string,string> = {
    Tense:"bg-red-900/60 text-red-300",        Dramatic:"bg-purple-900/60 text-purple-300",
    Romantic:"bg-pink-900/60 text-pink-300",   Action:"bg-orange-900/60 text-orange-300",
    Mysterious:"bg-indigo-900/60 text-indigo-300", Melancholic:"bg-blue-900/60 text-blue-300",
    Triumphant:"bg-yellow-900/60 text-yellow-300", Horror:"bg-zinc-900/60 text-zinc-400",
    Comedic:"bg-green-900/60 text-green-300",  Serene:"bg-cyan-900/60 text-cyan-300",
  };
  return c[mood] ?? "bg-zinc-800/60 text-zinc-300";
}
