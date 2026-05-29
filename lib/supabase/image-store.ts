"use client";

/**
 * Image Store — universal cross-view image source-of-truth.
 *
 * Phase 13. Wraps Supabase + localStorage so images appear in every view
 * (Studio storyboard, PREVIS SPACE 3D cards, Review Mode, VISH chat) without
 * regenerating.
 *
 * Architecture:
 *   localStorage → instant cache (per scene.id)
 *   Supabase     → durable source of truth (cross-tab + cross-device)
 *
 * On image generation:
 *   1. provider returns dataUrl
 *   2. image-store.put(projectId, sceneId, dataUrl, meta)
 *   3. row inserted into Supabase, also written to localStorage cache
 *   4. all consuming views observe the change via subscription
 *
 * On app load / view change:
 *   1. image-store.hydrateProject(projectId) is called
 *   2. fetches all latest active rows for that project from Supabase
 *   3. merges into in-memory map + localStorage
 *   4. emits change → views re-render
 */

import { getSupabase } from "./client";

const LS_PREFIX = "previslab_img_";  // followed by sceneId

export interface StoredImage {
  sceneId:    string;
  projectId:  string;
  imageUrl:   string;
  prompt?:    string | null;
  provider?:  string | null;
  model?:     string | null;
  tier?:      string | null;
  bytes?:     number | null;
  durationMs?: number | null;
  createdAt?: string;
}

// ── In-memory mirror — fast lookups during a session ─────────────────────────
const _mem = new Map<string, StoredImage>(); // sceneId → StoredImage
let _missingTableWarned = false;

// ── Subscriptions — views listen for image updates ───────────────────────────
type Listener = (sceneId: string, image: StoredImage | null) => void;
const _listeners = new Set<Listener>();

function _emit(sceneId: string, img: StoredImage | null): void {
  _listeners.forEach(l => { try { l(sceneId, img); } catch {} });
}

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

// ── localStorage cache ───────────────────────────────────────────────────────
function readLs(sceneId: string): StoredImage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_PREFIX + sceneId);
    if (!raw) return null;
    return JSON.parse(raw) as StoredImage;
  } catch { return null; }
}

function writeLs(img: StoredImage): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_PREFIX + img.sceneId, JSON.stringify(img));
  } catch (err) {
    // Quota exceeded — clear oldest cache entries
    console.warn("[ImageStore] localStorage quota — pruning oldest");
    pruneLsByAge();
    try { localStorage.setItem(LS_PREFIX + img.sceneId, JSON.stringify(img)); } catch {}
  }
}

function pruneLsByAge(): void {
  if (typeof window === "undefined") return;
  const entries: Array<{ key: string; createdAt: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(LS_PREFIX)) continue;
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? "{}") as StoredImage;
      const t = v.createdAt ? new Date(v.createdAt).getTime() : 0;
      entries.push({ key: k, createdAt: t });
    } catch {}
  }
  // Remove oldest 25%
  entries.sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = Math.max(1, Math.floor(entries.length / 4));
  entries.slice(0, toRemove).forEach(e => localStorage.removeItem(e.key));
}

// ── Public API ───────────────────────────────────────────────────────────────

export function get(sceneId: string): StoredImage | null {
  if (_mem.has(sceneId)) return _mem.get(sceneId)!;
  const ls = readLs(sceneId);
  if (ls) _mem.set(sceneId, ls);
  return ls;
}

export function getUrl(sceneId: string): string | null {
  return get(sceneId)?.imageUrl ?? null;
}

/**
 * Store an image. Writes to memory + localStorage immediately, syncs to
 * Supabase in the background (best-effort).
 */
export async function put(img: StoredImage): Promise<void> {
  const stamped: StoredImage = { ...img, createdAt: img.createdAt ?? new Date().toISOString() };
  _mem.set(img.sceneId, stamped);
  writeLs(stamped);
  _emit(img.sceneId, stamped);

  // Supabase background sync — don't await on critical path
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { error } = await sb.from("scene_images").insert({
      project_id:  stamped.projectId,
      scene_id:    stamped.sceneId,
      image_url:   stamped.imageUrl,
      prompt:      stamped.prompt ?? null,
      provider:    stamped.provider ?? null,
      model:       stamped.model ?? null,
      tier:        stamped.tier ?? null,
      bytes:       stamped.bytes ?? null,
      duration_ms: stamped.durationMs ?? null,
      is_active:   true,
    });
    if (error) {
      const msg  = (error.message ?? "").toLowerCase();
      const code = error.code ?? "";
      const missing = code === "PGRST205" || code === "42P01" || msg.includes("schema cache") || msg.includes("not exist");
      if (missing) {
        // Warn once per session — don't spam the console for every image
        if (!_missingTableWarned) {
          _missingTableWarned = true;
          console.warn("[ImageStore] ☁ Supabase table 'scene_images' is missing. Cross-view sync uses localStorage only until you run lib/supabase/schema.sql in Supabase Studio → SQL Editor.");
        }
      } else {
        console.warn("[ImageStore] Supabase insert failed:", error.message);
      }
    } else {
      console.log(`[ImageStore] ☁ synced scene ${img.sceneId.slice(0, 8)}…`);
    }
  } catch (err) {
    console.warn("[ImageStore] Supabase sync threw:", err);
  }
}

