/**
 * Supabase client — single source of truth for cross-view image storage.
 *
 * Phase 13 — Universal Image Database.
 *
 * Browser-safe: only NEXT_PUBLIC_* keys are read. The anon key has row-level
 * security but for this project we leave RLS open on the scene_images table
 * (no user auth, single-tenant local-first app).
 *
 * If env vars are missing, getSupabase() returns null and consumers must
 * gracefully fall back to localStorage. This keeps the app functional even
 * without Supabase configured.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _initialized = false;

export function getSupabase(): SupabaseClient | null {
  if (_initialized) return _client;
  _initialized = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("your_supabase") || key.includes("your_supabase")) {
    if (typeof window !== "undefined") {
      console.warn("[Supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — image store will use localStorage only");
    }
    _client = null;
    return null;
  }

  try {
    _client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    if (typeof window !== "undefined") {
      console.log("[Supabase] ✅ client initialized");
    }
  } catch (err) {
    console.error("[Supabase] init failed:", err);
    _client = null;
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
