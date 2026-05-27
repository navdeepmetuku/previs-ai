/**
 * Cinematic Prompt Engine V2
 *
 * Generates high-quality, layered prompts that instruct image models to
 * produce frames resembling real cinematography — Blade Runner 2049,
 * The Batman, Dune, Sicario, Children of Men, Fincher-style.
 *
 * Prompt structure (7 layers):
 *   1. Medium anchor     — "cinematic film still"
 *   2. Subject           — trimmed scene description
 *   3. Environment       — location + environmental detail
 *   4. Camera framing    — shot type + implied lens
 *   5. Lighting rig      — lighting name mapped to film-DOP language
 *   6. Visual style      — mood-driven colour grade + film stock
 *   7. Realism anchor    — "photorealistic, ultra detailed, 8k"
 *
 * Negative prompts are separate — injected via ?enhance=true on
 * providers that support them (Flux Pro on Replicate, Stability, HF).
 * Pollinations ignores them; the negative string is attached to the
 * exported object for future use.
 */

import type { StoryVisualMemory } from "@/types";

// ── Camera framing — specific, photographic, model-readable ───────────────────
const SHOT_MAP: Record<string, { framing: string; lens: string }> = {
  "Extreme Wide Shot":  { framing: "extreme wide angle establishing shot, subject tiny in vast environment", lens: "14mm ultra-wide anamorphic lens" },
  "Wide Shot":          { framing: "wide shot, full body visible, environment dominant",                      lens: "24mm wide lens"                  },
  "Medium Shot":        { framing: "medium shot, waist-up framing, conversational depth",                    lens: "35mm standard prime"             },
  "Close-Up":           { framing: "tight close-up, face fills frame, compressed background",                lens: "85mm portrait lens, f1.4"        },
  "Extreme Close-Up":   { framing: "extreme close-up macro, single detail dominates frame",                  lens: "100mm macro lens"                },
  "Over-the-Shoulder":  { framing: "over-the-shoulder reverse shot, foreground blur",                        lens: "50mm lens"                       },
  "POV Shot":           { framing: "immersive first-person POV, handheld feel",                              lens: "28mm slightly distorted"         },
  "Dutch Angle":        { framing: "dutch tilt 25 degrees, unstable disorienting composition",               lens: "35mm lens tilted"                },
  "Aerial Shot":        { framing: "aerial overhead drone shot, bird's-eye view, scale revealed",            lens: "wide angle drone lens"           },
};

// ── Lighting → DOP-style rig description ─────────────────────────────────────
const LIGHTING_MAP: Record<string, string> = {
  "Natural daylight":  "soft natural daylight, overcast diffusion, balanced exposure, white balance 5600K",
  "Golden hour":       "golden hour magic light, warm 3200K backlight, lens flare, amber rim glow",
  "Blue hour":         "blue hour twilight, 6000K cool ambient, underexposed shadows, moody atmosphere",
  "Night/low-key":     "night scene, single motivated practical source, crushed blacks, deep noir shadows",
  "High-key":          "high-key studio fill, clean 5600K, minimal shadow, bright even exposure",
  "Neon":              "neon sign practicals, cyan and magenta chromatic glow, wet surface reflections",
  "Candlelight":       "intimate candlelight, warm 2400K tungsten flicker, low-key shadows, organic glow",
  "Overcast":          "overcast cloud diffusion, flat grey-white light, reduced contrast, cool palette",
  "Harsh sunlight":    "harsh noon sunlight, hard 90-degree shadows, bleached highlights, intense heat feel",
};

// ── Mood → colour grade + film stock ─────────────────────────────────────────
const MOOD_MAP: Record<string, { grade: string; stock: string }> = {
  Tense:       { grade: "teal-orange colour grade, crushed blacks, cold blue shadows, skin tones preserved", stock: "Kodak 5219 pushed +2 stops" },
  Dramatic:    { grade: "deep crushed blacks, volumetric shaft lighting, rich blue shadows, high contrast",   stock: "Kodak Vision3 5207"         },
  Romantic:    { grade: "warm lifted blacks, amber glow, soft halation, pastel skin",                        stock: "Kodak Portra 400 portrait"  },
  Action:      { grade: "punchy saturated, high contrast, slight motion smear, vivid primaries",             stock: "Fuji Velvia 50 pushed"      },
  Mysterious:  { grade: "heavy desaturation, moonlit blue-grey, atmospheric fog lift, dark silhouette",      stock: "Ilford HP5 pushed in D76"   },
  Melancholic: { grade: "flat cold blue-grey, desaturated, overcast palette, muted tones",                   stock: "Kodak 5219 underdeveloped"  },
  Triumphant:  { grade: "warm heroic gold, lifted shadows, low-contrast glow, optimistic palette",           stock: "Kodak 5207 daylight stock"  },
  Horror:      { grade: "near-monochrome, cold skin desaturation, absolute black crush, inhuman tones",      stock: "pushed tungsten stock"      },
  Comedic:     { grade: "bright vivid primaries, lifted shadows, cheerful warm exposure",                    stock: "Fuji Reala 100"             },
  Serene:      { grade: "soft pastel greens and blues, haze lift, gentle open shadows",                      stock: "Kodak Ektar 100"            },
};

