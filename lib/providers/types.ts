/**
 * ImageProvider interface — all image generation adapters implement this.
 *
 * Designed to be swapped via lib/providers/index.ts.
 * Future adapters: HuggingFace Inference, Stability AI, Replicate, OpenRouter.
 */

import type { StoryVisualMemory } from "@/types";

export interface CinematicScene {
  id:          string;
  title:       string;
  description: string;
  shotType:    string;
  lighting:    string;
  mood:        string;
  location:    string;
  characters?: string;
}

/** Optional per-request context — providers use this for richer prompts */
export interface PromptBuildContext {
  /** Story-level visual memory for cross-scene continuity */
  storyMemory?: StoryVisualMemory | null;
}

// ── Provider health tracking ────────────────────────────────────────────────

export type ProviderStatus = "unknown" | "healthy" | "degraded" | "down";

export interface ProviderHealth {
  status:       ProviderStatus;
  lastChecked:  number;   // Date.now()
  failureCount: number;
  successCount: number;
}

// ── Provider interface ──────────────────────────────────────────────────────

export interface ImageProvider {
  readonly name: string;

  /** Current health state — updated by recordSuccess / recordFailure */
  readonly health: ProviderHealth;
  recordSuccess(): void;
  recordFailure(): void;

  /**
   * Build the primary image URL.
   * @param prompt  pre-built prompt string
   * @param seed    deterministic seed > 0
   */
  buildUrl(prompt: string, seed: number): string;

  /**
   * Build shorter fallback URL for first retry.
   * Should use a faster/lighter model and strip the scene description.
   */
  buildFallbackUrl(
    scene: Pick<CinematicScene, "id" | "location" | "shotType" | "mood" | "description">,
    seed: number,
  ): string;

  /**
   * Build the cinematic prompt for a scene.
   * V2 providers accept optional PromptBuildContext for story continuity.
   */
  buildPrompt(scene: CinematicScene, ctx?: PromptBuildContext): string;
}
