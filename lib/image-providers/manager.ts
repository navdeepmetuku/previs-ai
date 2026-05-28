/**
 * Image Provider Manager — Phase 14 multi-tier routing.
 *
 * Each tier has an ordered cascade. Within a tier, providers are tried in
 * priority order — first ready and successful wins. If a tier has no ready
 * providers (e.g. Replicate without token), the manager falls back to
 * Pollinations to guarantee an image.
 *
 *   draft     → [Pollinations]
 *   standard  → [fal.ai → Pollinations]
 *   premium   → [Replicate → fal.ai → Pollinations]
 *   hf        → [HuggingFace → Pollinations]
 *
 * Pollinations is always the last-resort safety net.
 */

import type { GenerateOptions, GenerateResult, ImageProvider } from "./types";
import { ProviderError }                from "./types";
import { replicateProvider }            from "./replicate";
import { falProvider }                  from "./fal";
import { pollinationsImageProvider }    from "./pollinations";
import { huggingFaceProvider }          from "./huggingface";

export type ImageTier = "draft" | "standard" | "premium" | "hf";

const TIER_CASCADE: Record<ImageTier, ImageProvider[]> = {
  draft:    [pollinationsImageProvider],
  standard: [falProvider, pollinationsImageProvider],
  premium:  [replicateProvider, falProvider, pollinationsImageProvider],
  hf:       [huggingFaceProvider, pollinationsImageProvider],
};

export interface OrchestrationResult extends GenerateResult {
  attemptedProviders: string[];
  tier:               ImageTier;
}

export async function generateImage(opts: GenerateOptions, tier: ImageTier = "draft"): Promise<OrchestrationResult> {
  const cascade  = TIER_CASCADE[tier] ?? TIER_CASCADE.draft;
  const ready    = cascade.filter(p => p.isReady);
  const attempted: string[] = [];

  // If no providers ready (shouldn't happen — Pollinations is always ready)
  // fall back to Pollinations explicitly
  const list = ready.length > 0 ? ready : [pollinationsImageProvider];

  for (const provider of list) {
    attempted.push(provider.name);
    try {
      const result = await provider.generate(opts);
      return { ...result, attemptedProviders: attempted, tier };
    } catch (err) {
      const pe = err instanceof ProviderError
        ? err
        : new ProviderError("unknown", err instanceof Error ? err.message : String(err));
      console.error(`[Manager] ${provider.name} failed (${pe.kind}): ${pe.message}`);
      continue;
    }
  }

  throw new ProviderError("unknown", "All image providers failed for tier " + tier);
}

export function getReadyProviders(): string[] {
  // All known providers across all tiers
  const all = [
    replicateProvider,
    falProvider,
    huggingFaceProvider,
    pollinationsImageProvider,
  ];
  return all.filter(p => p.isReady).map(p => p.name);
}

export function getActiveProvider(tier: ImageTier = "draft"): string {
  const cascade = TIER_CASCADE[tier] ?? TIER_CASCADE.draft;
  const p = cascade.find(p => p.isReady);
  return p?.name ?? "Pollinations/FLUX";
}

/** Diagnostic: which tiers are usable right now (have at least one ready non-fallback provider). */
export function getTierAvailability(): Record<ImageTier, { ready: boolean; activeProvider: string }> {
  const out = {} as Record<ImageTier, { ready: boolean; activeProvider: string }>;
  (Object.keys(TIER_CASCADE) as ImageTier[]).forEach(tier => {
    const cascade = TIER_CASCADE[tier];
    const first   = cascade[0];
    out[tier] = {
      ready:           first.isReady,
      activeProvider:  cascade.find(p => p.isReady)?.name ?? "Pollinations/FLUX",
    };
  });
  return out;
}
