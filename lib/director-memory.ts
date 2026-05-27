"use client";
/**
 * Director Memory — local pattern analysis.
 *
 * Derives a DirectorMemory object from the project's scenes without any
 * API call. Used as instant context for VISH so every response references
 * accumulated creative choices.
 *
 * The "creative tendencies" and "continuity flags" fields require a single
 * Gemini call (via /api/ai-director generate-tendencies) and are only
 * regenerated when the director explicitly requests it.
 */

import type { Scene, DirectorMemory, ProductionNote } from "@/types";
const MEMORY_KEY = "previslab_memory";
const NOTES_KEY  = "previslab_notes";

// ── Memory persistence ────────────────────────────────────────────────────────

export function loadMemory(projectId: string): DirectorMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${MEMORY_KEY}_${projectId}`);
    return raw ? JSON.parse(raw) as DirectorMemory : null;
  } catch { return null; }
}

export function saveMemory(memory: DirectorMemory): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${MEMORY_KEY}_${memory.projectId}`, JSON.stringify(memory));
}

// ── Notes persistence ─────────────────────────────────────────────────────────

export function loadNotes(projectId: string): ProductionNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${NOTES_KEY}_${projectId}`);
    return raw ? JSON.parse(raw) as ProductionNote[] : [];
  } catch { return []; }
}

export function saveNote(note: ProductionNote): void {
  if (typeof window === "undefined") return;
  const notes = loadNotes(note.projectId);
  const idx   = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) notes[idx] = note;
  else notes.unshift(note);
  localStorage.setItem(`${NOTES_KEY}_${note.projectId}`, JSON.stringify(notes));
}

export function deleteNote(projectId: string, noteId: string): void {
  if (typeof window === "undefined") return;
  const notes = loadNotes(projectId).filter(n => n.id !== noteId);
  localStorage.setItem(`${NOTES_KEY}_${projectId}`, JSON.stringify(notes));
}

// ── Pattern derivation ────────────────────────────────────────────────────────

function topK<T>(arr: T[], k: number): T[] {
  const counts = new Map<string, number>();
  for (const item of arr) {
    const key = String(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([v]) => v) as unknown as T[];
}

/**
 * Derive memory patterns from scenes — pure computation, no API.
 * Preserves any previously saved creativeTendencies, continuityFlags,
 * and directorIntent so calling this never wipes VISH observations.
 */
export function deriveMemory(
  scenes:    Scene[],
  projectId: string,
  existing?: DirectorMemory | null,
): DirectorMemory {
  const lightings  = scenes.map(s => s.lighting);
  const moods      = scenes.map(s => s.mood);
  const shotTypes  = scenes.map(s => s.shotType);
  const locations  = scenes.map(s => s.location);

  // Lens + movement from cinematicMeta (manually set in SceneDetail)
  const lenses     = scenes.flatMap(s => s.cinematicMeta?.focalLengthMm ? [`${s.cinematicMeta.focalLengthMm}mm`] : []);
  const movements  = scenes.flatMap(s => s.cinematicMeta?.cameraMovement ? [s.cinematicMeta.cameraMovement] : []);

  return {
    projectId,
    updatedAt: Date.now(),

    dominantLighting:  topK(lightings, 1)[0]  ?? "unset",
    dominantMoods:     topK(moods, 3),
    dominantShotTypes: topK(shotTypes, 3),
    dominantLens:      topK(lenses, 1)[0]     ?? null,
    dominantMovement:  topK(movements, 1)[0]  ?? null,
    locationVariety:   locations.length > 0 ? new Set(locations).size / locations.length : 0,
    moodVariety:       moods.length > 0     ? new Set(moods).size     / moods.length     : 0,

    // Preserve VISH-generated fields — never overwrite with derivation
    creativeTendencies: existing?.creativeTendencies ?? [],
    continuityFlags:    existing?.continuityFlags    ?? [],
    directorIntent:     existing?.directorIntent     ?? "",
  };
}

/**
 * Produce a compact prose summary of the memory for VISH's system prompt.
 * Keeps token count low while giving VISH meaningful creative context.
 */
export function memoryToContext(memory: DirectorMemory, notes: ProductionNote[]): string {
  const lines: string[] = [
    `VISH CREATIVE MEMORY for this project:`,
    `  Lighting tendency: ${memory.dominantLighting}`,
    `  Dominant moods: ${memory.dominantMoods.join(", ") || "mixed"}`,
    `  Dominant shot types: ${memory.dominantShotTypes.join(", ") || "varied"}`,
    memory.dominantLens     ? `  Preferred lens: ${memory.dominantLens}` : "",
    memory.dominantMovement ? `  Camera movement: ${memory.dominantMovement}` : "",
    `  Location variety: ${Math.round(memory.locationVariety * 100)}% unique`,
    `  Mood variety: ${Math.round(memory.moodVariety * 100)}% unique`,
  ].filter(Boolean);

  if (memory.creativeTendencies.length > 0) {
    lines.push(`  VISH observations:`);
    memory.creativeTendencies.forEach(t => lines.push(`    — ${t}`));
  }

  if (memory.continuityFlags.length > 0) {
    lines.push(`  Continuity flags:`);
    memory.continuityFlags.forEach(f => lines.push(`    ⚠ ${f}`));
  }

  if (memory.directorIntent) {
    lines.push(`  Director's stated intent: "${memory.directorIntent}"`);
  }

  // Last 4 project-level notes
  const projectNotes = notes
    .filter(n => n.sceneId === null)
    .slice(0, 4);
  if (projectNotes.length > 0) {
    lines.push(`  Production notes:`);
    projectNotes.forEach(n => lines.push(`    [${n.category}] ${n.content}`));
  }

  return lines.join("\n");
}
