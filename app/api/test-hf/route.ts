/**
 * GET /api/test-hf — Diagnostic endpoint.
 *
 * Runs a real FLUX.1-schnell generation and returns full success/failure JSON.
 * Visit: http://localhost:3000/api/test-hf
 */

import { huggingFaceProvider } from "@/lib/image-providers/huggingface";
import { ProviderError } from "@/lib/image-providers/types";
import { NEGATIVE_PROMPT } from "@/lib/image-prompts";

export const dynamic = "force-dynamic";

export async function GET() {
  const keyRaw      = process.env.HUGGINGFACE_API_KEY ?? "";
  const keyTrimmed  = keyRaw.trim();
  const configured  = Boolean(keyTrimmed);
  const keyPrefix   = configured ? keyTrimmed.slice(0, 12) + "…" : "(not set)";

  console.log(`[test-hf] configured=${configured} | prefix=${keyPrefix}`);

  if (!configured) {
    return Response.json({ ok: false, kind: "no_key", message: "HUGGINGFACE_API_KEY not set", keyPrefix });
  }

  const TEST_PROMPT = "cinematic film still, person sitting at desk using laptop, small apartment room, practical desk lamp, 35mm lens, photorealistic, film grain";

  try {
    const result = await huggingFaceProvider.generate({
      prompt:         TEST_PROMPT,
      negativePrompt: NEGATIVE_PROMPT,
      seed:           42,
    });

    return Response.json({
      ok:           true,
      provider:     result.provider,
      model:        result.model,
      durationMs:   result.durationMs,
      bytes:        result.bytes,
      dataUrlPrefix: result.dataUrl.slice(0, 50) + "…",
      keyPrefix,
    });

  } catch (err) {
    const kind    = err instanceof ProviderError ? err.kind    : "unknown";
    const message = err instanceof Error         ? err.message : String(err);
    const detail  = err instanceof ProviderError ? (err.detail ?? "") : "";

    return Response.json({ ok: false, kind, message, detail: detail.slice(0, 300), keyPrefix });
  }
}
