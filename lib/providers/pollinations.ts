/**
 * Pollinations.ai provider — completely free, no API key needed.
 * https://image.pollinations.ai/
 *
 * Model strategy:
 *   Primary request  → model=flux   (highest quality)
 *   First retry      → model=turbo  (faster, more available under load)
 *
 * URL encoding rule:
 *   Prompt is in URL *path* — Cloudflare decodes %2F → "/" which splits routes.
 *   Always strip slashes from the prompt before encoding.
 */

import type { ImageProvider, CinematicScene, PromptBuildContext, ProviderHealth } from "./types";
import { buildPromptV2, buildFallbackPromptV2 } from "@/lib/prompt-engine";

function stripSlashes(s: string): string {
  return s.replace(/[/\\]/g, "-");
}

class PollinationsProvider implements ImageProvider {
  readonly name = "Pollinations";

  readonly health: ProviderHealth = {
    status:       "unknown",
    lastChecked:  0,
    failureCount: 0,
    successCount: 0,
  };

  constructor(
    private readonly primaryModel:  string = "flux",
    private readonly fallbackModel: string = "turbo",
    private readonly width:  number = 512,
    private readonly height: number = 288,
  ) {}

  recordSuccess(): void {
    this.health.successCount++;
    this.health.failureCount = Math.max(0, this.health.failureCount - 1);
    this.health.status      = "healthy";
    this.health.lastChecked = Date.now();
  }

  recordFailure(): void {
    this.health.failureCount++;
    this.health.lastChecked = Date.now();
    if (this.health.failureCount >= 3) {
      this.health.status = "down";
    } else if (this.health.failureCount >= 1) {
      this.health.status = "degraded";
    }
  }

  buildUrl(prompt: string, seed: number): string {
    const enc = encodeURIComponent(stripSlashes(prompt));
    return (
      `https://image.pollinations.ai/prompt/${enc}` +
      `?width=${this.width}&height=${this.height}&seed=${seed}&model=${this.primaryModel}&nologo=true`
    );
  }

  buildFallbackUrl(
    scene: Pick<CinematicScene, "id" | "location" | "shotType" | "mood" | "description">,
    seed:  number,
  ): string {
    const prompt = buildFallbackPromptV2({
      location:    scene.location,
      shotType:    scene.shotType,
      mood:        scene.mood,
      description: scene.description,
    });
    const enc = encodeURIComponent(stripSlashes(prompt));
    return (
      `https://image.pollinations.ai/prompt/${enc}` +
      `?width=${this.width}&height=${this.height}&seed=${seed}&model=${this.fallbackModel}&nologo=true`
    );
  }

  buildPrompt(scene: CinematicScene, ctx?: PromptBuildContext): string {
    const { prompt } = buildPromptV2({
      scene,
      memory:   ctx?.storyMemory ?? null,
      maxChars: 200,
    });
    return prompt;
  }
}

export const pollinationsProvider = new PollinationsProvider("sana", "turbo", 512, 288);
export { PollinationsProvider };