// ── Film reference presets (injected when story memory has a known style) ───
const FILM_STYLE_MAP: Record<string, string> = {
  "Thriller":     "Roger Deakins cinematography, Sicario aesthetic, teal-orange grade",
  "Sci-Fi":       "Greig Fraser DOP, Dune visual language, epic scope",
  "Horror":       "Chung-hoon Chung DOP, The Batman low-key, neon wet streets",
  "Drama":        "Emmanuel Lubezki long takes, Children of Men visual style",
  "Action":       "Janusz Kaminski DOP, kinetic handheld, saturated daylight",
  "Romance":      "Linus Sandgren DOP, warm soft bokeh, La La Land colour",
  "Mystery":      "David Fincher flat light, Seven aesthetic, grey desaturated",
  "Documentary":  "Barry Ackroyd DOP, natural handheld, available light",
  "Fantasy":      "Ben Davis DOP, painterly light, epic wide compositions",
  "Comedy":       "clean bright exposure, Wes Anderson symmetry, vivid palette",
};

// ── Negative prompts — used by providers that support them ──────────────────
export const NEGATIVE_PROMPT =
  "cartoon, anime, illustration, drawing, painting, sketch, 3d render, blurry, " +
  "low quality, watermark, signature, text, words, letters, ugly, deformed, " +
  "bad anatomy, extra limbs, cloned face, disfigured, gross proportions";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PromptContext {
  scene: {
    description: string;
    shotType:    string;
    lighting:    string;
    mood:        string;
    location:    string;
  };
  memory?: StoryVisualMemory | null;
  /** Hard cap on decoded prompt chars. Default 180. */
  maxChars?: number;
}

export interface BuiltPrompt {
  prompt:   string;
  negative: string;
  tokens:   string[];  // individual layers for debugging
}

// ── Builder ──────────────────────────────────────────────────────────────────

function clean(s: string): string {
  // Strip slashes (URL path safety) and collapse multiple spaces
  return s.replace(/[/\\]/g, "-").replace(/\s{2,}/g, " ").trim();
}

/** Remove duplicate words/phrases that bloat the prompt and confuse the model */
function dedup(parts: string[]): string[] {
  const seen = new Set<string>();
  return parts.filter(part => {
    const key = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildPromptV2(ctx: PromptContext): BuiltPrompt {
  const { scene, memory, maxChars = 220 } = ctx;  // raised from 180

  const shotInfo    = SHOT_MAP[scene.shotType];
  const framing     = shotInfo?.framing ?? clean(scene.shotType);
  const lens        = shotInfo?.lens    ?? "35mm lens";
  const lighting    = LIGHTING_MAP[scene.lighting] ?? clean(scene.lighting);
  const moodInfo    = MOOD_MAP[scene.mood];
  const colorGrade  = moodInfo?.grade ?? scene.mood;
  const filmStock   = moodInfo?.stock ?? "35mm film";

  // Subject: up to 80 chars — enough for a vivid action description
  const descCap = Math.min(80, maxChars - 100);
  const subject = clean(scene.description.slice(0, descCap).trimEnd());

  const environment = clean(scene.location);

  const filmStyle    = memory?.filmStyle      ? clean(memory.filmStyle)      : (FILM_STYLE_MAP[memory?.genre ?? ""] ?? "");
  const continuity   = memory?.atmosphericBase ? clean(memory.atmosphericBase) : "";

  const rawParts = [
    // Anchor — tells the model what kind of image this is
    "cinematic film still",
    // Subject and action
    subject,
    // Environment
    environment,
    // Camera
    framing,
    lens,
    // Light
    lighting,
    // Grade + stock
    colorGrade,
    filmStock,
    // Cinematic reference
    filmStyle,
    // Project continuity
    continuity,
    // Realism anchors
    "photorealistic, sharp focus, professional cinematography, high production value",
  ].filter(Boolean);

  const tokens = dedup(rawParts);
  let prompt   = tokens.join(", ");

  while (prompt.length > maxChars && tokens.length > 4) {
    tokens.pop();
    prompt = tokens.join(", ");
  }

  return { prompt, negative: NEGATIVE_PROMPT, tokens };
}

/** Short fallback prompt — used when the primary URL fails.
 *  Includes description so the retry shows something scene-specific. */
export function buildFallbackPromptV2(scene: {
  location:    string;
  shotType:    string;
  mood:        string;
  description?: string;
}): string {
  const framing    = SHOT_MAP[scene.shotType]?.framing ?? "cinematic shot";
  const colorGrade = MOOD_MAP[scene.mood]?.grade       ?? scene.mood;
  // Keep first 55 chars of description so the scene is still recognisable
  const desc = scene.description
    ? clean(scene.description.slice(0, 55).trimEnd()) + ", "
    : "";
  return clean(`cinematic still, ${desc}${scene.location}, ${framing}, ${colorGrade}, photorealistic, ultra detailed`);
}
