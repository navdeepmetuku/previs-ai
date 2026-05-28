"use client";

import { useState } from "react";
import Link from "next/link";
import type { Project, Scene } from "@/types";
import SceneCard from "@/components/SceneCard";
import SceneDetail from "@/components/SceneDetail";
import CinematicTimeline from "@/components/CinematicTimeline";
import PresentationMode from "@/components/PresentationMode";
import ShotListPanel from "@/components/ShotListPanel";
import AiDirectorPanel from "@/components/AiDirectorPanel";
import ModelSettingsPanel from "@/components/ModelSettingsPanel";
import CloudSyncIndicator from "@/components/CloudSyncIndicator";
import { ResetLayoutButton } from "@/components/DraggablePanel";

interface Props {
  project: Project;
  onProjectUpdated: (p: Project) => void;
}

type Layout = "grid" | "filmstrip";
type View   = "storyboard" | "timeline";

export default function StoryboardView({ project, onProjectUpdated }: Props) {
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [layout,        setLayout]        = useState<Layout>("grid");
  const [view,          setView]          = useState<View>("storyboard");
  const [presenting,    setPresenting]    = useState(false);
  const [showShotList,  setShowShotList]  = useState(false);
  const [showAiDirector, setShowAiDirector] = useState(false);

  function handleSceneUpdate(updatedScene: Scene) {
    const scenes = project.scenes.map((s) =>
      s.id === updatedScene.id ? updatedScene : s
    );
    const updated = { ...project, scenes };
    onProjectUpdated(updated);
    // Keep selected scene in sync
    if (selectedScene?.id === updatedScene.id) setSelectedScene(updatedScene);
  }

  function handleReorder(reorderedScenes: Scene[]) {
    onProjectUpdated({ ...project, scenes: reorderedScenes });
    // Re-sync selected scene if it moved
    if (selectedScene) {
      const updated = reorderedScenes.find(s => s.id === selectedScene.id) ?? null;
      setSelectedScene(updated);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-49px)] overflow-hidden">

      {/* ── Presentation overlay ── */}
      {presenting && (
        <PresentationMode
          project={project}
          startIndex={selectedScene ? project.scenes.findIndex(s => s.id === selectedScene.id) : 0}
          onClose={() => setPresenting(false)}
        />
      )}

      {/* ── Shot list overlay ── */}
      {showShotList && (
        <ShotListPanel
          project={project}
          onClose={() => setShowShotList(false)}
        />
      )}

      {/* ── Top chrome ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/30 shrink-0">
        {/* Left: project title + frame count */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-white/60 truncate max-w-[160px]">
            {project.title}
          </span>
          <span className="text-[10px] font-mono text-white/20">
            {project.scenes.length} shots
          </span>
          {project.storyMemory && (
            <span className="hidden sm:inline text-[9px] font-mono text-amber-400/30 truncate max-w-[180px]">
              {project.storyMemory.filmStyle.split(",")[0]}
            </span>
          )}
        </div>

        {/* Right: view mode toggles */}
        <div className="flex items-center gap-2">
          {/* Present button */}
          <button
            onClick={() => setPresenting(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[10px] font-mono text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
            title="Fullscreen presentation (keyboard: ← → Space Esc)"
          >
            <span className="text-[8px]">▶</span> Present
          </button>

          {/* Shot list button */}
          <button
            onClick={() => setShowShotList(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[10px] font-mono text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
            title="Shot list & PDF export"
          >
            ≡ Shot List
          </button>

          {/* VISH button */}
          <button
            onClick={() => setShowAiDirector(v => !v)}
            className={[
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-mono transition-all",
              showAiDirector
                ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                : "border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/5",
            ].join(" ")}
            title="VISH — cinematic AI co-director"
          >
            <span className="text-[8px] font-black">V</span> VISH
          </button>

          {/* ── SPACE button — opens 3D cinematic workspace ── */}
          <Link
            href="/previs-space"
            className="flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-400/8 px-3 py-1 text-[10px] font-mono text-indigo-300/70 hover:text-indigo-200 hover:border-indigo-400/50 hover:bg-indigo-400/15 transition-all"
            title="Open PREVIS SPACE — spatial cinematic 3D workspace"
          >
            <span className="text-[8px]">⬡</span> Space
          </Link>

          {/* Phase 14 — Model tier picker */}
          <ModelSettingsPanel projectId={project.id} compact />

          {/* Cloud sync status — always visible, click to setup */}
          <CloudSyncIndicator projectId={project.id} />

          {/* Phase 16 — Reset draggable panels */}
          <ResetLayoutButton />

          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-white/8 p-0.5">
            <ViewBtn active={view === "storyboard"} onClick={() => setView("storyboard")} label="Storyboard" />
            <ViewBtn active={view === "timeline"}   onClick={() => setView("timeline")}   label="Timeline" />
          </div>

          {/* Layout toggle — storyboard only */}
          {view === "storyboard" && (
            <div className="flex items-center gap-1 rounded-lg border border-white/8 p-0.5">
              <ViewBtn active={layout === "grid"}      onClick={() => setLayout("grid")}      label="Grid" />
              <ViewBtn active={layout === "filmstrip"} onClick={() => setLayout("filmstrip")} label="Strip" />
            </div>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="hidden lg:flex w-52 flex-col border-r border-white/5 bg-black/20 overflow-y-auto shrink-0">
          <div className="p-3">
            <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-3">
              Project
            </p>
            <p className="text-xs font-semibold text-white/80 truncate">{project.title}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{project.genre}</p>

            {project.storyMemory && (
              <div className="mt-3 rounded-md bg-white/[0.03] border border-white/5 p-2">
                <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mb-1">
                  Film Style
                </p>
                <p className="text-[9px] text-white/40 leading-snug">
                  {project.storyMemory.filmStyle}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 p-3">
            <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-2">
              Shots
            </p>
            <div className="space-y-0.5">
              {project.scenes.map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => { setSelectedScene(scene); setView("storyboard"); }}
                  className={[
                    "w-full text-left rounded-md px-2 py-1.5 text-[10px] transition-all duration-150",
                    selectedScene?.id === scene.id
                      ? "bg-amber-400/10 text-amber-400 border border-amber-400/15"
                      : "text-white/45 hover:text-white/75 hover:bg-white/[0.04] border border-transparent",
                  ].join(" ")}
                >
                  <span className="font-mono text-[9px] text-white/20 mr-1.5">
                    {String(scene.order).padStart(2, "0")}
                  </span>
                  <span className="truncate">{scene.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-auto border-t border-white/5 p-3 space-y-1.5">
            <Stat label="Shots"      value={project.scenes.length} />
            <Stat label="Shot types" value={new Set(project.scenes.map(s => s.shotType)).size} />
            <Stat label="Locations"  value={new Set(project.scenes.map(s => s.location)).size} />
            <Stat label="Moods"      value={new Set(project.scenes.map(s => s.mood)).size} />
          </div>
        </aside>

        {/* ── Content area ── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {view === "storyboard" ? (
            <div className="flex flex-1 overflow-hidden">
              {/* Storyboard grid / filmstrip */}
              <div className={`flex-1 overflow-y-auto p-4 ${selectedScene ? "lg:flex-[2]" : ""}`}>
                {layout === "grid" ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {project.scenes.map((scene, idx) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        isSelected={selectedScene?.id === scene.id}
                        loadDelay={idx * 8000}
                        projectId={project.id}
                        onClick={() =>
                          setSelectedScene(selectedScene?.id === scene.id ? null : scene)
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-4">
                    {project.scenes.map((scene, idx) => (
                      <div key={scene.id} className="flex-none w-56">
                        <SceneCard
                          scene={scene}
                          isSelected={selectedScene?.id === scene.id}
                          loadDelay={idx * 8000}
                          projectId={project.id}
                          onClick={() =>
                            setSelectedScene(selectedScene?.id === scene.id ? null : scene)
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right panel — Detail or AI Director */}
              {(selectedScene || showAiDirector) && (
                <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/5 bg-black/30 overflow-hidden shrink-0">
                  {showAiDirector ? (
                    <AiDirectorPanel
                      project={project}
                      selectedScene={selectedScene}
                      onClose={() => setShowAiDirector(false)}
                    />
                  ) : selectedScene ? (
                    <SceneDetail
                      scene={selectedScene}
                      project={project}
                      onUpdate={handleSceneUpdate}
                      onClose={() => setSelectedScene(null)}
                    />
                  ) : null}
                </div>
              )}
            </div>

          ) : (
            /* ── Timeline view ── */
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Timeline strip — fills available height, scrollable horizontally */}
                <div className="flex-1 overflow-y-auto">
                  {/* Instruction hint */}
                  <div className="px-6 pt-6 pb-2">
                    <p className="text-[10px] font-mono text-white/20">
                      Click a shot to preview · Drag to reorder · Click duration to edit · Click transition badge to cycle
                    </p>
                  </div>

                  {/* Expanded shot cards in timeline view */}
                  <div className="px-6 py-2 space-y-2">
                    {project.scenes.map((scene) => {
                      const isSelected = selectedScene?.id === scene.id;
                      const dur        = scene.timelineMeta?.durationSeconds ?? 3;
                      const beat       = scene.timelineMeta?.beatMarker;
                      const pace       = scene.timelineMeta?.paceLabel;
                      const notes      = scene.timelineMeta?.directorNotes;

                      return (
                        <div
                          key={scene.id}
                          onClick={() => setSelectedScene(isSelected ? null : scene)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setSelectedScene(isSelected ? null : scene)}
                          className={[
                            "flex gap-4 rounded-lg border p-3 cursor-pointer transition-all duration-200",
                            isSelected
                              ? "border-amber-400/40 bg-amber-400/5 shadow-[0_0_20px_rgba(251,191,36,0.1)]"
                              : "border-white/5 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]",
                          ].join(" ")}
                        >
                          {/* Thumbnail */}
                          <div className="relative w-32 h-18 rounded-md overflow-hidden bg-zinc-950 shrink-0"
                            style={{ aspectRatio: "16/9", height: 72 }}>
                            {scene.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full bg-zinc-900" />
                            )}
                            <div className="absolute top-1 left-1 h-4 w-4 rounded-sm bg-amber-400 flex items-center justify-center">
                              <span className="text-[7px] font-black text-black">{scene.order}</span>
                            </div>
                          </div>

                          {/* Data */}
                          <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 items-start">
                            <TimelineCell label="Title"     value={scene.title}    className="col-span-2 sm:col-span-1" />
                            <TimelineCell label="Shot"      value={scene.shotType} />
                            <TimelineCell label="Mood"      value={scene.mood} accent={moodColor(scene.mood)} />
                            <TimelineCell label="Duration"  value={`${dur}s`} />
                            {beat  && <TimelineCell label="Beat"  value={beat}  />}
                            {pace  && <TimelineCell label="Pace"  value={pace}  />}
                            {notes && <TimelineCell label="Notes" value={notes} className="col-span-2 sm:col-span-4" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Horizontal timeline strip at bottom */}
                <CinematicTimeline
                  scenes={project.scenes}
                  selectedId={selectedScene?.id ?? null}
                  onSelect={(s) => setSelectedScene(selectedScene?.id === s.id ? null : s)}
                  onReorder={handleReorder}
                  onUpdateScene={handleSceneUpdate}
                />
              </div>

              {/* Right panel — Detail or AI Director */}
              {(selectedScene || showAiDirector) && (
                <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/5 bg-black/30 overflow-hidden shrink-0">
                  {showAiDirector ? (
                    <AiDirectorPanel
                      project={project}
                      selectedScene={selectedScene}
                      onClose={() => setShowAiDirector(false)}
                    />
                  ) : selectedScene ? (
                    <SceneDetail
                      scene={selectedScene}
                      project={project}
                      onUpdate={handleSceneUpdate}
                      onClose={() => setSelectedScene(null)}
                    />
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ViewBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-md px-2.5 py-1 text-[10px] font-medium transition-all duration-150",
        active ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-white/25">{label}</span>
      <span className="text-[10px] font-mono font-semibold text-white/50">{value}</span>
    </div>
  );
}

function TimelineCell({ label, value, accent, className = "" }: {
  label: string; value: string; accent?: string; className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest">{label}</p>
      <p className={`text-[10px] font-medium truncate leading-tight mt-0.5 ${accent ?? "text-white/65"}`}>{value}</p>
    </div>
  );
}

function moodColor(mood: string): string {
  const m: Record<string, string> = {
    Tense: "text-red-400",       Dramatic: "text-purple-400",  Romantic: "text-pink-400",
    Action: "text-orange-400",   Mysterious: "text-indigo-400", Melancholic: "text-blue-400",
    Triumphant: "text-yellow-400", Horror: "text-zinc-400",    Comedic: "text-green-400", Serene: "text-cyan-400",
  };
  return m[mood] ?? "text-white/65";
}

