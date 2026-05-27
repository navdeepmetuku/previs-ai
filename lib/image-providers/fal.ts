/**
 * fal.ai Provider — FLUX.1-schnell image generation.
 *
 * Returns the CDN URL directly from fal.ai — no base64 conversion.
 * The CDN URLs are stable HTTPS links that work as <img src> values.
 *
 * Requires: FAL_KEY in .env.local
 * Get a free key at: https://fal.ai/dashboard/keys
 */

import type { ImageProvider, GenerateOptions, GenerateResult } from "./types";
import { ProviderError } from "./types";

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";
const TIMEOUT_MS   = 120_000; // 2 min — fal cold starts can take ~60s

interface FalResponse {
  images: Array<{ url: string; content_type?: string; width?: number; height?: number }>;
  seed?:  number;
}

export class FalProvider implements ImageProvider {
  readonly name = "fal.ai/FLUX.1-schnell";

  get isReady(): boolean {
    return Boolean(process.env.FAL_KEY?.trim());
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const key = process.env.FAL_KEY?.trim();
    if (!key) {
      throw new ProviderError("no_key", "FAL_KEY is not set in .env.local", undefined, this.name);
    }

    const t0 = Date.now();

    const requestBody = {
      prompt:                opts.prompt,
      image_size:            "landscape_16_9",
      num_inference_steps:   4,
      sync_mode:             true,
      enable_safety_checker: false,
      ...(opts.seed && opts.seed > 0 ? { seed: opts.seed } : {}),
    };

    console.log(`[fal.ai] generating | seed=${opts.seed ?? "rand"} | prompt: ${opts.prompt.slice(0, 90)}…`);

    let response: Response;
    try {
      response = await fetch(FAL_ENDPOINT, {
        method:  "POST",
        headers: {
          "Authorization": `Key ${key}`,
          "Content-Type":  "application/json",
        },
        body:   JSON.stringify(requestBody),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      console.error(`[fal.ai] fetch failed: ${err}`);
      throw new ProviderError(
        isTimeout ? "timeout" : "network",
        isTimeout ? "fal.ai timed out — request took over 2 minutes" : `Network error: ${err}`,
        String(err), this.name,
      );
    }

    const elapsed = Date.now() - t0;
    console.log(`[fal.ai] HTTP ${response.status} in ${elapsed}ms`);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[fal.ai] error body: ${text.slice(0, 300)}`);

      if (response.status === 401 || response.status === 403) {
        // Distinguish exhausted balance from truly invalid key
        const isBalance = text.includes("balance") || text.includes("locked") || text.includes("billing");
        const msg = isBalance
          ? "fal.ai account balance exhausted — top up at fal.ai/dashboard/billing"
          : "FAL_KEY is invalid — check your key at fal.ai/dashboard/keys";
        throw new ProviderError("invalid_token", msg, text, this.name);
      }
      if (response.status === 429) {
        throw new ProviderError("rate_limit", "fal.ai rate limit — wait a moment and retry", text, this.name);
      }
      throw new ProviderError("bad_response", `fal.ai HTTP ${response.status}`, text.slice(0, 200), this.name);
    }

    let json: FalResponse;
    try {
      json = await response.json() as FalResponse;
    } catch {
      throw new ProviderError("bad_response", "fal.ai returned non-JSON response", undefined, this.name);
    }

    if (!json.images?.length || !json.images[0]?.url) {
      throw new ProviderError("bad_response", "fal.ai returned no images", JSON.stringify(json).slice(0, 200), this.name);
    }

    const imageUrl = json.images[0].url;
    const total    = Date.now() - t0;

    console.log(`[fal.ai] ✅ ${total}ms | ${imageUrl.slice(0, 70)}…`);

    // Return the CDN URL directly — works as <img src>, no base64 needed
    return {
      dataUrl:    imageUrl,
      provider:   this.name,
      model:      "FLUX.1-schnell",
      durationMs: total,
      bytes:      0, // not known until fetched by browser
    };
  }
}

export const falProvider = new FalProvider();
