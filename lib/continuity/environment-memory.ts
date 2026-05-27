/**
 * Environment Memory System.
 *
 * Builds persistent visual descriptors for each location in the screenplay.
 * When a scene is set in "Ram's bedroom," this descriptor is injected into
 * the image prompt so the room looks consistent across multiple shots.
 *
 * Example descriptor:
 *   "cluttered apartment bedroom, practical desk lamp, dark walls,
 *    laptop on desk, papers on floor, night, cramped urban space"
 *
 * Architecture:
 *   - Pure computation, no API calls
 *   - Descriptors stored on the ContinuityContext (per-project)
 *   - Matched to scene.location via fuzzy string comparison
 *   - IPAdapter room conditioning can replace this in Phase 4
 */

import type { EnvironmentHint } from "./screenplay-parser";

export interface EnvironmentVisual {
  /** Normalised location key (lowercase) */
  key:         string;
  /** Original location string from heading */
  location:    string;
  /** Injected into image prompts for scenes set in this location */
  descriptor:  string;
  /** Time-of-day indicator */
  timeOfDay:   EnvironmentHint["timeOfDay"];
  /** Dominant atmosphere words */
  atmosphere:  string[];
}

// ── Location keywords → visual language ───────────────────────────────────────

const ROOM_DESCRIPTORS: Record<string, string> = {
  bedroom:     "bedroom interior, personal belongings, bed visible",
  living:      "living room interior, sofa, ambient lighting",
  kitchen:     "kitchen interior, countertops, appliances visible",
  office:      "office space, desk, computer, fluorescent overhead lighting",
  bathroom:    "bathroom interior, tiles, mirror",
  corridor:    "narrow corridor, hallway, confined space",
  lobby:       "building lobby, open space, public area",
  rooftop:     "rooftop exterior, city skyline visible, open sky",
  warehouse:   "industrial warehouse, high ceilings, concrete floors",
  alley:       "urban alleyway, narrow street, brick walls",
  street:      "city street exterior, urban environment, pavement",
  apartment:   "apartment interior, modest urban living space",
  cafe:        "café interior, tables and chairs, warm ambient light",
  restaurant:  "restaurant interior, tables, ambient dining light",
  park:        "outdoor park, trees, natural environment",
  forest:      "forest exterior, trees, natural ground",
  car:         "vehicle interior, dashboard, seats, windshield",
  hospital:    "hospital interior, clinical white walls, fluorescent light",
  school:      "school interior, desks, educational environment",
  station:     "train or bus station, public transit environment",
  airport:     "airport terminal, public space, high ceilings",
};

const TIME_OF_DAY_DESCRIPTORS: Record<string, string> = {
  NIGHT:      "nighttime, dark exterior, artificial lighting",
  DAY:        "daytime, natural light",
  DUSK:       "dusk, golden-orange sky, fading light",
  DAWN:       "dawn, pale early morning light",
  CONTINUOUS: "",
  UNKNOWN:    "",
};

function matchRoomType(location: string): string {
  const lower = location.toLowerCase();
  for (const [key, desc] of Object.entries(ROOM_DESCRIPTORS)) {
    if (lower.includes(key)) return desc;
  }
  // Fall back to using the raw location string as the descriptor
  return location;
}

function extractAtmosphere(hints: string[]): string[] {
  const atmos: string[] = [];
  const combined = hints.join(" ").toLowerCase();
  const SIGNALS = ["rain", "fog", "mist", "dark", "dusty", "smoke", "neon", "crowded", "empty", "quiet", "loud"];
  for (const s of SIGNALS) {
    if (combined.includes(s)) atmos.push(s);
  }
  return atmos;
}

/**
 * Build environment visual memory from parser output.
 */
export function buildEnvironmentMemory(hints: EnvironmentHint[]): EnvironmentVisual[] {
  return hints.map(hint => {
    const roomDesc  = matchRoomType(hint.location);
    const timeDesc  = TIME_OF_DAY_DESCRIPTORS[hint.timeOfDay] ?? "";
    const atmos     = extractAtmosphere(hint.rawHints);

    // Build a coherent descriptor: room type + time + atmosphere signals from action lines
    const parts = [roomDesc, timeDesc, ...atmos.slice(0, 2)].filter(Boolean);
    const descriptor = parts.join(", ");

    console.log(`[EnvironmentMemory] "${hint.location}" → "${descriptor}"`);

    return {
      key:        hint.location.toLowerCase(),
      location:   hint.location,
      descriptor,
      timeOfDay:  hint.timeOfDay,
      atmosphere: atmos,
    };
  });
}

/**
 * Find the best-matching environment descriptor for a scene's location.
 * Uses substring matching — "Ram's bedroom" matches "bedroom" descriptor.
 */
export function getEnvironmentDescriptor(
  sceneLocation: string,
  memory:        EnvironmentVisual[],
): string | null {
  if (!sceneLocation.trim()) return null;

  const lower = sceneLocation.toLowerCase();

  // Exact match
  const exact = memory.find(e => e.key === lower);
  if (exact) return exact.descriptor;

  // Substring match — scene location contains environment key or vice versa
  const partial = memory.find(e =>
    lower.includes(e.key) || e.key.includes(lower) ||
    e.location.toLowerCase().split(/\s+/).some(word => lower.includes(word) && word.length > 3)
  );
  return partial?.descriptor ?? null;
}
