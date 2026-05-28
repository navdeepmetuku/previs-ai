/**
 * GET /api/debug-env — Server-side environment diagnostic.
 *
 * NEVER exposes key values. Only shows:
 *   - which keys are configured (boolean)
 *   - key prefixes (first 8 chars only — safe to log)
 *   - Node.js version
 *   - Runtime environment
 *
 * Visit: http://localhost:3000/api/debug-env
 *
 * Phase 14: also reports per-provider readiness so the model settings panel
 * can show which tiers are usable.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const hfRaw     = process.env.HUGGINGFACE_API_KEY ?? "";
  const geminiRaw = process.env.GEMINI_API_KEY ?? "";
  const falRaw    = process.env.FAL_KEY ?? "";
  const repRaw    = process.env.REPLICATE_API_TOKEN ?? "";
  const sbUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const sbKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const hfKey     = hfRaw.trim();
  const geminiKey = geminiRaw.trim();
  const falKey    = falRaw.trim();
  const repKey    = repRaw.trim();

  const hfReady = hfKey.length > 0 && hfKey.startsWith("hf_");
  const falReady = falKey.length > 0;
  const repReady = repKey.length > 0;
  const sbReady  = sbUrl.length > 0 && sbKey.length > 0 && !sbUrl.includes("your_supabase");

  const result = {
    timestamp:    new Date().toISOString(),
    nodeVersion:  process.version,
    nodeEnv:      process.env.NODE_ENV ?? "unknown",

    keys: {
      HUGGINGFACE_API_KEY: {
        set:       hfKey.length > 0,
        prefix:    hfKey.length > 0 ? hfKey.slice(0, 8) + "…" : "(not set)",
        length:    hfKey.length,
        startsWithHf: hfKey.startsWith("hf_"),
      },
      GEMINI_API_KEY: {
        set:       geminiKey.length > 0,
        prefix:    geminiKey.length > 0 ? geminiKey.slice(0, 8) + "…" : "(not set)",
        length:    geminiKey.length,
      },
      FAL_KEY:     { set: falKey.length > 0 },
      REPLICATE_API_TOKEN: { set: repKey.length > 0 },
      NEXT_PUBLIC_SUPABASE_URL: { set: sbUrl.length > 0 && !sbUrl.includes("your_supabase") },
    },

    // Phase 14 — Provider readiness flags (used by ModelSettingsPanel)
    huggingface: hfReady,
    fal:         falReady,
    replicate:   repReady,
    supabase:    sbReady,

    providers: {
      huggingface: {
        ready:  hfReady,
        reason: hfKey.length === 0
          ? "HUGGINGFACE_API_KEY not set"
          : !hfKey.startsWith("hf_")
          ? "key doesn't start with 'hf_' — may be invalid"
          : "configured",
      },
      fal: {
        ready:  falReady,
        reason: falReady ? "configured" : "FAL_KEY not set — get one at fal.ai/dashboard/keys",
      },
      replicate: {
        ready:  repReady,
        reason: repReady ? "configured" : "REPLICATE_API_TOKEN not set — get one at replicate.com/account/api-tokens",
      },
      supabase: {
        ready:  sbReady,
        reason: sbReady ? "configured" : "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY not set",
      },
    },

    activeProviders: [
      "Pollinations",
      ...(hfReady   ? ["HuggingFace"] : []),
      ...(falReady  ? ["fal.ai"]      : []),
      ...(repReady  ? ["Replicate"]   : []),
    ],
  };

  console.log("[debug-env]", JSON.stringify({ ...result, keys: "REDACTED" }));

  return Response.json(result);
}
