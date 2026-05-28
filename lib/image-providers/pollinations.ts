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
    // Try up to 2 attempts — Pollinations occasionally throttles consecutive
    // requests from the same IP, so a single retry with a different seed
    // dramatically improves reliability when Pollinations is the safety net.
    const MAX_ATTEMPTS = 2;
    let lastErr: ProviderError | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const seed    = opts.seed && opts.seed > 0 && attempt === 0
        ? opts.seed
        : Math.floor(Math.random() * 999_999) + 1;
      const prompt  = clean(opts.prompt);
      const encoded = encodeURIComponent(prompt);
      const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${W}&height=${H}&seed=${seed}&model=flux&nologo=true`;

      const t0 = Date.now();
      console.log(`[Pollinations] ${attempt > 0 ? `retry ${attempt} ` : ""}generating | seed=${seed} | prompt: ${prompt.slice(0, 90)}…`);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(90_000),
        });
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        lastErr = new ProviderError(
          isTimeout ? "timeout" : "network",
          isTimeout ? "Pollinations timed out" : `Pollinations network error: ${err}`,
          String(err), this.name,
        );
        console.warn(`[Pollinations] attempt ${attempt + 1} ${isTimeout ? "TIMEOUT" : "ERROR"}: ${lastErr.message}`);
        if (attempt < MAX_ATTEMPTS - 1) {
          // Brief backoff before retry to let the upstream cache settle
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw lastErr;
      }

      if (!response.ok) {
        lastErr = new ProviderError("bad_response", `Pollinations HTTP ${response.status}`, undefined, this.name);
        if (attempt < MAX_ATTEMPTS - 1) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw lastErr;
      }

      // Verify it's actually an image
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        lastErr = new ProviderError("bad_response", `Pollinations returned non-image content-type: ${contentType}`, undefined, this.name);
        if (attempt < MAX_ATTEMPTS - 1) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw lastErr;
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

    // Should be unreachable — every path above either returns or throws
    throw lastErr ?? new ProviderError("unknown", "Pollinations failed unexpectedly", undefined, this.name);
  }
}

export const pollinationsImageProvider = new PollinationsImageProvider();
