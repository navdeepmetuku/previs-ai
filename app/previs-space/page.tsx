"use client";

/**
 * /previs-space — PREVIS AI Spatial Cinematic Workspace.
 *
 * R3F canvas is dynamically imported (ssr: false) — Three.js is browser-only.
 */

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Project, Scene } from "@/types";
import { getProjects, getLastOpenedId } from "@/lib/storage";
import ReviewMode from "@/components/PrevisSpace/ReviewMode";
import { useHydrateProject } from "@/lib/supabase/useImageStore";
import { preload as preloadImages } from "@/lib/supabase/image-store";
import ModelSettingsPanel from "@/components/ModelSettingsPanel";
import { ResetLayoutButton } from "@/components/DraggablePanel";

const Workspace = dynamic(
  () => import("@/components/PrevisSpace/Workspace"),
  { ssr: false, loading: () => <WorkspaceLoading /> },
);

export default function PrevisSpacePage() {
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [project,        setProject]        = useState<Project | null>(null);
  const [mounted,        setMounted]        = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [reviewOpen,     setReviewOpen]     = useState(false);
  const [reviewScenes,   setReviewScenes]   = useState<Scene[]>([]);

  // Phase 13 — hydrate active project's images from Supabase
  useHydrateProject(project?.id);

  useEffect(() => {
    setMounted(true);

    // Fresh read every time the page is visited
    const loadLatest = () => {
      const all    = getProjects();
      const lastId = getLastOpenedId();
      setProjects(all);
      // Phase 13 — preload all known images into the store
      all.forEach(p => preloadImages(p.scenes, p.id));
      if (all.length > 0) {
        const proj = lastId ? (all.find(p => p.id === lastId) ?? all[0]) : all[0];
        setProject(proj ?? null);
        setReviewScenes(proj?.scenes ?? []);
      }
    };

    loadLatest();

    // Reload on cross-tab localStorage writes (e.g. Studio in another tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "previslab_projects" || e.key === null) loadLatest();
    };
    window.addEventListener("storage", handleStorage);

    const t = setTimeout(() => setShowOnboarding(false), 4000);
    return () => {
      clearTimeout(t);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Keep reviewScenes in sync whenever project or its scenes change
  useEffect(() => {
    setReviewScenes(project?.scenes ?? []);
  }, [project]);

  if (!mounted) return null;

  return (
    <div className="h-screen bg-[#030308] text-white flex flex-col overflow-hidden">

      {/* ── Review mode overlay ── */}
      {reviewOpen && reviewScenes.length > 0 && (
        <ReviewMode
          scenes={reviewScenes}
          initial={0}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {/* ── Top navigation bar ── */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 z-40"
        style={{ background: "rgba(3,3,8,0.96)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>

        {/* Left: identity */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-5 w-5 rounded-sm border border-amber-400/25 bg-amber-400/8 flex items-center justify-center">
              <span className="text-amber-400 text-[8px] font-black">P</span>
            </div>
            <span className="text-[11px] font-bold tracking-widest text-white/65 group-hover:text-white transition-colors">
              PREVIS<span className="text-amber-400">·</span>AI
            </span>
          </Link>

          <span className="text-white/10">›</span>

          <div className="flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/6 px-2.5 py-0.5">
            <span className="text-[8px] text-violet-300/60">⬡</span>
            <span className="text-[9px] font-mono text-violet-300/70 uppercase tracking-widest">Space</span>
          </div>

          {project && (
            <>
              <span className="text-white/10">›</span>
              <span className="text-[10px] text-white/40 truncate max-w-[160px] font-mono">
                {project.title}
              </span>
            </>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {projects.length > 1 && (
            <select
              value={project?.id ?? ""}
              onChange={e => {
                const p = projects.find(x => x.id === e.target.value) ?? null;
                setProject(p);
                setReviewScenes(p?.scenes ?? []);
              }}
              className="bg-white/[0.04] border border-white/8 rounded-md px-2 py-1 text-[9px] text-white/45 outline-none focus:border-violet-400/30 font-mono"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}

          {/* Review Mode button */}
          {project && project.scenes.length > 0 && (
            <button
              onClick={() => setReviewOpen(true)}
              className="flex items-center gap-1.5 text-[9px] font-mono transition-all rounded-md px-2.5 py-1"
              style={{
                color:      "rgba(251,191,36,0.80)",
                border:     "1px solid rgba(251,191,36,0.25)",
                background: "rgba(251,191,36,0.06)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.14)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(251,191,36,0.45)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.06)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(251,191,36,0.25)";
              }}
            >
              <span>▶</span>
              <span>Review</span>
            </button>
          )}

          {/* Phase 14 — Model tier picker */}
          {project && <ModelSettingsPanel projectId={project.id} compact />}

          {/* Phase 16 — Reset draggable panels */}
          <ResetLayoutButton />

          <Link href="/studio"
            className="flex items-center gap-1.5 text-[9px] font-mono text-white/30 hover:text-white/65 border border-white/8 hover:border-white/20 rounded-md px-2.5 py-1 transition-all">
            ← Studio
          </Link>
        </div>
      </div>

      {/* ── Onboarding banner (auto-hides) ── */}
      {showOnboarding && (
        <div
          className="absolute top-[45px] inset-x-0 z-50 flex items-center justify-between px-5 py-3 pointer-events-none"
          style={{
            background:   "linear-gradient(90deg, rgba(74,127,167,0.18) 0%, rgba(74,127,167,0.08) 50%, transparent 100%)",
            borderBottom: "1px solid rgba(74,127,167,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-violet-300/70 text-sm">⬡</span>
            <div>
              <p className="text-[11px] font-bold text-white/80 tracking-wide">
                PREVIS SPACE — Spatial Cinematic Workspace
              </p>
              <p className="text-[9px] text-white/35 mt-0.5">
                Click any card to focus · Drag to orbit · Scroll to zoom · Press ▶ Review to present
              </p>
            </div>
          </div>
          <button
            className="pointer-events-auto text-white/20 hover:text-white/50 text-xs transition-colors"
            onClick={() => setShowOnboarding(false)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Workspace ── */}
      <div className="flex-1 relative overflow-hidden">
        {!project ? <NoProject /> : <Workspace project={project} onProjectUpdated={p => { setProject(p); setReviewScenes(p.scenes); }} />}
      </div>
    </div>
  );
}

/* ── Loading ── */

function WorkspaceLoading() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4"
      style={{ background: "#030308" }}>
      {/* Animated spatial grid indicator */}
      <div className="relative flex items-center justify-center w-16 h-16">
        <div className="absolute inset-0 rounded-full border border-violet-400/20 animate-ping" style={{ animationDuration: "1.8s" }} />
        <div className="h-10 w-10 rounded-sm border border-amber-400/25 bg-amber-400/6 flex items-center justify-center">
          <span className="text-amber-400 text-lg font-black animate-pulse">P</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[9px] font-mono text-violet-300/40 uppercase tracking-[0.25em]">
          Initializing PREVIS SPACE
        </p>
        <p className="text-[7px] font-mono text-white/12 mt-1.5">
          Loading Three.js · React Three Fiber · Cinematic renderer
        </p>
      </div>
    </div>
  );
}

/* ── No project ── */

function NoProject() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4"
      style={{ background: "linear-gradient(135deg, #030308 0%, #06060f 100%)" }}>
      <div className="text-4xl opacity-8">⬡</div>
      <div>
        <h2 className="text-sm font-semibold text-white/40">No project in PREVIS SPACE</h2>
        <p className="mt-1.5 text-[10px] text-white/20 max-w-xs leading-relaxed">
          Open a storyboard in Studio, then click <span className="text-violet-300/60">⬡ Space</span> in the toolbar to enter the spatial workspace.
        </p>
      </div>
      <Link href="/studio"
        className="rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors mt-2">
        Open Studio
      </Link>
    </div>
  );
}
