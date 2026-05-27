/**
 * Public image generation API — delegates to the active provider.
 * Switch providers by editing lib/providers/index.ts only.
 */

import { activeProvider } from "./providers";
import type { CinematicScene } from "./providers";
import type { StoryVisualMemory } from "@/types";

export type { CinematicScene };

// ── In-memory URL cache ─────────────────────────────────────────────────────
// Prevents re-generating an image that has already loaded successfully.
// Key: scene.id  Value: URL that returned a valid image

const _urlCache = new Map<string, string>();
export function getCachedImageUrl(id: string): string | null { return _urlCache.get(id) ?? null; }
export function cacheImageUrl(id: string, url: string): void { _urlCache.set(id, url); }
export function clearImageCache(): void                       { _urlCache.clear(); }

// ── Public API ──────────────────────────────────────────────────────────────

/** Build the primary image URL for a scene. seed must be > 0. */
export function buildStoryboardImageUrl(prompt: string, seed: number): string {
  return activeProvider.buildUrl(prompt, seed);
}

/**
 * Build the cinematic prompt for a scene.
 * Pass storyMemory for cross-scene visual continuity.
 */
export function buildCinematicPrompt(
  scene:       CinematicScene,
  storyMemory?: StoryVisualMemory | null,
): string {
  const prompt = activeProvider.buildPrompt(scene, { storyMemory });
  return prompt;
}

export function buildFallbackUrl(
  scene: Pick<CinematicScene, "id" | "location" | "shotType" | "mood" | "description">,
  seed:  number,
): string {
  return activeProvider.buildFallbackUrl(scene, seed);
}

/** Report a successful image load to the provider's health tracker */
export function reportProviderSuccess(): void {
  activeProvider.recordSuccess();
}

/** Report a failed image load to the provider's health tracker */
export function reportProviderFailure(): void {
  activeProvider.recordFailure();
  const h = activeProvider.health;
  console.warn(`[${activeProvider.name}] health: ${h.status} (failures=${h.failureCount})`);
}
