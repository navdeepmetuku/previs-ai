"use client";

/**
 * Export system — production-ready outputs for a Project.
 *
 * Available exports:
 *
 *   exportShotListPdf(project)      → PDF via window.print() (landscape A4, full table)
 *   exportStoryboardPdf(project)    → Cinematic storyboard PDF (one shot per page with image)
 *   exportShotListTxt(project)      → Plain-text shot list (.txt)
 *   exportProjectJson(project)      → Full project as JSON (.json) for backup / reimport
 *   exportImagesZip(project)        → ZIP of all generated images (lib/zip.ts)
 *
 * No external dependencies for PDF — uses native window.print() with print-only
 * stylesheets. Works in Chrome/Edge/Safari/Firefox.
 *
 * For ZIP: minimal STORE-method (no compression) implementation in lib/zip.ts —
 * keeps bundle size tiny and works for image data which is already compressed.
 */

import type { Project, Scene } from "@/types";
import { buildZip } from "./zip";

// ── Helpers ──────────────────────────────────────────────────────────────────

function totalDuration(project: Project): number {
  return project.scenes.reduce((a, s) => a + (s.timelineMeta?.durationSeconds ?? 3), 0);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9_\-]/gi, "_").slice(0, 80);
}

function openPrintWindow(html: string, title: string): void {
  const win = window.open("", "_blank", "width=1200,height=900");
  if (!win) {
    alert("Pop-up blocked — allow pop-ups for this site to export.");
    return;
  }
  win.document.write(html);
  win.document.title = title;
  win.document.close();
  // Wait for images to load before triggering print
  win.onload = () => setTimeout(() => {
    win.focus();
    win.print();
  }, 600);
}

// ── 1. Shot List PDF (landscape A4, full data table) ────────────────────────

