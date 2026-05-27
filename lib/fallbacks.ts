/**
 * Local fallback images for when Pollinations generation fails.
 * All files live in /public/fallbacks/ and are served statically.
 * Cards are NEVER empty — this is the last line of defence.
 */

const FALLBACK_MAP: Record<string, string> = {
  Tense:       "/fallbacks/tense.svg",
  Dramatic:    "/fallbacks/dramatic.svg",
  Mysterious:  "/fallbacks/mysterious.svg",
  Action:      "/fallbacks/action.svg",
  Romantic:    "/fallbacks/romantic.svg",
  Horror:      "/fallbacks/horror.svg",
  Melancholic: "/fallbacks/melancholic.svg",
  Triumphant:  "/fallbacks/triumphant.svg",
  Serene:      "/fallbacks/serene.svg",
  Comedic:     "/fallbacks/comedic.svg",
};

const DEFAULT_FALLBACK = "/fallbacks/default.svg";

/**
 * Returns the local fallback image path for a given mood.
 * Always returns a valid path — never undefined.
 */
export function getFallbackImage(mood: string): string {
  return FALLBACK_MAP[mood] ?? DEFAULT_FALLBACK;
}
