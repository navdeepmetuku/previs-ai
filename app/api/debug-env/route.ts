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
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const hfRaw    = process.env.HUGGINGFACE_API_KEY ?? "";
  const geminiRaw = process.env.GEMINI_API_KEY ?? "";

  const hfKey     = hfRaw.trim();
  const geminiKey = geminiRaw.trim();

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
    },

    providers: {
      huggingface: {
        ready:  hfKey.length > 0 && hfKey.startsWith("hf_"),
        reason: hfKey.length === 0
          ? "HUGGINGFACE_API_KEY not set"
          : !hfKey.startsWith("hf_")
          ? "key doesn't start with 'hf_' — may be invalid"
          : "configured",
      },
      fal: {
        ready:  Boolean(process.env.FAL_KEY?.trim()),
        reason: process.env.FAL_KEY?.trim()
          ? "configured"
          : "FAL_KEY not set — get one at fal.ai/dashboard/keys",
      },
    },

    activeProviders: [
      ...(hfKey.length > 0 && hfKey.startsWith("hf_") ? ["HuggingFace"] : []),
      ...(process.env.FAL_KEY?.trim() ? ["fal.ai"] : []),
    ],
  };

  console.log("[debug-env]", JSON.stringify({ ...result, keys: "REDACTED" }));

  return Response.json(result);
}
