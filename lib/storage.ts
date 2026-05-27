"use client";

import type { Project } from "@/types";

const STORAGE_KEY    = "previslab_projects";
const LAST_OPENED_KEY = "previslab_last_opened";

// ── Core CRUD ────────────────────────────────────────────────────────────────

export function getProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const projects = JSON.parse(raw) as Project[];
    // Back-compat: add updatedAt if missing (older saves)
    return projects.map(p => ({
      ...p,
      updatedAt: p.updatedAt ?? p.createdAt,
    }));
  } catch {
    return [];
  }
}

export function getProject(id: string): Project | null {
  return getProjects().find(p => p.id === id) ?? null;
}

export function saveProject(project: Project): void {
  const stamped  = { ...project, updatedAt: new Date().toISOString() };
  const projects = getProjects();
  const idx      = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = stamped;
  else projects.unshift(stamped);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  if (getLastOpenedId() === id) clearLastOpenedId();
}

// ── Duplicate ────────────────────────────────────────────────────────────────

export function duplicateProject(id: string): Project | null {
  const original = getProject(id);
  if (!original) return null;
  const now = new Date().toISOString();
  const copy: Project = {
    ...original,
    id:        `proj-${Date.now()}`,
    title:     `${original.title} (copy)`,
    createdAt: now,
    updatedAt: now,
    // Deep-clone scenes so the copy is fully independent
    scenes: original.scenes.map(s => ({
      ...s,
      id:       `${s.id}-copy-${Date.now()}`,
      versions: s.versions ? [...s.versions] : [],
    })),
  };
  saveProject(copy);
  return copy;
}

// ── Last-opened tracking ──────────────────────────────────────────────────────

export function getLastOpenedId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_OPENED_KEY);
}

export function setLastOpenedId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_OPENED_KEY, id);
}

function clearLastOpenedId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAST_OPENED_KEY);
}

// ── Debounced auto-save ──────────────────────────────────────────────────────
// Returns a disposer function to cancel any pending save.
// Typical usage:
//   const cancel = autoSave(project);
//   return cancel; // in useEffect cleanup

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function autoSave(project: Project, delayMs = 1500): () => void {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    saveProject(project);
    _autoSaveTimer = null;
  }, delayMs);
  return () => {
    if (_autoSaveTimer) { clearTimeout(_autoSaveTimer); _autoSaveTimer = null; }
  };
}

// ── Search + filter helpers ──────────────────────────────────────────────────

export function searchProjects(query: string): Project[] {
  const q = query.toLowerCase().trim();
  if (!q) return getProjects();
  return getProjects().filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.genre.toLowerCase().includes(q) ||
    p.scenes.some(s => s.title.toLowerCase().includes(q))
  );
}

export function getRecentProjects(limit = 5): Project[] {
  return getProjects()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}