export function exportShotListPdf(project: Project): void {
  const rows = project.scenes.map(scene => {
    const dur  = scene.timelineMeta?.durationSeconds ?? 3;
    const lens = scene.cinematicMeta?.focalLengthMm ? `${scene.cinematicMeta.focalLengthMm}mm` : "—";
    const move = scene.cinematicMeta?.cameraMovement ?? "—";
    const tag  = scene.reviewMeta?.productionTag ?? "";
    return `
      <tr>
        <td>${String(scene.order).padStart(2,"0")}</td>
        <td><strong>${escapeHtml(scene.title)}</strong></td>
        <td>${escapeHtml(scene.shotType)}</td>
        <td>${escapeHtml(lens)}</td>
        <td>${escapeHtml(move)}</td>
        <td>${escapeHtml(scene.lighting)}</td>
        <td>${escapeHtml(scene.mood)}</td>
        <td>${escapeHtml(scene.location)}</td>
        <td>${dur}s</td>
        <td>${escapeHtml(scene.timelineMeta?.transitionType ?? "cut")}</td>
        <td>${escapeHtml(scene.characters || "—")}</td>
        <td>${tag ? `<span class="tag tag-${tag}">${escapeHtml(tag)}</span>` : "—"}</td>
        <td class="notes">${escapeHtml(scene.timelineMeta?.directorNotes ?? "")}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(project.title)} — Shot List</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:9pt;color:#111;background:#fff}
  .header{padding:16px 24px 10px;border-bottom:2px solid #111;margin-bottom:12px}
  .header h1{font-size:16pt;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
  .header .meta{font-size:8pt;color:#555;margin-top:3px;display:flex;gap:20px;flex-wrap:wrap}
  table{width:100%;border-collapse:collapse;font-size:8pt}
  thead tr{background:#111;color:#fff}
  thead th{padding:6px 8px;text-align:left;font-weight:700;font-size:7pt;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
  tbody tr:nth-child(even){background:#f8f8f8}
  td{padding:5px 8px;vertical-align:top;border-bottom:1px solid #e5e5e5}
  td:first-child{font-weight:700;font-size:9pt;color:#555;width:28px}
  .notes{font-size:7.5pt;color:#666;max-width:180px}
  .tag{padding:1px 5px;border-radius:2px;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .tag-approved{background:#dcfce7;color:#166534}
  .tag-revision{background:#fef9c3;color:#713f12}
  .tag-hold{background:#fee2e2;color:#991b1b}
  .tag-ready{background:#cffafe;color:#155e75}
  .footer{margin-top:16px;padding:8px 24px;border-top:1px solid #ddd;font-size:7.5pt;color:#888;display:flex;justify-content:space-between}
  @page{size:A4 landscape;margin:15mm}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body>
  <div class="header">
    <h1>${escapeHtml(project.title)}</h1>
    <div class="meta">
      <span>Genre: ${escapeHtml(project.genre)}</span>
      <span>Shots: ${project.scenes.length}</span>
      <span>Total duration: ${totalDuration(project).toFixed(1)}s</span>
      ${project.storyMemory ? `<span>Style: ${escapeHtml(project.storyMemory.filmStyle.split(",")[0])}</span>` : ""}
      <span>Generated: ${new Date().toLocaleDateString()}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Title</th><th>Shot</th><th>Lens</th><th>Move</th><th>Light</th><th>Mood</th><th>Location</th><th>Dur</th><th>Trans</th><th>Cast</th><th>Status</th><th>Director Notes</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>PREVIS-LAB · Cinematic shot list</span>
    <span>Page printed: ${new Date().toLocaleString()}</span>
  </div>
</body></html>`;

  openPrintWindow(html, `${project.title} — Shot List`);
}

// ── 2. Cinematic Storyboard PDF (one shot per page with image) ──────────────

export function exportStoryboardPdf(project: Project): void {
  const pages = project.scenes.map((scene, idx) => {
    const img = scene.imageUrl
      ? `<img class="board-image" src="${escapeHtml(scene.imageUrl)}" alt="${escapeHtml(scene.title)}"/>`
      : `<div class="board-image-placeholder"><span>No image generated</span></div>`;
    const dur  = scene.timelineMeta?.durationSeconds ?? 3;
    const lens = scene.cinematicMeta?.focalLengthMm ? `${scene.cinematicMeta.focalLengthMm}mm` : "—";
    return `
      <section class="board-page">
        <header class="board-header">
          <div class="board-num">${String(scene.order).padStart(2,"0")}</div>
          <div class="board-title">
            <h2>${escapeHtml(scene.title)}</h2>
            <p>${escapeHtml(scene.location)} · ${escapeHtml(scene.shotType)} · ${escapeHtml(scene.mood)}</p>
          </div>
          <div class="board-stamp">
            <span>${escapeHtml(project.title)}</span>
            <span>${idx + 1} / ${project.scenes.length}</span>
          </div>
        </header>
        <div class="board-frame">${img}</div>
        <div class="board-meta">
          <div class="meta-grid">
            <div class="cell"><span class="label">Lens</span><span class="value">${escapeHtml(lens)}</span></div>
            <div class="cell"><span class="label">Lighting</span><span class="value">${escapeHtml(scene.lighting)}</span></div>
            <div class="cell"><span class="label">Duration</span><span class="value">${dur}s</span></div>
            <div class="cell"><span class="label">Movement</span><span class="value">${escapeHtml(scene.cinematicMeta?.cameraMovement ?? "—")}</span></div>
            <div class="cell"><span class="label">Transition</span><span class="value">${escapeHtml(scene.timelineMeta?.transitionType ?? "cut")}</span></div>
            <div class="cell"><span class="label">Cast</span><span class="value">${escapeHtml(scene.characters || "—")}</span></div>
          </div>
          ${scene.description ? `<div class="board-desc"><span class="label">Description</span><p>${escapeHtml(scene.description)}</p></div>` : ""}
          ${scene.timelineMeta?.directorNotes ? `<div class="board-notes"><span class="label">Director notes</span><p>${escapeHtml(scene.timelineMeta.directorNotes)}</p></div>` : ""}
        </div>
      </section>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(project.title)} — Storyboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0a0a0a;background:#fff}
  .cover{height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;page-break-after:always;background:#0a0a0f;color:#fff}
  .cover h1{font-size:48pt;font-weight:900;letter-spacing:.04em;text-transform:uppercase;text-align:center}
  .cover .sub{margin-top:20px;font-size:11pt;color:#888;letter-spacing:.3em;text-transform:uppercase}
  .cover .stat-row{margin-top:50px;display:flex;gap:60px;font-size:9pt;color:#aaa;letter-spacing:.15em;text-transform:uppercase}
  .cover .stat-row strong{display:block;color:#fbbf24;font-size:18pt;font-weight:700;margin-bottom:4px;letter-spacing:0;text-transform:none}
  .board-page{page-break-after:always;padding:14mm;height:100vh;display:flex;flex-direction:column}
  .board-header{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:2px solid #0a0a0a;margin-bottom:10px}
  .board-num{width:46px;height:46px;background:#fbbf24;color:#000;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14pt;border-radius:3px;flex-shrink:0}
  .board-title{flex:1;min-width:0}
  .board-title h2{font-size:14pt;font-weight:700}
  .board-title p{font-size:8.5pt;color:#666;margin-top:2px}
  .board-stamp{font-size:7pt;color:#888;text-transform:uppercase;letter-spacing:.15em;text-align:right;display:flex;flex-direction:column;gap:2px}
  .board-frame{position:relative;flex:1;background:#000;border:1px solid #111;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:10px;min-height:0}
  .board-image{max-width:100%;max-height:100%;object-fit:contain;display:block}
  .board-image-placeholder{color:#444;font-size:9pt;letter-spacing:.2em;text-transform:uppercase}
  .board-meta{flex-shrink:0}
  .meta-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border:1px solid #ddd;border-bottom:none}
  .cell{padding:5px 8px;border-right:1px solid #ddd;border-bottom:1px solid #ddd}
  .cell:last-child{border-right:none}
  .cell .label{display:block;font-size:6.5pt;color:#888;text-transform:uppercase;letter-spacing:.15em;margin-bottom:2px}
  .cell .value{font-size:8.5pt;color:#0a0a0a;font-weight:600}
  .board-desc,.board-notes{margin-top:8px;font-size:8pt;line-height:1.5;border-left:2px solid #fbbf24;padding-left:8px}
  .board-desc .label,.board-notes .label{font-size:6.5pt;color:#888;text-transform:uppercase;letter-spacing:.15em;display:block;margin-bottom:2px}
  .board-notes{border-color:#666}
  @page{size:A4 landscape;margin:0}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.cover{height:210mm}.board-page{height:210mm}}
</style></head>
<body>
  <section class="cover">
    <h1>${escapeHtml(project.title)}</h1>
    <div class="sub">Cinematic Storyboard · ${escapeHtml(project.genre)}</div>
    <div class="stat-row">
      <div><strong>${project.scenes.length}</strong>Shots</div>
      <div><strong>${totalDuration(project).toFixed(0)}s</strong>Runtime</div>
      <div><strong>${new Set(project.scenes.map(s => s.location)).size}</strong>Locations</div>
      <div><strong>${new Set(project.scenes.map(s => s.mood)).size}</strong>Moods</div>
    </div>
  </section>
  ${pages}
</body></html>`;

  openPrintWindow(html, `${project.title} — Storyboard`);
}

// ── 3. Plain-text shot list ──────────────────────────────────────────────────

export function exportShotListTxt(project: Project): void {
  const lines: string[] = [];
  lines.push("═".repeat(72));
  lines.push(`  ${project.title.toUpperCase()}`);
  lines.push(`  ${project.genre} · ${project.scenes.length} shots · ${totalDuration(project).toFixed(1)}s total`);
  if (project.storyMemory) lines.push(`  Style: ${project.storyMemory.filmStyle}`);
  lines.push("═".repeat(72));
  lines.push("");

  project.scenes.forEach(s => {
    const dur = s.timelineMeta?.durationSeconds ?? 3;
    lines.push(`SHOT ${String(s.order).padStart(2,"0")}  ${s.title}`);
    lines.push("─".repeat(72));
    lines.push(`  Type     : ${s.shotType}`);
    lines.push(`  Location : ${s.location}`);
    lines.push(`  Mood     : ${s.mood}`);
    lines.push(`  Lighting : ${s.lighting}`);
    lines.push(`  Duration : ${dur}s   Transition: ${s.timelineMeta?.transitionType ?? "cut"}`);
    if (s.cinematicMeta?.focalLengthMm)  lines.push(`  Lens     : ${s.cinematicMeta.focalLengthMm}mm`);
    if (s.cinematicMeta?.cameraMovement) lines.push(`  Movement : ${s.cinematicMeta.cameraMovement}`);
    if (s.characters)                    lines.push(`  Cast     : ${s.characters}`);
    lines.push("");
    lines.push(`  ${s.description}`);
    if (s.timelineMeta?.directorNotes) {
      lines.push("");
      lines.push(`  Director Notes:`);
      lines.push(`  ${s.timelineMeta.directorNotes}`);
    }
    lines.push("");
    lines.push("");
  });

  lines.push("═".repeat(72));
  lines.push(`  Generated: ${new Date().toLocaleString()}`);
  lines.push(`  PREVIS-LAB · Cinematic shot list`);
  lines.push("═".repeat(72));

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(project.title)}_shot_list.txt`);
}

// ── 4. JSON export — full project for backup / re-import ─────────────────────

export function exportProjectJson(project: Project): void {
  const data = JSON.stringify({
    schemaVersion: 1,
    exportedAt:    new Date().toISOString(),
    project,
  }, null, 2);
  const blob = new Blob([data], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(project.title)}.previs.json`);
}

// ── 5. ZIP export — all images bundled with manifest ─────────────────────────

interface ImageBlobEntry { path: string; bytes: Uint8Array; }

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array | null> {
  try {
    if (dataUrl.startsWith("data:")) {
      const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return null;
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    // Remote URL — fetch and read as bytes
    const res = await fetch(dataUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function dataUrlExtension(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/jpeg")) return "jpg";
  if (dataUrl.startsWith("data:image/png"))  return "png";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  if (dataUrl.startsWith("data:image/gif"))  return "gif";
  return "img";
}

export async function exportImagesZip(project: Project, opts: { onProgress?: (n: number, total: number) => void } = {}): Promise<void> {
  const entries: ImageBlobEntry[] = [];
  const manifest: Array<{ order: number; sceneId: string; title: string; mood: string; shotType: string; file: string | null }> = [];

  const total = project.scenes.length;
  let done = 0;

  for (const scene of project.scenes) {
    let file: string | null = null;
    if (scene.imageUrl) {
      const bytes = await dataUrlToBytes(scene.imageUrl);
      if (bytes) {
        const ext = scene.imageUrl.startsWith("data:") ? dataUrlExtension(scene.imageUrl) : "jpg";
        file = `images/shot_${String(scene.order).padStart(2,"0")}_${safeFilename(scene.title)}.${ext}`;
        entries.push({ path: file, bytes });
      }
    }
    manifest.push({
      order:    scene.order,
      sceneId:  scene.id,
      title:    scene.title,
      mood:     scene.mood,
      shotType: scene.shotType,
      file,
    });
    done++;
    opts.onProgress?.(done, total);
  }

  // Add manifest as JSON
  const manifestJson = JSON.stringify({ project: project.title, exportedAt: new Date().toISOString(), shots: manifest }, null, 2);
  entries.push({ path: "manifest.json", bytes: new TextEncoder().encode(manifestJson) });

  // Add a plain-text shot list inside the ZIP
  const shotListBytes = new TextEncoder().encode(buildShotListTxt(project));
  entries.push({ path: "shot_list.txt", bytes: shotListBytes });

  const zipBytes = buildZip(entries);
  // Wrap in plain ArrayBuffer slice — TS strict mode dislikes the generic Uint8Array buffer type
  const blob = new Blob([zipBytes.slice().buffer], { type: "application/zip" });
  downloadBlob(blob, `${safeFilename(project.title)}.previs.zip`);
}

function buildShotListTxt(project: Project): string {
  const lines: string[] = [];
  lines.push(project.title);
  lines.push("=".repeat(project.title.length));
  lines.push("");
  project.scenes.forEach(s => {
    lines.push(`Shot ${s.order}: ${s.title} (${s.shotType}, ${s.mood})`);
    lines.push(`  ${s.location} · ${s.lighting}`);
    lines.push(`  ${s.description}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ── 6. CSV export — for spreadsheet workflows ────────────────────────────────

export function exportShotListCsv(project: Project): void {
  const escape = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const header = ["order","title","shot_type","mood","lighting","location","duration_s","transition","lens_mm","movement","characters","description","director_notes","status"];
  const rows = project.scenes.map(s => [
    s.order,
    escape(s.title),
    escape(s.shotType),
    escape(s.mood),
    escape(s.lighting),
    escape(s.location),
    s.timelineMeta?.durationSeconds ?? 3,
    escape(s.timelineMeta?.transitionType ?? "cut"),
    s.cinematicMeta?.focalLengthMm ?? "",
    escape(s.cinematicMeta?.cameraMovement ?? ""),
    escape(s.characters ?? ""),
    escape(s.description ?? ""),
    escape(s.timelineMeta?.directorNotes ?? ""),
    escape(s.reviewMeta?.productionTag ?? ""),
  ].join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(project.title)}_shot_list.csv`);
}
