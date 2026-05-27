/**
 * Active image provider — change this one export to switch backends.
 *
 * Future providers to add here:
 *   HuggingFace  → import { hfProvider } from "./huggingface"
 *   Stability AI → import { stabilityProvider } from "./stability"
 *   Replicate    → import { replicateProvider } from "./replicate"
 *   OpenRouter   → import { openrouterProvider } from "./openrouter"
 */

export { pollinationsProvider as activeProvider } from "./pollinations";
export type { ImageProvider, CinematicScene } from "./types";
