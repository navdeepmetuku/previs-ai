/**
 * /api/db-status — Health check for Supabase image store.
 *
 * Returns:
 *   { configured: boolean, ready: boolean, table: "ok" | "missing", url?: string, error?: string }
 *
 * Used by ModelSettingsPanel to show "Cloud sync: ready / offline" status.
 */

import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("your_supabase") || key.includes("your_supabase")) {
    return Response.json({
      configured: false,
      ready:      false,
      table:      "missing",
      error:      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set",
    });
  }

  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    // A small SELECT actually validates the table exists; HEAD with count
    // can return 204 even when the table is missing (false positive).
    const { error, data } = await sb
      .from("scene_images")
      .select("id", { count: "exact" })
      .limit(1);

    if (error) {
      // Distinguish auth from missing-table
      const msg  = (error.message ?? "").toLowerCase();
      const code = error.code ?? "";
      const isAuth    = msg.includes("invalid api key") || msg.includes("jwt") || msg.includes("unauthorized");
      const isMissing =
        code === "42P01"        ||  // SQL relation does not exist
        code === "PGRST205"     ||  // PostgREST schema cache miss
        msg.includes("not exist") ||
        msg.includes("not found") ||
        msg.includes("schema cache");
      return Response.json({
        configured: true,
        ready:      false,
        table:      isAuth ? "auth" : isMissing ? "missing" : "error",
        url,
        error:      error.message || error.hint || "Unknown error",
        hint:       isAuth
          ? "Supabase anon key is invalid. Go to Supabase → Settings → API and copy the current 'anon public' key into NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
          : isMissing
            ? "Run lib/supabase/schema.sql in Supabase Studio → SQL Editor to create the scene_images table."
            : "See Supabase logs for details.",
      });
    }

    return Response.json({
      configured: true,
      ready:      true,
      table:      "ok",
      count:      data?.length ?? 0,
      url,
    });
  } catch (err) {
    return Response.json({
      configured: true,
      ready:      false,
      table:      "error",
      error:      err instanceof Error ? err.message : String(err),
    });
  }
}
