/**
 * /api/generate-image — Continuity-aware cinematic image generation.
 *
 * Accepts either:
 *   A) { prompt, seed?, sceneId? }           — legacy / direct prompt
 *   B) { scene, project, sceneId? }          — NEW: full context, builds prompt server-side
 *
 * Mode B uses buildFullPrompt() which injects:
 *   - Character visual descriptors (visual continuity across shots)
 *   - Environment descriptors (location consistency)
 *   - Story visual memory (film style, colour grade, DOP reference)
 *   - Cinematic shot/lighting/mood language
 *
 * Response:
 *   Success: { ok: true,  dataUrl, provider, model, durationMs, bytes, sceneId, prompt }
 *   Failure: { ok: false, error, kind, retryable, sceneId }
 */

import { generateImage, getReadyProviders } from "@/lib/image-providers/manager";
import { ProviderError }                    from "@/lib/image-providers/types";
import { NEGATIVE_PROMPT, buildFullPrompt, sceneToSeed } from "@/lib/image-prompts";
import type { Scene, Project }              from "@/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const reqId = `img-${Date.now()}`;
  console.log(`\n[generate-image:${reqId}] ── REQUEST ──`);

  // ── Parse request ─────────────────────────────────────────────────────────
  let prompt  = "";
  let seed    = 0;
  let sceneId = "";

  try {
    const body = await request.json() as {
      // Mode A — raw prompt
      prompt?:  string;
      seed?:    number;
      sceneId?: string;
      // Mode B — full context
      scene?:   Scene;
      project?: Pick<Project, "genre" | "storyMemory" | "visualContext">;
    };

    sceneId = body.sceneId ?? body.scene?.id ?? "";

    if (body.scene && body.project) {
      // ── Mode B: build continuity-aware prompt server-side ─────────────────
      prompt = buildFullPrompt(body.scene, body.project);
      seed   = body.seed ?? sceneToSeed(body.scene.id);
      console.log(`[generate-image:${reqId}] MODE B (continuity-aware) scene="${body.scene.title}"`);
    } else {
      // ── Mode A: raw prompt passthrough ────────────────────────────────────
      prompt = (body.prompt ?? "").trim();
      seed   = body.seed ?? 0;
      console.log(`[generate-image:${reqId}] MODE A (raw prompt)`);
    }

  } catch {
    return Response.json(
      { ok: false, error: "Invalid request body", kind: "unknown", retryable: false },
      { status: 400 },
    );
  }

  if (!prompt) {
    return Response.json(
      { ok: false, error: "prompt is required", kind: "unknown", retryable: false },
      { status: 400 },
    );
  }

  const ready = getReadyProviders();
  console.log(`[generate-image:${reqId}] providers: [${ready.join(", ")}] | seed=${seed}`);
  console.log(`[generate-image:${reqId}] prompt (${prompt.length}ch): ${prompt.slice(0, 110)}…`);

  // ── Generate ──────────────────────────────────────────────────────────────
  try {
    const result = await generateImage({
      prompt,
      negativePrompt: NEGATIVE_PROMPT,
      seed:           seed > 0 ? seed : undefined,
    });

    console.log(`[generate-image:${reqId}] ✅ ${result.provider} | ${result.bytes}B | ${result.durationMs}ms`);

    return Response.json({
      ok:                 true,
      dataUrl:            result.dataUrl,
      provider:           result.provider,
      model:              result.model,
      durationMs:         result.durationMs,
      bytes:              result.bytes,
      sceneId,
      prompt,              // return prompt so client can display/debug
      attemptedProviders: result.attemptedProviders,
    });

  } catch (err) {
    const pe        = err instanceof ProviderError ? err : null;
    const kind      = pe?.kind      ?? "unknown";
    const message   = err instanceof Error ? err.message : String(err);
    const detail    = pe?.detail    ?? "";
    const retryable = pe?.retryable ?? false;

    console.error(`[generate-image:${reqId}] ❌ kind=${kind} retryable=${retryable}: ${message}`);
    if (detail) console.error(`[generate-image:${reqId}]   detail: ${detail.slice(0, 300)}`);

    return Response.json(
      { ok: false, error: message, kind, retryable, sceneId },
      { status: 200 }, // always 200 — client checks ok:false
    );
  }
}
