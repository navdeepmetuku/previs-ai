/**
 * Character Memory System.
 *
 * Takes the raw character hints extracted by screenplay-parser and builds
 * a structured visual descriptor for each character.
 *
 * The descriptor is a short, injectable string that gets prepended to every
 * image prompt for scenes containing that character.
 *
 * Example descriptor:
 *   "Ram: young Indian male, mid-twenties, messy dark hair,
 *    grey hoodie, exhausted expression"
 *
 * Why descriptors instead of embeddings?
 *   FLUX.1 and other text-conditioned diffusion models respond well to
 *   inline text descriptors. IPAdapter/InstantID (for true identity
 *   consistency) requires a reference image — that's Phase 4.
 *   Text descriptors are the best we can do at Phase 2 without a GPU.
 *
 * Scalability:
 *   When IPAdapter is available, CharacterMemory.descriptor feeds into
 *   the conditioning pipeline. Zero interface changes needed.
 */

import type { CharacterHint } from "./screenplay-parser";
import type { Scene } from "@/types";

export interface CharacterVisual {
  /** Canonical name (as appears in script) */
  name:        string;
  /** Injected into image prompts for scenes featuring this character */
  descriptor:  string;
  /** Number of scenes they appear in — used to prioritise description depth */
  prominence:  number;
  /** Raw hint tokens from parser — stored for debugging */
  rawTokens:   string[];
}

// ── Appearance token → visual language ───────────────────────────────────────
// Maps parser tokens (lowercase) to FLUX-friendly descriptive phrases.

const AGE_MAP: Record<string, string> = {
  "20s": "in his twenties", "30s": "in his thirties", "40s": "in his forties",
  "50s": "in his fifties", "twenties": "in his twenties", "thirties": "in his thirties",
  "forties": "in his forties", "fifties": "in his fifties",
  "young": "young adult", "old": "older", "middle-aged": "middle-aged",
};

const BUILD_MAP: Record<string, string> = {
  "tall": "tall", "short": "short", "thin": "slender build",
  "heavy": "heavyset", "muscular": "muscular", "lean": "lean build",
  "weathered": "weathered features",
};

const EMOTIONAL_MAP: Record<string, string> = {
  "exhausted": "exhausted expression", "nervous": "nervous expression",
  "calm": "composed expression", "scared": "frightened expression",
  "angry": "tense expression",
};

const CLOTHING_MAP: Record<string, string> = {
  "hoodie": "wearing a hoodie", "jacket": "wearing a jacket",
  "coat": "wearing a coat", "jeans": "wearing jeans",
  "suit": "wearing a suit", "shirt": "wearing a shirt",
  "t-shirt": "wearing a t-shirt", "dressed": "formally dressed",
};

function buildDescriptor(hint: { name: string; rawTokens: string[]; sceneCount: number }): string {
  const tokens = hint.rawTokens;
  const parts: string[] = [];

  // Age
  for (const [k, v] of Object.entries(AGE_MAP)) {
    if (tokens.includes(k)) { parts.push(v); break; }
  }

  // Build / physique
  for (const [k, v] of Object.entries(BUILD_MAP)) {
    if (tokens.includes(k)) { parts.push(v); break; }
  }

  // Clothing
  for (const [k, v] of Object.entries(CLOTHING_MAP)) {
    if (tokens.includes(k)) { parts.push(v); break; }
  }

  // Emotional state
  for (const [k, v] of Object.entries(EMOTIONAL_MAP)) {
    if (tokens.includes(k)) { parts.push(v); break; }
  }

  // Hair / glasses
  if (tokens.includes("hair"))    parts.push("visible hair");
  if (tokens.includes("beard"))   parts.push("with beard");
  if (tokens.includes("glasses")) parts.push("wearing glasses");

  // If we extracted nothing meaningful, use the raw hint tokens directly
  if (parts.length === 0 && tokens.length > 0) {
    parts.push(tokens.slice(0, 4).join(", "));
  }

  const desc = parts.length > 0 ? parts.join(", ") : "person";
  return `${hint.name.charAt(0) + hint.name.slice(1).toLowerCase()}: ${desc}`;
}

/**
 * Build visual descriptors for all characters in the screenplay.
 * @param hints  Output of screenplay-parser for the character roster
 */
export function buildCharacterMemory(hints: CharacterHint[]): CharacterVisual[] {
  return hints.map(hint => {
    const descriptor = buildDescriptor({ name: hint.name, rawTokens: hint.rawHints, sceneCount: hint.sceneCount });

    console.log(`[CharacterMemory] ${hint.name} (${hint.sceneCount} scenes): "${descriptor}"`);

    return {
      name:        hint.name,
      descriptor,
      prominence:  hint.sceneCount,
      rawTokens:   hint.rawHints,
    };
  });
}

/**
 * Get descriptor strings for all characters present in a scene.
 * @param sceneCharacters  Scene.characters string (comma-separated names)
 * @param memory           Full character memory for the project
 */
export function getSceneCharacterDescriptors(
  sceneCharacters: string,
  memory: CharacterVisual[],
): string[] {
  if (!sceneCharacters.trim()) return [];

  const names = sceneCharacters
    .split(",")
    .map(n => n.trim().toUpperCase());

  return names
    .map(name => {
      // Exact match first, then partial match
      const exact   = memory.find(m => m.name === name);
      const partial = memory.find(m => m.name.includes(name) || name.includes(m.name));
      return (exact ?? partial)?.descriptor ?? null;
    })
    .filter((d): d is string => d !== null);
}

/**
 * Extract character names referenced in a scene from the full memory.
 * Used for UI badges.
 */
export function getSceneCharacters(
  scene: Pick<Scene, "characters">,
  memory: CharacterVisual[],
): CharacterVisual[] {
  if (!scene.characters?.trim()) return [];
  const names = scene.characters.split(",").map(n => n.trim().toUpperCase());
  return memory.filter(m => names.some(n => m.name.includes(n) || n.includes(m.name)));
}
