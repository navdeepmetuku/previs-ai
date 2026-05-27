"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { Project } from "@/types";
import {
  getProjects, saveProject, deleteProject, duplicateProject,
  setLastOpenedId, getLastOpenedId, autoSave, searchProjects,
} from "@/lib/storage";
import StoryboardView from "@/components/StoryboardView";
import ScriptInput from "@/components/ScriptInput";

type View = "dashboard" | "new-project" | "storyboard";

// Production status colours — matches ReviewMeta.productionTag
const STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-500/15 text-green-400 border-green-500/25",
  ready:    "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  revision: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  hold:     "bg-red-500/15 text-red-400 border-red-500/25",
};

// Derive dominant tag across all scenes of a project
function dominantTag(project: Project): string | null {
  const counts: Record<string, number> = {};
  for (const s of project.scenes) {
    const t = s.reviewMeta?.productionTag;
    if (t) counts[t] = (counts[t] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export default function StudioPage() {
  const [view,          setView]          = useState<View>("dashboard");
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [saveStatus,    setSaveStatus]    = useState<"saved" | "saving" | "">("");
  const cancelAutoSave  = useRef<(() => void) | null>(null);

  // Load projects and resume last-opened session
  useEffect(() => {
    const all       = getProjects();
    setProjects(all);
    const lastId    = getLastOpenedId();
    if (lastId) {
      const last = all.find(p => p.id === lastId);
      if (last) { setActiveProject(last); setView("storyboard"); }
    }
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleProjectCreated(project: Project) {
    saveProject(project);
    setProjects(getProjects());
    setActiveProject(project);
    setLastOpenedId(project.id);
    setView("storyboard");
  }

  const handleProjectUpdated = useCallback((project: Project) => {
    setActiveProject(project);
    setSaveStatus("saving");

    // Cancel any pending auto-save and schedule a new one
    cancelAutoSave.current?.();
    cancelAutoSave.current = autoSave(project, 1200);

    // Show "saved" after the debounce window
    const t = setTimeout(() => {
      setProjects(getProjects());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    }, 1400);

    return () => clearTimeout(t);
  }, []);

  function handleDeleteProject(id: string) {
    deleteProject(id);
    setProjects(getProjects());
    if (activeProject?.id === id) {
      setActiveProject(null);
      setView("dashboard");
    }
  }

  function handleDuplicateProject(id: string) {
    const copy = duplicateProject(id);
    if (copy) setProjects(getProjects());
  }

  function openProject(project: Project) {
    setActiveProject(project);
    setLastOpenedId(project.id);
    setView("storyboard");
  }

  function goToDashboard() {
    // Flush any pending auto-save immediately before leaving
    cancelAutoSave.current?.();
    if (activeProject) saveProject(activeProject);
    setView("dashboard");
    setActiveProject(null);
    setProjects(getProjects()); // refresh list with latest updatedAt
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-bold tracking-wider">
            PREVIS<span className="text-amber-400">·</span>LAB
          </Link>
          {activeProject && view === "storyboard" && (
            <>
              <span className="text-white/15">/</span>
              <span className="text-xs text-white/55 truncate max-w-[200px]">
                {activeProject.title}
              </span>
              {/* Auto-save indicator */}
              {saveStatus === "saving" && (
                <span className="text-[9px] font-mono text-amber-400/50 animate-pulse">saving…</span>
              )}
              {saveStatus === "saved" && (
                <span className="text-[9px] font-mono text-green-400/50">saved</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view !== "dashboard" && (
            <button onClick={goToDashboard}
              className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors">
              ← Projects
            </button>
          )}
          {view === "dashboard" && (
            <button onClick={() => setView("new-project")}
              className="text-xs px-4 py-2 rounded-full bg-amber-400 text-black font-semibold hover:bg-amber-300 transition-colors">
              + New Project
            </button>
          )}
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="flex-1">
        {view === "dashboard" && (
          <Dashboard
            projects={projects}
            onOpen={openProject}
            onDelete={handleDeleteProject}
            onDuplicate={handleDuplicateProject}
            onNew={() => setView("new-project")}
          />
        )}
        {view === "new-project" && (
          <ScriptInput
            onProjectCreated={handleProjectCreated}
            onProjectUpdated={handleProjectUpdated}
          />
        )}
        {view === "storyboard" && activeProject && (
          <StoryboardView
            project={activeProject}
            onProjectUpdated={handleProjectUpdated}
          />
        )}
      </main>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type SortMode = "recent" | "shots" | "genre" | "status";
type FilterMood = string | null;

// Pipeline stages a project flows through
const PIPELINE_STAGES = ["Script", "Storyboard", "Previs", "Review", "Export"] as const;

function inferPipelineStage(project: Project): number {
  // 0=Script, 1=Storyboard, 2=Previs, 3=Review, 4=Export
  if (project.scenes.length === 0) return 0;
  const hasImages   = project.scenes.some(s => s.imageUrl);
  const hasApproved = project.scenes.some(s => s.reviewMeta?.productionTag === "approved");
  const allApproved = project.scenes.every(s => s.reviewMeta?.productionTag === "approved");
  if (allApproved) return 4;
  if (hasApproved) return 3;
  if (hasImages)   return 2;
  return 1;
}

function getMoodPalette(project: Project): string[] {
  const counts: Record<string, number> = {};
  project.scenes.forEach(s => { counts[s.mood] = (counts[s.mood] ?? 0) + 1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([mood]) => MOOD_COLORS[mood] ?? "#555577");
}

const MOOD_COLORS: Record<string, string> = {
  Tense:"#cc3320",Dramatic:"#8822cc",Romantic:"#cc3066",Action:"#cc6610",
  Mysterious:"#2244cc",Melancholic:"#2266bb",Triumphant:"#ccaa10",
  Horror:"#00cc44",Comedic:"#22cc66",Serene:"#11aaaa",
};

function getTotalRuntime(project: Project): string {
  const secs = project.scenes.reduce((s, sc) => s + (sc.timelineMeta?.durationSeconds ?? 3), 0);
  if (secs >= 60) return `${Math.floor(secs/60)}m ${secs%60}s`;
  return `${secs}s`;
}

function Dashboard({
  projects, onOpen, onDelete, onDuplicate, onNew,
}: {
  projects:    Project[];
  onOpen:      (p: Project) => void;
  onDelete:    (id: string) => void;
  onDuplicate: (id: string) => void;
  onNew:       () => void;
}) {
  const [query,      setQuery]      = useState("");
  const [sort,       setSort]       = useState<SortMode>("recent");
  const [filterMood, setFilterMood] = useState<FilterMood>(null);
  const [filtered,   setFiltered]   = useState<Project[]>(projects);

  // Collect all unique moods across all projects for the filter bar
  const allMoods = Array.from(
    new Set(projects.flatMap(p => p.scenes.map(s => s.mood)))
  ).slice(0, 8);

  useEffect(() => {
    let list = query.trim() ? searchProjects(query) : [...projects];
    if (filterMood) list = list.filter(p => p.scenes.some(s => s.mood === filterMood));
    list.sort((a, b) => {
      if (sort === "recent") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sort === "shots")  return b.scenes.length - a.scenes.length;
      if (sort === "genre")  return a.genre.localeCompare(b.genre);
      if (sort === "status") return inferPipelineStage(b) - inferPipelineStage(a);
      return 0;
    });
    setFiltered(list);
  }, [projects, query, sort, filterMood]);

  // System-wide stats
  const totalShots    = projects.reduce((s, p) => s + p.scenes.length, 0);
  const totalRuntime  = (() => {
    const secs = projects.reduce((s, p) => s + p.scenes.reduce((ss, sc) => ss + (sc.timelineMeta?.durationSeconds ?? 3), 0), 0);
    return secs >= 60 ? `${Math.floor(secs/60)}m ${secs%60}s` : `${secs}s`;
  })();
  const approvedShots = projects.reduce((s, p) =>
    s + p.scenes.filter(sc => sc.reviewMeta?.productionTag === "approved").length, 0);
  const inPrevis      = projects.filter(p => inferPipelineStage(p) >= 2).length;

  // Dominant shot types across all projects
  const shotTypes: Record<string, number> = {};
  projects.forEach(p => p.scenes.forEach(s => { shotTypes[s.shotType] = (shotTypes[s.shotType] ?? 0) + 1; }));
  const topShots = Object.entries(shotTypes).sort((a,b) => b[1]-a[1]).slice(0,4);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* ── Production Command Header ── */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="text-[7px] font-mono text-amber-400/40 uppercase tracking-[0.3em] mb-1">
              Production Command
            </p>
            <h1 className="text-[22px] font-black text-white/90 tracking-tight">Projects</h1>
          </div>
          <button onClick={onNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 text-black text-[11px] font-bold hover:bg-amber-300 transition-all">
            <span className="text-base leading-none">+</span> New Project
          </button>
        </div>

        {/* Stats strip */}
        {projects.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 mb-5">
            {[
              { label: "Projects",    value: String(projects.length),       dim: false },
              { label: "Total Shots", value: String(totalShots),            dim: false },
              { label: "Runtime",     value: totalRuntime,                  dim: false },
              { label: "Approved",    value: String(approvedShots),         dim: approvedShots === 0 },
              { label: "In Previs",   value: String(inPrevis),              dim: inPrevis === 0 },
              { label: "Genres",      value: String(new Set(projects.map(p => p.genre)).size), dim: false },
            ].map(stat => (
              <div key={stat.label}
                style={{ background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:6, padding:"8px 12px" }}>
                <p className="text-[6px] font-mono uppercase tracking-[0.22em] text-white/25 mb-0.5">{stat.label}</p>
                <p className={`text-[16px] font-black leading-none ${stat.dim ? "text-white/20" : "text-white/80"}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Shot type distribution bar */}
        {totalShots > 0 && topShots.length > 0 && (
          <div className="mb-5 p-3 rounded-lg" style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[6px] font-mono uppercase tracking-[0.2em] text-white/20 mb-2">Shot type distribution</p>
            <div className="flex items-center gap-2">
              {topShots.map(([type, count]) => {
                const pct = Math.round((count / totalShots) * 100);
                return (
                  <div key={type} className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="h-1.5 rounded-full flex-1" style={{
                      background:`linear-gradient(90deg, rgba(251,191,36,0.6) 0%, rgba(251,191,36,0.2) 100%)`,
                      width:`${pct}%`, minWidth:4
                    }} />
                    <span className="text-[7px] font-mono text-white/30 whitespace-nowrap shrink-0">
                      {type.split(" ").map(w => w[0]).join("")} {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters + search row */}
        {projects.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search projects, scenes…"
                className="w-52 bg-white/[0.04] border border-white/8 rounded-lg px-3 py-1.5 text-[10px] text-white/70 placeholder-white/20 outline-none focus:border-amber-400/30 font-mono"
              />
              {query && (
                <button onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 text-[9px]">
                  ✕
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)" }}>
              {(["recent","shots","genre","status"] as SortMode[]).map(s => (
                <button key={s} onClick={() => setSort(s)}
                  className="px-2.5 py-1 rounded-md text-[8px] font-mono uppercase tracking-wider transition-all"
                  style={{
                    background: sort === s ? "rgba(255,255,255,0.08)" : "transparent",
                    color:      sort === s ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.25)",
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Mood filter chips */}
            {allMoods.map(mood => (
              <button key={mood} onClick={() => setFilterMood(filterMood === mood ? null : mood)}
                className="px-2 py-0.5 rounded-full text-[7px] font-mono uppercase tracking-wider transition-all"
                style={{
                  background: filterMood === mood ? `${MOOD_COLORS[mood]}22` : "rgba(255,255,255,0.03)",
                  border:     `1px solid ${filterMood === mood ? MOOD_COLORS[mood] + "55" : "rgba(255,255,255,0.07)"}`,
                  color:      filterMood === mood ? MOOD_COLORS[mood] : "rgba(255,255,255,0.25)",
                }}>
                {mood}
              </button>
            ))}

            {filterMood && (
              <button onClick={() => setFilterMood(null)}
                className="text-[7px] font-mono text-white/25 hover:text-white/50 transition-colors">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Project grid ── */}
      {filtered.length === 0 && query ? (
        <p className="text-[10px] font-mono text-white/20 text-center py-16">No projects match "{query}"</p>
      ) : projects.length === 0 ? (
        <EmptyState onNew={onNew} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpen(project)}
              onDelete={() => onDelete(project.id)}
              onDuplicate={() => onDuplicate(project.id)}
            />
          ))}
          {!query && !filterMood && (
            <button onClick={onNew}
              className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 p-8 text-white/20 hover:border-amber-400/25 hover:text-amber-400/40 transition-all min-h-[220px]">
              <span className="text-3xl mb-2 leading-none">+</span>
              <span className="text-[10px] font-mono uppercase tracking-widest">New Project</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project, onOpen, onDelete, onDuplicate,
}: {
  project:     Project;
  onOpen:      () => void;
  onDelete:    () => void;
  onDuplicate: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const tag          = dominantTag(project);
  const tagCls       = tag ? STATUS_STYLES[tag] ?? "" : "";
  const updDate      = new Date(project.updatedAt).toLocaleDateString("en-US", { month:"short", day:"numeric" });
  const moodPalette  = getMoodPalette(project);
  const runtime      = getTotalRuntime(project);
  const pipeStage    = inferPipelineStage(project);
  const thumbScenes  = project.scenes.slice(0, 5);

  // Shot type breakdown for this project
  const shotCounts: Record<string, number> = {};
  project.scenes.forEach(s => { shotCounts[s.shotType] = (shotCounts[s.shotType] ?? 0) + 1; });
  const topShot = Object.entries(shotCounts).sort((a,b) => b[1]-a[1])[0];

  return (
    <div className="group relative rounded-xl overflow-hidden transition-all duration-200 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      style={{ background:"rgba(10,10,18,0.96)", border:"1px solid rgba(255,255,255,0.07)" }}>

      {/* Mood palette bar — top edge */}
      <div className="h-0.5 flex">
        {moodPalette.map((color, i) => (
          <div key={i} className="flex-1" style={{ background: color, opacity: 0.7 }} />
        ))}
      </div>

      {/* Filmstrip */}
      <div className="relative h-36 bg-black cursor-pointer overflow-hidden" onClick={onOpen}>
        {thumbScenes.length > 0 ? (
          <div className="grid h-full gap-px" style={{ gridTemplateColumns:`repeat(${thumbScenes.length}, 1fr)` }}>
            {thumbScenes.map(scene => (
              <div key={scene.id} className="relative overflow-hidden bg-zinc-950">
                {scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt={scene.title}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-85 transition-opacity" loading="lazy" />
                ) : (
                  <div className="w-full h-full" style={{
                    background:`radial-gradient(ellipse at 40% 35%, ${MOOD_COLORS[scene.mood] ?? "#222"}44 0%, #0a0a12 100%)`
                  }} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background:"linear-gradient(135deg, #0a0a14, #12101a)" }}>
            <span className="text-white/5 text-4xl">🎬</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent pointer-events-none" />

        {/* Genre + status */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="text-[6.5px] font-mono uppercase tracking-widest text-white/40 bg-black/65 px-1.5 py-0.5 rounded-sm">
            {project.genre}
          </span>
          {tag && (
            <span className={`text-[6.5px] font-mono uppercase tracking-widest border px-1.5 py-0.5 rounded-sm ${tagCls}`}>
              {tag}
            </span>
          )}
        </div>

        {/* Scene count bottom-left */}
        <div className="absolute bottom-2 left-2">
          <span className="text-[8px] font-mono text-white/40">
            {project.scenes.length} shots · {runtime}
          </span>
        </div>

        {/* Top shot type bottom-right */}
        {topShot && (
          <div className="absolute bottom-2 right-2">
            <span className="text-[7px] font-mono text-white/25">
              {topShot[0].split(" ").map(w=>w[0]).join("")} ×{topShot[1]}
            </span>
          </div>
        )}
      </div>

      {/* Pipeline progress */}
      <div className="px-3 pt-2.5">
        <div className="flex items-center gap-0">
          {PIPELINE_STAGES.map((stage, i) => {
            const done    = i < pipeStage;
            const current = i === pipeStage;
            return (
              <div key={stage} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className="h-0.5 w-full"
                    style={{
                      background: done
                        ? "rgba(251,191,36,0.55)"
                        : current
                        ? "linear-gradient(90deg, rgba(251,191,36,0.55), rgba(251,191,36,0.15))"
                        : "rgba(255,255,255,0.07)",
                    }}
                  />
                  <span className={`text-[5.5px] font-mono mt-1 uppercase tracking-wider ${
                    done ? "text-amber-400/50" : current ? "text-amber-400/80" : "text-white/15"
                  }`}>
                    {stage}
                  </span>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="w-0.5 h-0.5 rounded-full mx-px mb-3.5"
                    style={{ background: done ? "rgba(251,191,36,0.40)" : "rgba(255,255,255,0.08)" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info + actions */}
      <div className="px-3 py-2.5 flex items-center justify-between">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h3 className="text-[11px] font-semibold text-white/88 truncate leading-tight">{project.title}</h3>
          <p className="text-[7.5px] font-mono text-white/22 mt-0.5">
            {updDate}
            {project.storyMemory && (
              <span className="ml-1.5 text-amber-400/22">
                {project.storyMemory.filmStyle.split(",")[0]}
              </span>
            )}
          </p>
        </button>

        {/* Context menu */}
        <div className="relative shrink-0 ml-2">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="h-6 w-6 rounded flex items-center justify-center text-white/18 hover:text-white/55 hover:bg-white/8 transition-all text-[10px]">
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 w-36 rounded-lg border border-white/10 bg-[#0e0e18] shadow-xl overflow-hidden">
              <CtxBtn onClick={onOpen}       label="Open" />
              <CtxBtn onClick={onDuplicate}  label="Duplicate" />
              <CtxBtn onClick={onDelete}     label="Delete" destructive />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CtxBtn({ onClick, label, destructive }: {
  onClick: () => void; label: string; destructive?: boolean;
}) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={[
        "w-full text-left px-3 py-2 text-[10px] font-mono transition-colors",
        destructive
          ? "text-red-400/60 hover:bg-red-400/8 hover:text-red-400"
          : "text-white/50 hover:bg-white/5 hover:text-white",
      ].join(" ")}>
      {label}
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="text-5xl opacity-10 mb-6">🎬</div>
      <h2 className="text-sm font-semibold text-white/50">No projects yet</h2>
      <p className="mt-2 text-[11px] text-white/25 max-w-xs leading-relaxed">
        Paste a script and let VISH extract scenes into a professional cinematic storyboard.
      </p>
      <button onClick={onNew}
        className="mt-6 rounded-full bg-amber-400 px-6 py-2.5 text-xs font-semibold text-black hover:bg-amber-300 transition-colors">
        Create First Project
      </button>
    </div>
  );
}