/**
 * Hydrate all stored images for a given project into memory + localStorage.
 * Called when entering Studio, PREVIS SPACE, or Review Mode.
 *
 * Fix: only overwrite an in-memory entry if the Supabase row is strictly
 * newer than what we already have. This prevents a stale Supabase row from
 * clobbering a freshly-generated image that was written to memory this session.
 */
export async function hydrateProject(projectId: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;

  try {
    // Fetch the single latest active row per scene_id for this project.
    // ORDER BY created_at DESC + client-side dedup gives us the newest row
    // per scene without requiring a DISTINCT ON (not supported by PostgREST).
    const { data, error } = await sb
      .from("scene_images")
      .select("scene_id, project_id, image_url, prompt, provider, model, tier, bytes, duration_ms, created_at")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500); // safety cap — prevents huge payloads on large projects

    if (error) {
      const msg  = (error.message ?? "").toLowerCase();
      const code = error.code ?? "";
      const missing = code === "PGRST205" || code === "42P01" || msg.includes("schema cache") || msg.includes("not exist");
      if (!missing) console.warn("[ImageStore] hydrate failed:", error.message);
      // Missing table is not an error — already warned by put(). Silent here.
      return 0;
    }

    if (!data || data.length === 0) {
      console.log(`[ImageStore] hydrate: no rows for project ${projectId.slice(0, 12)}`);
      return 0;
    }

    // Take the first (newest) row per scene_id.
    // Only overwrite an existing in-memory entry if the Supabase row is newer —
    // this prevents a stale DB row from clobbering a freshly-generated image.
    const seen = new Set<string>();
    let added = 0;
    for (const row of data) {
      const sceneId = row.scene_id as string;
      if (seen.has(sceneId)) continue; // already took the newest row for this scene
      seen.add(sceneId);

      const rowCreatedAt = row.created_at as string;

      // If we already have a newer or equal entry in memory, skip this row
      const existing = _mem.get(sceneId);
      if (existing?.createdAt && rowCreatedAt && existing.createdAt >= rowCreatedAt) {
        console.log(`[ImageStore] hydrate: skipping scene ${sceneId.slice(0, 8)} — in-memory entry is newer`);
        continue;
      }

      const img: StoredImage = {
        sceneId,
        projectId:  row.project_id as string,
        imageUrl:   row.image_url as string,
        prompt:     row.prompt as string | null,
        provider:   row.provider as string | null,
        model:      row.model as string | null,
        tier:       row.tier as string | null,
        bytes:      row.bytes as number | null,
        durationMs: row.duration_ms as number | null,
        createdAt:  rowCreatedAt,
      };
      _mem.set(sceneId, img);
      writeLs(img);
      _emit(sceneId, img);
      added++;
    }

    console.log(`[ImageStore] ✅ hydrated ${added} images for project ${projectId.slice(0, 12)}`);
    return added;
  } catch (err) {
    console.warn("[ImageStore] hydrate threw:", err);
    return 0;
  }
}

/** Remove an image from store (memory + LS + Supabase). */
export async function remove(sceneId: string, projectId?: string): Promise<void> {
  _mem.delete(sceneId);
  if (typeof window !== "undefined") {
    try { localStorage.removeItem(LS_PREFIX + sceneId); } catch {}
  }
  _emit(sceneId, null);

  const sb = getSupabase();
  if (!sb) return;
  try {
    let q = sb.from("scene_images").delete().eq("scene_id", sceneId);
    if (projectId) q = q.eq("project_id", projectId);
    const { error } = await q;
    if (error) console.warn("[ImageStore] remove failed:", error.message);
  } catch {}
}

/** Bulk hydrate sync for already-known scenes (no Supabase round-trip). */
export function preload(scenes: Array<{ id: string; imageUrl: string | null }>, projectId: string): void {
  scenes.forEach(s => {
    if (!s.imageUrl) return;
    if (_mem.has(s.id)) return;
    const img: StoredImage = { sceneId: s.id, projectId, imageUrl: s.imageUrl };
    _mem.set(s.id, img);
    writeLs(img);
  });
}
