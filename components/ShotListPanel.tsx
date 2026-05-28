"use client";

/**
 * ShotListPanel — professional shot list overlay.
 *
 * Displays a production-ready table of all shots.
 * Phase 13/14/Export: full export menu with PDF / Storyboard / TXT / CSV / JSON / ZIP.
 */

import { useRef, useState } from "react";
import type { Project } from "@/types";
import {
  exportShotListPdf, exportStoryboardPdf, exportShotListTxt,
  exportShotListCsv, exportProjectJson,   exportImagesZip,
} from "@/lib/export";

interface Props {
  project: Project;
  onClose: () => void;
}

const TAG_COLORS: Record<string, string> = {
  approved: "text-green-400 bg-green-400/10 border-green-400/20",
  revision: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  hold:     "text-red-400   bg-red-400/10   border-red-400/20",
  ready:    "text-cyan-400  bg-cyan-400/10  border-cyan-400/20",
};

const MOOD_COLORS: Record<string, string> = {
  Tense: "text-red-400", Dramatic: "text-purple-400", Romantic: "text-pink-400",
  Action: "text-orange-400", Mysterious: "text-indigo-400", Melancholic: "text-blue-400",
  Triumphant: "text-yellow-400", Horror: "text-zinc-400", Comedic: "text-green-400", Serene: "text-cyan-400",
};

