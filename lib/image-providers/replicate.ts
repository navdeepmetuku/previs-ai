/**
 * Replicate Provider — FLUX.1-schnell via Replicate API.
 *
 * Model: black-forest-labs/flux-schnell
 * Docs:  https://replicate.com/black-forest-labs/flux-schnell
 *
 * Requires: REPLICATE_API_TOKEN in .env.local
 * Get free credits at: https://replicate.com/signin
 *
 * Flow:
 *   1. POST /v1/predictions  → { id, status: "starting" }
 *   2. Poll GET /v1/predictions/{id} until status = "succeeded"
 *   3. Return output[0] — a CDN URL to the generated image
 *
 * Replicate is async-first. We poll with 1s intervals, max 120s total.
 * The model typically completes in 3–10 seconds on cold start, 1–3s warm.
 */

import type { ImageProvider, GenerateOptions, GenerateResult } from "./types";
import { ProviderError } from "./types";

const REPLICATE_API     = "https://api.replicate.com/v1";
const MODEL_ID          = "black-forest-labs/flux-schnell";
const POLL_INTERVAL_MS  = 1_500;
const MAX_WAIT_MS       = 120_000;

interface PredictionResponse {
  id:     string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | null;
  error:  string  | null;
  urls:   { get: string };
}

export class ReplicateProvider implements ImageProvider {
  readonly name = "Replicate/FLUX.1-schnell";

  get isReady(): boolean {
    return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const token = process.env.REPLICATE_API_TOKEN?.trim();
    if (!token) {
      throw new ProviderError(
        "no_key",
        "REPLICATE_API_TOKEN is not set. Get free credits at replicate.com/signin",
        undefined, this.name,
      );
    }

    const t0 = Date.now();
    console.log(`[Replicate] generating | seed=${opts.seed ?? "rand"} | prompt: ${opts.prompt.slice(0, 90)}…`);

    // ── 1. Submit prediction ──────────────────────────────────────────────
    const submitRes = await fetch(`${REPLICATE_API}/models/${MODEL_ID}/predictions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        "Prefer":        "wait=5",  // ask Replicate to wait up to 5s before returning
      },
      body: JSON.stringify({
        input: {
          prompt:             opts.prompt,
          aspect_ratio:       "16:9",
          num_inference_steps: 4,
          output_format:      "webp",
          output_quality:      90,
          disable_safety_checker: true,
          ...(opts.seed && opts.seed > 0 ? { seed: opts.seed } : {}),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch(err => {
      throw new ProviderError("network", `Replicate submit failed: ${err}`, String(err), this.name);
    });

    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => "");
      console.error(`[Replicate] submit HTTP ${submitRes.status}: ${body.slice(0, 200)}`);
      if (submitRes.status === 401) {
        throw new ProviderError("invalid_token", "REPLICATE_API_TOKEN is invalid — check replicate.com/account", body, this.name);
      }
      if (submitRes.status === 402) {
        throw new ProviderError("invalid_token", "Replicate account has no credits — top up at replicate.com/account/billing", body, this.name);
      }
      throw new ProviderError("bad_response", `Replicate submit HTTP ${submitRes.status}`, body.slice(0, 200), this.name);
    }

    let prediction = await submitRes.json() as PredictionResponse;
    console.log(`[Replicate] prediction id=${prediction.id} status=${prediction.status}`);

    // ── 2. If already done (Prefer: wait succeeded) ───────────────────────
    if (prediction.status === "succeeded" && prediction.output?.length) {
      return this.buildResult(prediction.output[0], t0);
    }

    // ── 3. Poll until succeeded ───────────────────────────────────────────
    const pollUrl = `${REPLICATE_API}/predictions/${prediction.id}`;
    const deadline = t0 + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(pollUrl, {
        headers: { "Authorization": `Bearer ${token}` },
        signal:  AbortSignal.timeout(15_000),
      }).catch(err => {
        throw new ProviderError("network", `Replicate poll failed: ${err}`, String(err), this.name);
      });

      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => "");
        throw new ProviderError("bad_response", `Replicate poll HTTP ${pollRes.status}`, body.slice(0, 200), this.name);
      }

      prediction = await pollRes.json() as PredictionResponse;
      console.log(`[Replicate] status=${prediction.status} (${Date.now() - t0}ms)`);

      if (prediction.status === "succeeded") {
        if (!prediction.output?.length) {
          throw new ProviderError("bad_response", "Replicate succeeded but returned no output", undefined, this.name);
        }
        return this.buildResult(prediction.output[0], t0);
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new ProviderError(
          "bad_response",
          `Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`,
          prediction.error ?? undefined, this.name,
        );
      }
    }

    throw new ProviderError("timeout", `Replicate timed out after ${MAX_WAIT_MS / 1000}s`, undefined, this.name);
  }

  private buildResult(imageUrl: string, t0: number): GenerateResult {
    const ms = Date.now() - t0;
    console.log(`[Replicate] ✅ ${ms}ms | ${imageUrl.slice(0, 80)}…`);
    return {
      dataUrl:    imageUrl,   // Replicate CDN URL — works directly as <img src>
      provider:   this.name,
      model:      "FLUX.1-schnell",
      durationMs: ms,
      bytes:      0,
    };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const replicateProvider = new ReplicateProvider();
