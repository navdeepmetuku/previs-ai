"use client";

/**
 * /final-storyboard — Professional storyboard sheet view.
 *
 * Resembles traditional Hollywood storyboard paper:
 *   - 16:9 frame boxes with cinematic letterbox
 *   - Scene number, shot type, lens
 *   - Dialogue (first line)
 *   - Director notes
 *   - Camera movement
 *   - Lighting notes
 *   - Scene description
 *
 * Print / PDF:
 *   Uses @media print styles — clicking "Print / Export PDF" triggers window.print().
 *   The printed output is clean A4 landscape, production-ready.
 *
 * Architecture:
 *   Reads from localStorage (same project system as studio).
 *   No new API calls — pure presentation of existing data.
 */

import { useState, useEffect } from "react";
import { getProjects } from "@/lib/storage";
import type { Project, Scene } from "@/types";
import Link from "next/link";

const SHOT_ABBR: Record<string, string> = {
  "Extreme Wide Shot": "EWS", "Wide Shot": "WS", "Medium Shot": "MS",
  "Close-Up": "CU", "Extreme Close-Up": "ECU", "Over-the-Shoulder": "OTS",
  "POV Shot": "POV", "Dutch Angle": "DUTCH", "Aerial Shot": "AERIAL",
};

function StoryboardFrame({ scene, projectTitle }: { scene: Scene; projectTitle: string }) {
  const shot = SHOT_ABBR[scene.shotType] ?? scene.shotType.slice(0, 5);
  const lens = scene.cinematicMeta?.focalLengthMm ? `${scene.cinematicMeta.focalLengthMm}mm` : "—";
  const move = scene.cinematicMeta?.cameraMovement ?? "—";
  const notes = scene.timelineMeta?.directorNotes ?? "";
  const tag = scene.reviewMeta?.productionTag;

  return (
    <div className="storyboard-frame break-inside-avoid mb-6 print:mb-4">
      {/* Frame box */}
      <div className="flex gap-4 rounded-lg overflow-hidden border border-white/8 bg-white/[0.015] print:border-zinc-300 print:bg-white">

        {/* Image panel */}
        <div className="relative shrink-0 bg-black print:bg-zinc-100"
          style={{ width: 240, minHeight: 135, aspectRatio: "16/9" }}>
          {scene.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scene.imageUrl}
              alt={scene.title}
              className="w-full h-full object-cover print:opacity-90"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900 print:bg-zinc-200">
              <span className="text-white/10 print:text-zinc-400 text-2xl">🎬</span>
            </div>
          )}
          {/* Letterbox */}
          <div className="absolute inset-x-0 top-0 h-[7%] bg-black print:hidden" />
          <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black print:hidden" />
          {/* Scene number overlay */}
          <div className="absolute top-2 left-2">
            <div className="h-5 w-5 rounded-sm bg-amber-400 flex items-center justify-center print:bg-black">
              <span className="text-[9px] font-black text-black print:text-white leading-none">{scene.order}</span>
            </div>
          </div>
        </div>

        {/* Metadata panel */}
        <div className="flex-1 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 content-start">
          {/* Title row */}
          <div className="col-span-2 flex items-baseline justify-between gap-2 pb-1.5 border-b border-white/5 print:border-zinc-200">
            <h3 className="text-[11px] font-bold text-white/85 print:text-black truncate">{scene.title}</h3>
            {tag && (
              <span className="shrink-0 text-[7px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-sm border print:border-zinc-400 print:text-zinc-600"
                style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>
                {tag}
              </span>
            )}
          </div>

          <Cell label="Shot"     value={shot} />
          <Cell label="Lens"     value={lens} />
          <Cell label="Movement" value={move} />
          <Cell label="Lighting" value={scene.lighting} truncate />
          <Cell label="Mood"     value={scene.mood} />
          <Cell label="Location" value={scene.location} truncate />

          {/* Description — full width */}
          <div className="col-span-2">
            <p className="text-[7px] font-mono text-white/20 print:text-zinc-400 uppercase tracking-widest mb-0.5">Description</p>
            <p className="text-[9px] text-white/50 print:text-zinc-600 leading-snug line-clamp-2">{scene.description}</p>
          </div>

          {/* Director notes — full width, if present */}
          {notes && (
            <div className="col-span-2">
              <p className="text-[7px] font-mono text-white/20 print:text-zinc-400 uppercase tracking-widest mb-0.5">Director Notes</p>
              <p className="text-[9px] text-amber-400/60 print:text-zinc-700 leading-snug italic line-clamp-2">{notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div>
      <p className="text-[7px] font-mono text-white/18 print:text-zinc-400 uppercase tracking-widest">{label}</p>
      <p className={`text-[9px] text-white/60 print:text-zinc-700 leading-tight mt-0.5 ${truncate ? "truncate" : ""}`}>{value}</p>
    </div>
  );
}

export default function FinalStoryboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);

  useEffect(() => {
    const all = getProjects();
    setProjects(all);
    if (all.length > 0) setSelected(all[0]);
  }, []);

  function handlePrint() {
    window.print();
  }

  const totalDur = selected
    ? selected.scenes.reduce((a, s) => a + (s.timelineMeta?.durationSeconds ?? 3), 0)
    : 0;

  return (
    <div className="min-h-screen bg-[#060608] text-white print:bg-white print:text-black">

      {/* ── Screen-only header ── */}
      <div className="sticky top-0 z-50 print:hidden flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/studio"
            className="text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors">
            ← Studio
          </Link>
          <span className="text-white/10">|</span>
          <span className="text-[11px] font-bold text-white/70 tracking-wide">Final Storyboard</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Project selector */}
          {projects.length > 1 && (
            <select
              value={selected?.id ?? ""}
              onChange={e => setSelected(projects.find(p => p.id === e.target.value) ?? null)}
              className="bg-white/[0.04] border border-white/8 rounded-lg px-3 py-1.5 text-[10px] text-white/60 outline-none focus:border-amber-400/30 font-mono"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}

          <button onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-[10px] font-bold text-black hover:bg-amber-300 transition-all">
            ↓ Print / Export PDF
          </button>
        </div>
      </div>

      {/* ── Print header ── */}
      <div className="hidden print:block px-8 py-5 border-b-2 border-black">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">PREVIS AI — STORYBOARD</p>
            <h1 className="text-xl font-black text-black mt-0.5">{selected?.title ?? "Untitled"}</h1>
            <p className="text-[9px] text-zinc-500 mt-0.5">
              {selected?.genre} · {selected?.scenes.length} shots · {totalDur.toFixed(1)}s total
              {selected?.storyMemory && ` · ${selected.storyMemory.filmStyle.split(",")[0]}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[8px] text-zinc-400 font-mono">{new Date().toLocaleDateString()}</p>
            <p className="text-[8px] text-zinc-400 font-mono mt-0.5">Confidential</p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-6 py-8 print:px-8 print:py-4">

        {/* No project state */}
        {!selected && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="text-5xl opacity-10 mb-6">📽️</div>
            <h2 className="text-sm font-semibold text-white/40">No projects found</h2>
            <p className="mt-2 text-[10px] text-white/20 max-w-xs">
              Create a storyboard in the studio first, then return here to view the final sheet.
            </p>
            <Link href="/studio" className="mt-6 rounded-full bg-amber-400 px-6 py-2.5 text-xs font-bold text-black hover:bg-amber-300 transition-colors">
              Open Studio
            </Link>
          </div>
        )}

        {/* Storyboard frames */}
        {selected && (
          <>
            {/* Project metadata row — screen only */}
            <div className="print:hidden mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white/80">{selected.title}</h2>
                <p className="text-[9px] font-mono text-white/25 mt-0.5">
                  {selected.genre} · {selected.scenes.length} shots · {totalDur.toFixed(1)}s
                  {selected.storyMemory && ` · ${selected.storyMemory.filmStyle.split(",")[0]}`}
                </p>
              </div>
              <span className="text-[8px] font-mono text-white/15 uppercase tracking-widest">
                {selected.scenes.filter(s => s.imageUrl).length}/{selected.scenes.length} frames generated
              </span>
            </div>

            {/* Frame grid */}
            <div className="space-y-0">
              {selected.scenes.map(scene => (
                <StoryboardFrame key={scene.id} scene={scene} projectTitle={selected.title} />
              ))}
            </div>

            {/* Footer — screen only */}
            <div className="print:hidden mt-8 pt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[8px] font-mono text-white/15">PREVIS·AI — {selected.title}</span>
              <span className="text-[8px] font-mono text-white/15">
                {selected.storyMemory?.filmStyle?.split(",")[0] ?? ""}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .storyboard-frame { page-break-inside: avoid; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