export default function ShotListPanel({ project, onClose }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [exportOpen,   setExportOpen]   = useState(false);
  const [zipBusy,      setZipBusy]      = useState(false);
  const [zipProgress,  setZipProgress]  = useState({ done: 0, total: 0 });

  async function handleZipExport() {
    if (zipBusy) return;
    setZipBusy(true);
    setZipProgress({ done: 0, total: project.scenes.length });
    try {
      await exportImagesZip(project, {
        onProgress: (done, total) => setZipProgress({ done, total }),
      });
    } catch (err) {
      console.error("[Export] ZIP failed", err);
      alert("ZIP export failed. See console for details.");
    } finally {
      setZipBusy(false);
      setExportOpen(false);
    }
  }

  function handlePrint() {
    // Legacy entry point — now delegates to the unified PDF exporter
    exportShotListPdf(project);
  }

  const totalDur = project.scenes.reduce((a, s) => a + (s.timelineMeta?.durationSeconds ?? 3), 0);

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="Shot list">

      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border border-white/10 bg-[#0c0c14] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white/90">Shot List</h2>
            <p className="text-[10px] text-white/30 mt-0.5">
              {project.title} · {project.scenes.length} shots · {totalDur.toFixed(1)}s total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export menu */}
            <div className="relative">
              <button
                onClick={() => setExportOpen(o => !o)}
                onBlur={() => setTimeout(() => setExportOpen(false), 200)}
                className="flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-[10px] font-bold text-black hover:bg-amber-300 transition-colors"
              >
                ↓ Export
                <span className="text-[8px] opacity-60">▾</span>
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-white/10 bg-[#0e0e18] shadow-xl overflow-hidden">
                  <ExportMenuItem
                    icon="📄" label="Shot List (PDF)"
                    sub="Landscape, full data table"
                    onClick={() => { exportShotListPdf(project); setExportOpen(false); }}
                  />
                  <ExportMenuItem
                    icon="🎞" label="Storyboard (PDF)"
                    sub="One shot per page with image"
                    onClick={() => { exportStoryboardPdf(project); setExportOpen(false); }}
                  />
                  <div className="h-px bg-white/5" />
                  <ExportMenuItem
                    icon="📝" label="Shot List (TXT)"
                    sub="Plain-text production sheet"
                    onClick={() => { exportShotListTxt(project); setExportOpen(false); }}
                  />
                  <ExportMenuItem
                    icon="📊" label="Shot List (CSV)"
                    sub="Open in Excel / Sheets"
                    onClick={() => { exportShotListCsv(project); setExportOpen(false); }}
                  />
                  <div className="h-px bg-white/5" />
                  <ExportMenuItem
                    icon="📦"
                    label={zipBusy ? `Packaging ${zipProgress.done}/${zipProgress.total}…` : "Project Bundle (ZIP)"}
                    sub="Images + manifest + shot list"
                    disabled={zipBusy}
                    onClick={handleZipExport}
                  />
                  <ExportMenuItem
                    icon="💾" label="Project Backup (JSON)"
                    sub="Full project for re-import"
                    onClick={() => { exportProjectJson(project); setExportOpen(false); }}
                  />
                </div>
              )}
            </div>

            <button onClick={onClose}
              className="h-7 w-7 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/8 transition-all">
              ✕
            </button>
          </div>
        </div>

        {/* Table */}
        <div ref={tableRef} className="flex-1 overflow-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead className="sticky top-0 bg-[#0c0c14] border-b border-white/8 z-10">
              <tr>
                {["#","Title","Shot","Lens","Move","Lighting","Mood","Location","Dur","Trans","Characters","Tag","Notes"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[8px] font-mono text-white/30 uppercase tracking-widest whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {project.scenes.map((scene, i) => {
                const dur  = scene.timelineMeta?.durationSeconds ?? 3;
                const lens = scene.cinematicMeta?.focalLengthMm ? `${scene.cinematicMeta.focalLengthMm}mm` : "—";
                const move = scene.cinematicMeta?.cameraMovement ?? "—";
                const tag  = scene.reviewMeta?.productionTag;
                const tagCls = tag ? TAG_COLORS[tag] ?? "" : "";

                return (
                  <tr key={scene.id}
                    className={`border-b border-white/4 transition-colors ${i % 2 === 0 ? "bg-white/[0.01]" : ""} hover:bg-white/[0.04]`}>
                    <td className="px-3 py-2 font-mono text-white/40 whitespace-nowrap">
                      {String(scene.order).padStart(2, "0")}
                    </td>
                    <td className="px-3 py-2 font-semibold text-white/80 max-w-[120px]">
                      <p className="truncate">{scene.title}</p>
                    </td>
                    <td className="px-3 py-2 text-white/55 whitespace-nowrap">{scene.shotType}</td>
                    <td className="px-3 py-2 font-mono text-white/40">{lens}</td>
                    <td className="px-3 py-2 font-mono text-white/40 capitalize">{move}</td>
                    <td className="px-3 py-2 text-white/50 max-w-[100px]">
                      <span className="truncate block">{scene.lighting}</span>
                    </td>
                    <td className={`px-3 py-2 font-semibold ${MOOD_COLORS[scene.mood] ?? "text-white/55"}`}>
                      {scene.mood}
                    </td>
                    <td className="px-3 py-2 text-white/45 max-w-[130px]">
                      <span className="truncate block">{scene.location}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-white/40 whitespace-nowrap">{dur}s</td>
                    <td className="px-3 py-2 font-mono text-white/35 whitespace-nowrap">
                      {scene.timelineMeta?.transitionType ?? "cut"}
                    </td>
                    <td className="px-3 py-2 text-white/45 max-w-[100px]">
                      <span className="truncate block">{scene.characters || "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      {tag ? (
                        <span className={`rounded-sm border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide ${tagCls}`}>
                          {tag}
                        </span>
                      ) : (
                        <span className="text-white/15">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-white/40 max-w-[160px]">
                      <span className="line-clamp-2 text-[9px] leading-snug">
                        {scene.timelineMeta?.directorNotes ?? ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-white/5 flex items-center justify-between shrink-0">
          <span className="text-[8px] font-mono text-white/15 uppercase tracking-widest">
            PREVIS·LAB — {project.title}
          </span>
          {project.storyMemory && (
            <span className="text-[8px] font-mono text-white/15">
              {project.storyMemory.filmStyle.split(",")[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


/* ── Export menu item ───────────────────────────────────────────────────────── */

function ExportMenuItem({
  icon, label, sub, onClick, disabled,
}: {
  icon: string; label: string; sub: string;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); /* keep onBlur from cancelling */ }}
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/85 font-semibold leading-tight">{label}</p>
        <p className="text-[8px] text-white/35 mt-0.5 truncate">{sub}</p>
      </div>
    </button>
  );
}
