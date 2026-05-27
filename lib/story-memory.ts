/**
 * Story Visual Memory — lightweight continuity engine.
 *
 * Analyses all extracted scenes once and produces a StoryVisualMemory
 * object that is injected into every scene's image prompt.
 *
 * This gives Flux/Pollinations consistent visual cues across shots:
 *   - same colour grade
 *   - same film reference
 *   - same atmospheric base
 *
 * Kept entirely in local state — no vector DB, no API calls.
 * Stored on the Project object so it survives localStorage round-trips.
 */

import type { Scene, StoryVisualMemory } from "@/types";

// Genre → cinematic film reference
const FILM_REFERENCES: Record<string, string> = {
  "Thriller":     "Roger Deakins DOP, Sicario, No Country for Old Men",
  "Sci-Fi":       "Greig Fraser DOP, Dune, Arrival visual language",
  "Horror":       "Chung-hoon Chung DOP, The Batman, It atmospheric",
  "Drama":        "Emmanuel Lubezki, Children of Men long-take style",
  "Action":       "Janusz Kaminski DOP, kinetic Spielberg compositions",
  "Romance":      "Linus Sandgren DOP, warm bokeh, Mulligan soft light",
  "Mystery":      "Jeff Cronenweth DOP, David Fincher Seven aesthetic",
  "Documentary":  "Barry Ackroyd DOP, Paul Greengrass available light",
  "Fantasy":      "Ben Davis DOP, painterly wide, Marvel-epic scope",
  "Comedy":       "Vittorio Storaro flat warm Wes Anderson symmetry",
};

// Mood → dominant colour grade description
const GRADE_MAP: Record<string, string> = {
  Tense:       "teal-orange grade, crushed blacks, cold highlights",
  Dramatic:    "rich blue shadows, warm skin, high contrast",
  Romantic:    "lifted warm amber, soft pastels, hazy diffusion",
  Action:      "saturated primaries, high contrast, punchy",
  Mysterious:  "cool desaturated, moonlit blue, heavy atmosphere",
  Melancholic: "grey-blue cool, flat exposure, muted tones",
  Triumphant:  "golden warm cinematic, heroic contrast",
  Horror:      "near-monochrome, cold whites, absolute black",
  Comedic:     "bright vivid, cheerful warm, Eastman stock",
  Serene:      "pastel soft, gentle mist, lifted shadows",
};

// Dominant mood across a list of scenes
function dominantMood(scenes: Scene[]): string {
  const counts: Record<string, number> = {};
  for (const s of scenes) counts[s.mood] = (counts[s.mood] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Dramatic";
}

// Most common location substring (catches repeated words like "warehouse")
function atmosphericBase(scenes: Scene[]): string {
  const allLocations = scenes.map(s => s.location.toLowerCase());

  // Find the most common single word in locations (≥ 3 chars, skips prepositions)
  const SKIP = new Set(["the", "an", "a", "at", "in", "on", "of", "and", "or"]);
  const freq: Record<string, number> = {};
  for (const loc of allLocations) {
    for (const word of loc.split(/\W+/)) {
      if (word.length >= 3 && !SKIP.has(word)) {
        freq[word] = (freq[word] ?? 0) + 1;
      }
    }
  }

  const topWord = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const lighting = scenes[0]?.lighting.replace(/[/\\]/g, "-") ?? "night";
  const weather  = allLocations.some(l => l.includes("rain") || l.includes("wet"))
    ? "rain-soaked"
    : allLocations.some(l => l.includes("fog") || l.includes("mist"))
    ? "foggy"
    : "";

  return [weather, topWord, lighting].filter(Boolean).join(" ").trim();
}

/**
 * Build the story's visual memory from its scene list.
 * Call once after Gemini extraction; store on Project.storyMemory.
 */
export function buildStoryMemory(scenes: Scene[], genre: string): StoryVisualMemory {
  const mood      = dominantMood(scenes);
  const filmStyle = FILM_REFERENCES[genre] ?? "cinematic, professional photography";
  const grade     = GRADE_MAP[mood]        ?? "cinematic colour grade";
  const base      = atmosphericBase(scenes);

  const memory: StoryVisualMemory = {
    genre,
    filmStyle,
    colorGrade:      grade,
    atmosphericBase: base,
  };

  console.log(`[StoryMemory] genre=${genre} mood=${mood} style="${filmStyle.slice(0, 60)}" base="${base}"`);
  return memory;
}
