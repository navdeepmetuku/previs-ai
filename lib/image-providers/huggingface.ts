/**
 * HuggingFace Inference API — ImageProvider adapter.
 *
 * Model: black-forest-labs/FLUX.1-schnell
 *   - 4-step distilled FLUX model
 *   - guidance_scale MUST be 0 (schnell ignores CFG guidance)
 *   - dimensions must be divisible by 64
 *   - free tier: ~1000 requests/day, no billing required
 *
 * Requires: HUGGINGFACE_API_KEY in .env.local
 * Get one free at: https://huggingface.co/settings/tokens (READ scope)
 *
 * Architecture note:
 *   This adapter implements ImageProvider from ./types.ts.
 *   Swapping to FLUX.1-dev (better quality, slower) means changing MODEL_URL only.
 *   Swapping to fal.ai or Replicate means adding a new file — zero changes here.
 */

import type { ImageProvider, GenerateOptions, GenerateResult, ProviderErrorKind } from "./types";
import { ProviderError } from "./types";

const MODEL_URL =
  "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";

// SDXL-Turbo: 1-step model, faster cold start, lower quality — used as fallback
const SDXL_TURBO_URL =
  "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo";

// FLUX.1-schnell requires width/height divisible by 64.
// 768×448: cinematic 16:9 closest to 16:9 with 64-alignment.
const DEFAULT_WIDTH  = 768;
const DEFAULT_HEIGHT = 448;

// FLUX.1-schnell is a 4-step model. More steps don't improve quality.
const DEFAULT_STEPS = 4;

// Cold-start retry: HF spins up the model container on first request.
// If we get 503, wait COLD_START_WAIT_MS then retry once.
const COLD_START_WAIT_MS  = 25_000;
const COLD_START_MAX_TRIES = 2;

// Hard timeout per attempt — HF free tier can be slow
const FETCH_TIMEOUT_MS = 55_000;

function classify(status: number, body: string): ProviderErrorKind {
  if (status === 401 || status === 403)            return "invalid_token";
  if (status === 429)                              return "rate_limit";
  if (status === 503)                              return "model_loading";
  if (body.toLowerCase().includes("quota"))        return "rate_limit";
  return "bad_response";
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchOnce(
  key:      string,
  payload:  Record<string, unknown>,
  modelUrl: string = MODEL_URL,
): Promise<Response> {
  return fetch(modelUrl, {
    method: "POST",
    headers: {
      "Authorization":    `Bearer ${key}`,
      "Content-Type":     "application/json",
      "x-wait-for-model": "true",
    },
    body:   JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export class HuggingFaceProvider implements ImageProvider {
  readonly name = "HuggingFace/FLUX.1-schnell";

  get isReady(): boolean {
    return Boolean(process.env.HUGGINGFACE_API_KEY?.trim());
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const key = process.env.HUGGINGFACE_API_KEY?.trim();
    if (!key) {
      throw new ProviderError("no_key", "HUGGINGFACE_API_KEY is not configured", undefined, this.name);
    }

    const width  = Math.round((opts.width  ?? DEFAULT_WIDTH)  / 64) * 64;
    const height = Math.round((opts.height ?? DEFAULT_HEIGHT) / 64) * 64;
    const steps  = opts.steps ?? DEFAULT_STEPS;

    // Try in order: FLUX.1-schnell first, then SDXL-Turbo as fallback
    const MODELS = [
      { url: MODEL_URL,       name: "FLUX.1-schnell", steps,  guidance: 0    },
      { url: SDXL_TURBO_URL,  name: "SDXL-Turbo",    steps: 1, guidance: 0.0 },
    ];

    const t0 = Date.now();

    for (const model of MODELS) {
      const payload: Record<string, unknown> = {
        inputs: opts.prompt,
        parameters: {
          guidance_scale:      model.guidance,
          num_inference_steps: model.steps,
          width,
          height,
        },
      };
      if (opts.negativePrompt) {
        (payload.parameters as Record<string, unknown>).negative_prompt = opts.negativePrompt;
      }
      if (opts.seed && opts.seed > 0) {
        (payload.parameters as Record<string, unknown>).seed = opts.seed;
      }

      console.log(`[HF] trying ${model.name} | ${width}×${height} | prompt=${opts.prompt.slice(0, 70)}…`);

      let succeeded = false;
      let lastError: ProviderError | null = null;

      for (let attempt = 0; attempt < COLD_START_MAX_TRIES; attempt++) {
        if (attempt > 0) {
          console.log(`[HF] cold-start retry ${attempt} for ${model.name} after ${COLD_START_WAIT_MS}ms…`);
          await sleep(COLD_START_WAIT_MS);
        }

        let response: Response;
        try {
          response = await fetchOnce(key, payload, model.url);
        } catch (fetchErr) {
          const isTimeout = fetchErr instanceof Error && fetchErr.name === "TimeoutError";
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          console.error(`[HF] ${model.name} fetch ${isTimeout ? "TIMEOUT" : "ERROR"}: ${msg}`);
          lastError = new ProviderError(
            isTimeout ? "timeout" : "network",
            isTimeout ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s` : `Network error: ${msg}`,
            msg, this.name,
          );
          if (attempt < COLD_START_MAX_TRIES - 1) continue;
          break; // try next model
        }

        const elapsed = Date.now() - t0;
        const ct = response.headers.get("content-type") ?? "";
        console.log(`[HF] ${model.name} HTTP ${response.status} | ${ct} | ${elapsed}ms`);

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const kind = classify(response.status, body);
          console.error(`[HF] ${model.name} error (${kind}): ${body.slice(0, 200)}`);
          lastError = new ProviderError(kind, `${model.name} HTTP ${response.status}`, body.slice(0, 200), this.name);

          if (kind === "model_loading" && attempt < COLD_START_MAX_TRIES - 1) continue;
          break; // try next model on non-retryable or exhausted retries
        }

        if (!ct.startsWith("image/")) {
          const body = await response.text().catch(() => "");
          console.error(`[HF] ${model.name} unexpected content-type "${ct}": ${body.slice(0, 200)}`);
          lastError = new ProviderError("bad_response", `Expected image, got "${ct}"`, body.slice(0, 200), this.name);
          break;
        }

        const buffer  = await response.arrayBuffer();
        const bytes   = buffer.byteLength;
        const base64  = Buffer.from(buffer).toString("base64");
        const dataUrl = `data:${ct};base64,${base64}`;
        const total   = Date.now() - t0;

        console.log(`[HF] ${model.name} ✅ ${bytes} bytes | ${total}ms`);
        succeeded = true;

        return {
          dataUrl,
          provider:   this.name,
          model:      model.name,
          durationMs: total,
          bytes,
        };
      }

      if (succeeded) break; // shouldn't reach here but guard anyway
      console.warn(`[HF] ${model.name} exhausted — trying next model`);
    }

    throw new ProviderError("unknown", "All HuggingFace models failed", undefined, this.name);
  }
}

export const huggingFaceProvider = new HuggingFaceProvider();
