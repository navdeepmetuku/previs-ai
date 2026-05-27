/**
 * Scene extraction via Gemini.
 *
 * Uses provider-manager for retry + quota detection.
 * Throws AiError so API routes can distinguish quota from other failures.
 */

import type { Scene } from "@/types";
import { createModel, withRetry, AiError } from "@/lib/ai/provider-manager";

export { AiError };

export async function extractScenes(script: string): Promise<Scene[]> {
  const model = await createModel();

  const prompt = `You are a professional film director and storyboard artist.

Analyze the following script and extract 4 to 8 key scenes for a storyboard.

For each scene, return a JSON array with objects matching EXACTLY this structure:
{
  "id": "<unique string, e.g. scene-1>",
  "order": <integer starting at 1>,
  "title": "<short scene title, max 6 words>",
  "description": "<vivid visual description of the scene action, 1-2 sentences>",
  "shotType": "<one of: Extreme Wide Shot, Wide Shot, Medium Shot, Close-Up, Extreme Close-Up, Over-the-Shoulder, POV Shot, Dutch Angle, Aerial Shot>",
  "lighting": "<one of: Natural daylight, Golden hour, Blue hour, Night/low-key, High-key, Neon, Candlelight, Overcast, Harsh sunlight>",
  "mood": "<one of: Tense, Dramatic, Romantic, Action, Mysterious, Melancholic, Triumphant, Horror, Comedic, Serene>",
  "characters": "<comma-separated character names in the scene>",
  "location": "<specific location description>",
  "imageUrl": null,
  "imagePrompt": null
}

Return ONLY the raw JSON array. No markdown, no backticks, no explanation.

SCRIPT:
${script}`;

  const result = await withRetry(() => model.generateContent(prompt));
  const text   = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  const scenes = JSON.parse(cleaned) as Scene[];
  return scenes.slice(0, 8);
}
