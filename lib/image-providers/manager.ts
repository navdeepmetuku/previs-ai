/**
 * Image Provider Manager
 *
 * Provider priority (first ready provider wins):
 *
 *   1. Replicate   — REPLICATE_API_TOKEN set → presentation-quality FLUX
 *   2. fal.ai      — FAL_KEY set + balance   → FLUX.1-schnell
 *   3. Pollinations — always ready, free, no key → dev/fallback
 *
 * To switch from dev → presentation: add REPLICATE_API_TOKEN to .env.local
 * and restart. Zero code changes needed.
 */

import type { GenerateOptions, GenerateResult } from "./types";
import { ProviderError }                         from "./types";
import { replicateProvider }                     from "./replicate";
import { falProvider }                           from "./fal";
import { pollinationsImageProvider }             from "./pollinations";
import type { ImageProvider }                    from "./types";

// Priority order: best quality first, always-free last as guaranteed fallback
const PROVIDERS: ImageProvider[] = [
  replicateProvider,
  falProvider,
  pollinationsImageProvider,
];

export interface OrchestrationResult extends GenerateResult {
  attemptedProviders: string[];
}

export async function generateImage(opts: GenerateOptions): Promise<OrchestrationResult> {
  const attempted: string[] = [];
  const ready = PROVIDERS.filter(p => p.isReady);

  // Pollinations is always ready so this can never be empty
  for (const provider of ready) {
    attempted.push(provider.name);
    try {
      const result = await provider.generate(opts);
      return { ...result, attemptedProviders: attempted };
    } catch (err) {
      const pe = err instanceof ProviderError
        ? err
        : new ProviderError("unknown", err instanceof Error ? err.message : String(err));

      console.error(`[Manager] ${provider.name} failed (${pe.kind}): ${pe.message}`);

      // Balance/auth failures — skip to next provider, don't retry same provider
      // Network/timeout failures — also skip (next provider may be more reliable)
      // All errors: continue to next provider
      continue;
    }
  }

  // Should never reach here since Pollinations is always last and always ready
  throw new ProviderError("unknown", "All image providers failed");
}

export function getReadyProviders(): string[] {
  return PROVIDERS.filter(p => p.isReady).map(p => p.name);
}

export function getActiveProvider(): string {
  const p = PROVIDERS.find(p => p.isReady);
  return p?.name ?? "none";
}
