/**
 * Pollinations.ai Provider — completely free, no API key, no account.
 *
 * Perfect for development. Zero quota limits. Returns a direct CDN URL.
 * Model: flux (FLUX.1-schnell via Pollinations proxy)
 *
 * URL format:
 *   https://image.pollinations.ai/prompt/{encoded_prompt}
 *     ?width=1280&height=720&seed={seed}&model=flux&nologo=true
 *
 * Note: always strip "/" from prompts — Cloudflare decodes %2F and splits routes.
 */

import type { ImageProvider, GenerateOptions, GenerateResult } from "./types";
import { ProviderError } from "./types";

const W = 1280;
const H = 720;

function clean(s: string): string {
  return s.replace(/[/\\]/g, "-").trim();
}

export class PollinationsImageProvider implements ImageProvider {
  readonly name = "Pollinations/FLUX";

  // Always ready — no key required
  get isReady(): boolean { return true; }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const seed    = opts.seed && opts.seed > 0 ? opts.seed : Math.floor(Math.random() * 999_999) + 1;
    const prompt  = clean(opts.prompt);
    const encoded = encodeURIComponent(prompt);
    const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${W}&height=${H}&seed=${seed}&model=flux&nologo=true`;

    const t0 = Date.now();
    console.log(`[Pollinations] generating | seed=${seed} | prompt: ${prompt.slice(0, 90)}…`);

    // Pollinations is a URL-based service — we HEAD-check to confirm the image exists
    // then return the URL directly (browser will load it in <img src>)
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      throw new ProviderError(
        isTimeout ? "timeout" : "network",
        isTimeout ? "Pollinations timed out" : `Pollinations network error: ${err}`,
        String(err), this.name,
      );
    }

    if (!response.ok) {
      throw new ProviderError("bad_response", `Pollinations HTTP ${response.status}`, undefined, this.name);
    }

    // Verify it's actually an image
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new ProviderError("bad_response", `Pollinations returned non-image content-type: ${contentType}`, undefined, this.name);
    }

    const ms = Date.now() - t0;
    console.log(`[Pollinations] ✅ ${ms}ms`);

    // Convert to data URL for consistent storage (avoids re-fetching on reload)
    const buffer  = await response.arrayBuffer();
    const bytes   = buffer.byteLength;
    const base64  = Buffer.from(buffer).toString("base64");
    const imgType = contentType.split(";")[0];
    const dataUrl = `data:${imgType};base64,${base64}`;

    return {
      dataUrl,
      provider:   this.name,
      model:      "FLUX (Pollinations)",
      durationMs: ms,
      bytes,
    };
  }
}

export const pollinationsImageProvider = new PollinationsImageProvider();
