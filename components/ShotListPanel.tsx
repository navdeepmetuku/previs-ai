"use client";

/**
 * ShotListPanel — professional shot list overlay.
 *
 * Displays a production-ready table of all shots.
 * "Export PDF" triggers window.print() with print-specific CSS
 * that styles the page as a clean A4/Letter shot list document.
 */

import { useRef } from "react";
import type { Project } from "@/types";

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

  function handlePrint() {
    // Build a clean print-only HTML document
    const rows = project.scenes.map(scene => {
      const dur  = scene.timelineMeta?.durationSeconds ?? 3;
      const lens = scene.cinematicMeta?.focalLengthMm ? `${scene.cinematicMeta.focalLengthMm}mm` : "—";
      const move = scene.cinematicMeta?.cameraMovement ?? "—";
      const tag  = scene.reviewMeta?.productionTag ?? "";
      return `
        <tr>
          <td>${String(scene.order).padStart(2,"0")}</td>
          <td><strong>${scene.title}</strong></td>
          <td>${scene.shotType}</td>
          <td>${lens}</td>
          <td>${move}</td>
          <td>${scene.lighting}</td>
          <td>${scene.mood}</td>
          <td>${scene.location}</td>
          <td>${dur}s</td>
          <td>${scene.timelineMeta?.transitionType ?? "cut"}</td>
          <td>${scene.characters || "—"}</td>
          <td>${tag ? `<span class="tag tag-${tag}">${tag}</span>` : "—"}</td>
          <td class="notes">${scene.timelineMeta?.directorNotes ?? ""}</td>
        </tr>`;
    }).join("");

    const totalDur = project.scenes.reduce((a, s) => a + (s.timelineMeta?.durationSeconds ?? 3), 0);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${project.title} — Shot List</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; color: #111; background: #fff; }
    .header { padding: 16px 24px 10px; border-bottom: 2px solid #111; margin-bottom: 12px; }
    .header h1 { font-size: 16pt; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; }
    .header .meta { font-size: 8pt; color: #555; margin-top: 3px; display: flex; gap: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    thead tr { background: #111; color: #fff; }
    thead th { padding: 6px 8px; text-align: left; font-weight: 700; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
    tbody tr:nth-child(even) { background: #f8f8f8; }
    tbody tr:hover { background: #f0f0f0; }
    td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #e5e5e5; }
    td:first-child { font-weight: 700; font-size: 9pt; color: #555; width: 28px; }
    .notes { font-size: 7.5pt; color: #666; max-width: 160px; }
    .tag { padding: 1px 5px; border-radius: 2px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .tag-approved { background: #dcfce7; color: #166534; }
    .tag-revision  { background: #fef9c3; color: #713f12; }
    .tag-hold      { background: #fee2e2; color: #991b1b; }
    .tag-ready     { background: #cffafe; color: #155e75; }
    .footer { margin-top: 16px; padding: 8px 24px; border-top: 1px solid #ddd; font-size: 7.5pt; color: #888; display: flex; justify-content: space-between; }
    @page { size: A4 landscape; margin: 15mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${project.title}</h1>
    <div class="meta">
      <span>Genre: ${project.genre}</span>
      <span>Shots: ${project.scenes.length}</span>
      <span>Total duration: ${totalDur.toFixed(1)}s</span>
      ${project.storyMemory ? `<span>Style: ${project.storyMemory.filmStyle.split(",")[0]}</span>` : ""}
      <span>Generated: ${new Date(project.createdAt).toLocaleDateString()}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Title</th><th>Shot</th><th>Lens</th><th>Movement</th>
        <th>Lighting</th><th>Mood</th><th>Location</th><th>Dur.</th>
        <th>Trans.</th><th>Characters</th><th>Tag</th><th>Director Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>PREVIS·LAB — ${project.title}</span>
    <span>Confidential</span>
  </div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) { alert("Please allow pop-ups to export PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
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
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-[10px] font-bold text-black hover:bg-amber-300 transition-colors">
              ↓ Export PDF
            </button>
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
