/**
 * Cinematic Prompt Engine — the intelligence layer between screenplay and pixels.
 *
 * Every generated frame flows through this file. The goal: make each prompt
 * feel like a cinematographer's brief, not a random AI description.
 *
 * Layer order (FLUX.1 token-weight priority — most important first):
 *   0. Quality anchor          — establishes the output type immediately
 *   1. Character continuity    — who is in the frame, how they look
 *   2. Scene action / subject  — what is visually happening
 *   3. Environment continuity  — where, with what atmosphere
 *   4. Camera language         — shot type, focal length, depth of field
 *   5. Movement feel           — static / handheld / dolly / drone
 *   6. Lighting rig            — DOP-style practical description
 *   7. Colour grade + stock    — the grade that defines the film's palette
 *   8. Atmosphere              — weather, particles, spatial density
 *   9. Cinematographer style   — named reference that primes the aesthetic
 *  10. Shot relationship note  — subtle continuity signal from adjacent shot
 *  11. Realism anchors         — photographic grounding words
 *  12. Anti-tokens             — de-emphasise AI-art look
 */

import type { Scene, Project, StoryVisualMemory } from "@/types";
import type { ProjectVisualContext } from "./continuity/visual-context";
import { buildSceneContinuityPrompt } from "./continuity/visual-context";

// ── Shot type → camera + optics language ─────────────────────────────────────

const SHOT_MAP: Record<string, string> = {
  "Extreme Wide Shot":  "extreme wide establishing shot, tiny figure dwarfed by vast environment, 14mm ultra-wide anamorphic",
  "Wide Shot":          "wide shot, full figure visible in environment, 24mm lens, environment dominant",
  "Medium Shot":        "medium shot waist-up, subject readable in context, 35mm standard lens",
  "Close-Up":           "tight close-up on face, eyes sharp, 85mm f1.4 shallow depth of field, background dissolved",
  "Extreme Close-Up":   "extreme macro close-up, only a single detail fills the frame, 100mm f2.8",
  "Over-the-Shoulder":  "over-the-shoulder reverse shot, foreground shoulder soft, 50mm, spatial depth",
  "POV Shot":           "immersive first-person POV, handheld feel, 28mm slight wide distortion",
  "Dutch Angle":        "dutch tilt 20 degrees, psychological unease, 35mm, slightly disorienting",
  "Aerial Shot":        "aerial overhead establishing view, bird's-eye perspective, wide drone lens",
};

// ── Camera movement feel ───────────────────────────────────────────────────────

const MOVEMENT_MAP: Record<string, string> = {
  "static":   "locked off tripod, perfectly still frame, deliberate composition",
  "dolly":    "subtle dolly push-in, slow camera movement toward subject",
  "handheld": "handheld camera, slight organic movement, immediate and present feel",
  "crane":    "crane movement, elevated perspective slowly descending",
  "drone":    "smooth aerial drone movement, vast spatial coverage",
};

// ── Focal length enrichment ───────────────────────────────────────────────────

function focalLengthNote(mm: number | null | undefined): string {
  if (!mm) return "";
  if (mm <= 16)  return `${mm}mm ultra-wide, extreme spatial distortion`;
  if (mm <= 24)  return `${mm}mm wide angle, environmental context dominant`;
  if (mm <= 35)  return `${mm}mm standard, naturalistic human perspective`;
  if (mm <= 50)  return `${mm}mm normal lens, honest unembellished truth`;
  if (mm <= 85)  return `${mm}mm short telephoto, flattering portrait compression`;
  if (mm <= 135) return `${mm}mm telephoto, background compressed, subject isolated`;
  return           `${mm}mm long telephoto, extreme background compression, subject extracted from environment`;
}

// ── Lens type enrichment ───────────────────────────────────────────────────────

const LENS_TYPE_MAP: Record<string, string> = {
  "anamorphic": "anamorphic lens, oval bokeh, lens flare streaks, widescreen cinematic feel",
  "spherical":  "spherical lens, clean precise rendition, no barrel distortion",
  "macro":      "macro lens, extreme magnification, shallow plane of focus",
};

// ── Lighting → DOP language ───────────────────────────────────────────────────

const LIGHTING_MAP: Record<string, string> = {
  "Natural daylight":  "soft natural daylight, diffused overcast sky, 5600K balanced exposure, gentle fill from sky",
  "Golden hour":       "golden hour warm backlight, sun near horizon, 3200K amber rim light, long shadows, lens flare",
  "Blue hour":         "blue hour twilight, 6000K cool ambient, underexposed moody shadows, last light on horizon",
  "Night/low-key":     "deep night scene, single motivated practical lamp, crushed blacks, deep noir shadows, high contrast ratio",
  "High-key":          "high-key bright fill lighting, 5600K, clean minimal shadow, professional studio look",
  "Neon":              "neon sign practicals, cyan and magenta chromatic glow, wet reflections on pavement, urban electric atmosphere",
  "Candlelight":       "tungsten candlelight 2400K, warm intimate flicker, one-sided soft shadow, hand-held flame feel",
  "Overcast":          "flat overcast diffusion, grey-white sky light, soft low-contrast, even exposure, no hard shadows",
  "Harsh sunlight":    "harsh noon direct sun, bleached highlights, hard black shadows, unforgiving exposure",
};

// ── Mood → colour grade + film stock ─────────────────────────────────────────

const MOOD_MAP: Record<string, string> = {
  Tense:       "teal-orange colour grade, crushed blacks, cold blue shadows, Kodak 5219 pushed two stops, high contrast",
  Dramatic:    "rich volumetric contrast, deep shadow fill, warm skin against cool environment, Kodak Vision3 500T",
  Romantic:    "warm lifted shadows, amber halation, soft diffusion on highlights, Kodak Portra 400 scan",
  Action:      "punchy saturated primaries, vivid contrast, high sharpness, Fuji Velvia pushed, kinetic visual energy",
  Mysterious:  "heavy desaturation, moonlit blue-grey palette, atmospheric ground fog, Ilford HP5 pushed, low key",
  Melancholic: "flat cold blue-grey, desaturated muted tones, lifted shadows, Kodak Vision 3 underdeveloped",
  Triumphant:  "warm heroic golden light, optimistic lifted palette, strong directional key, Kodak 5207 fine grain",
  Horror:      "near-monochrome cold palette, desaturated skin tones, absolute black shadows, pushed tungsten, disturbing stillness",
  Comedic:     "bright vivid primaries, cheerful warm exposure, lifted shadows, Fuji Reala 100, clean and welcoming",
  Serene:      "soft pastel greens and blues, haze lift, gentle shadows, Kodak Ektar 100, peaceful naturalistic grade",
};

// ── Atmosphere enrichment ─────────────────────────────────────────────────────

const ATMOSPHERE_ENHANCERS: Record<string, string> = {
  rain:     "rain-soaked surfaces, wet reflections, rain streaks in light beams",
  fog:      "volumetric fog, mist layers, atmospheric haze reducing contrast in distance",
  mist:     "morning mist, soft diffusion in background, dreamlike spatial depth",
  snow:     "snow falling, winter atmosphere, cold blue ambient, breath visible",
  storming: "storm light, dramatic skies, charged atmosphere",
  dark:     "deep shadow pools, motivated darkness, high contrast chiaroscuro",
  smoky:    "smoke haze, industrial atmosphere, diffused light shafts",
  dusty:    "dust particles in light, dry atmosphere, sandy or arid environment",
};

// ── DOP references by genre ───────────────────────────────────────────────────

const GENRE_DOP: Record<string, { dop: string; films: string; look: string }> = {
  "Thriller":    { dop: "Roger Deakins", films: "Sicario, No Country for Old Men", look: "controlled precision, motivated shadows, restrained palette" },
  "Sci-Fi":      { dop: "Greig Fraser",  films: "Dune, Rogue One",               look: "epic scale, desaturated highlights, awe-inspiring compositions" },
  "Horror":      { dop: "Pawel Pogorzelski", films: "Hereditary, Midsommar",     look: "unflinching stillness, slow revelations, cold dread" },
  "Drama":       { dop: "Emmanuel Lubezki", films: "Children of Men, The Tree of Life", look: "long naturalistic takes, available light philosophy" },
  "Action":      { dop: "Janusz Kaminski", films: "Saving Private Ryan, Schindler's List", look: "kinetic desaturated intensity, handheld truth" },
  "Romance":     { dop: "Linus Sandgren", films: "La La Land, Marriage Story", look: "warm intimate bokeh, natural window light" },
  "Mystery":     { dop: "Jeff Cronenweth", films: "Zodiac, Fight Club, Gone Girl", look: "Fincher precision, cold digital clarity, exact compositions" },
  "Documentary": { dop: "Barry Ackroyd", films: "The Hurt Locker, United 93",  look: "available light truth, handheld immediacy" },
  "Fantasy":     { dop: "Ben Davis", films: "Doctor Strange, Guardians of the Galaxy", look: "vivid painterly compositions, epic scope" },
  "Comedy":      { dop: "Robert Yeoman", films: "The Grand Budapest Hotel, Rushmore", look: "symmetrical Wes Anderson precision, warm even exposure" },
};

function sanitize(s: string): string {
  return s.replace(/[/\\]/g, " ").replace(/\s{2,}/g, " ").trim();
}

// ── Quality enhancement pass ──────────────────────────────────────────────────
// Detect weak descriptions and enrich them before sending to the model.

function enhanceDescription(desc: string, mood: string, location: string): string {
  const clean = sanitize(desc);

  // If description is very short or vague, augment with location and mood context
  if (clean.length < 40) {
    const moodAtmos = {
      Tense: "tense atmosphere, air of danger",
      Dramatic: "dramatic tension, charged moment",
      Mysterious: "mysterious shadowy scene",
      Melancholic: "quiet melancholy, emotional weight",
      Serene: "peaceful still moment",
      Action: "high energy moment, dynamic action",
      Horror: "terrifying presence, dread-filled atmosphere",
      Triumphant: "victorious powerful moment",
      Romantic: "intimate tender connection",
      Comedic: "light-hearted lively moment",
    }[mood] ?? "cinematic scene";
    return `${sanitize(location.slice(0, 50))}, ${moodAtmos}`;
  }

  return clean.slice(0, 120); // generous cap — was 90
}

// ── Cinematic quality enhancer ────────────────────────────────────────────────
// Ensures every prompt has sufficient visual specificity.

function qualityEnhance(layers: string[]): string[] {
  const combined = layers.join(" ").toLowerCase();

  // Ensure spatial depth language if not already present
  if (!combined.includes("depth") && !combined.includes("foreground") && !combined.includes("background")) {
    layers.push("strong spatial depth, foreground to background layering");
  }

  // Ensure composition language
  if (!combined.includes("composition") && !combined.includes("framed") && !combined.includes("rule of")) {
    layers.push("deliberate cinematographic composition");
  }

  return layers;
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface ScenePromptInput {
  description:  string;
  location:     string;
  shotType:     string;
  lighting:     string;
  mood:         string;
  characters?:  string;
  title?:       string;
  /** Adjacent shot context for continuity signal */
  prevMood?:    string;
  prevShotType?: string;
}

export interface ContinuityContext {
  characterContext:   string;
  environmentContext: string;
}

// ── Main prompt builder ───────────────────────────────────────────────────────

export function buildCinematicPrompt(
  scene:         ScenePromptInput & { cinematicMeta?: { focalLengthMm?: number | null; lensType?: string | null; cameraMovement?: string | null }; lighting: string },
  storyMemory?:  StoryVisualMemory | null,
  continuity?:   ContinuityContext | null,
): string {
  const genre       = storyMemory?.genre ?? "";
  const dopRef      = GENRE_DOP[genre];
  const dopStyle    = dopRef
    ? `${dopRef.dop} DOP style, ${dopRef.films} visual reference, ${dopRef.look}`
    : storyMemory?.filmStyle
    ? sanitize(storyMemory.filmStyle.split(",")[0].trim())
    : "professional cinematic photography";

  const shot        = SHOT_MAP[scene.shotType] ?? `${scene.shotType}, 35mm lens`;
  const light       = LIGHTING_MAP[scene.lighting] ?? sanitize(scene.lighting);
  const grade       = MOOD_MAP[scene.mood] ?? scene.mood;
  const desc        = enhanceDescription(scene.description, scene.mood, scene.location);
  const loc         = sanitize(scene.location.slice(0, 70));

  // ── Cinematic meta: focal length, lens type, movement ────────────────────
  const focalNote   = focalLengthNote(scene.cinematicMeta?.focalLengthMm);
  const lensNote    = scene.cinematicMeta?.lensType
    ? LENS_TYPE_MAP[scene.cinematicMeta.lensType] ?? ""
    : "";
  const movNote     = scene.cinematicMeta?.cameraMovement
    ? MOVEMENT_MAP[scene.cinematicMeta.cameraMovement] ?? ""
    : "";

  // ── Atmosphere enrichment ────────────────────────────────────────────────
  const atmosBase   = storyMemory?.atmosphericBase ?? "";
  const atmosWords  = atmosBase.toLowerCase().split(/\s+/);
  const atmosEnhanced = atmosWords
    .map(w => ATMOSPHERE_ENHANCERS[w] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  // ── Shot relationship note (subtle continuity) ────────────────────────────
  let prevShotNote = "";
  if (scene.prevShotType && scene.prevShotType !== scene.shotType) {
    // Wide → Medium = "moving in from establishing view"
    // Medium → Close = "pushing closer into emotional territory"
    const shotProgression: Record<string, Record<string, string>> = {
      "Wide Shot":         { "Medium Shot": "pushing in from wider view, spatial context established" },
      "Extreme Wide Shot": { "Wide Shot": "tightening from epic establish", "Medium Shot": "cutting in to human scale" },
      "Medium Shot":       { "Close-Up": "pushing into emotional close-up", "Over-the-Shoulder": "cutting to reverse perspective" },
    };
    prevShotNote = shotProgression[scene.prevShotType]?.[scene.shotType] ?? "";
  }

  // ── Build ordered layers ──────────────────────────────────────────────────
  let layers: string[] = [
    // 0. Quality anchor
    "cinematic film still, professional motion picture photography",
    // 1. Character continuity
    continuity?.characterContext ?? "",
    // 2. Scene action
    desc,
    // 3. Location + environment continuity
    continuity?.environmentContext ? `${loc}, ${continuity.environmentContext}` : loc,
    // 4. Camera language
    shot,
    focalNote,
    lensNote,
    // 5. Movement
    movNote,
    // 6. Lighting
    light,
    // 7. Colour grade
    grade,
    // 8. Atmosphere
    atmosBase ? sanitize(atmosBase) : "",
    atmosEnhanced,
    // 9. DOP / style reference
    dopStyle,
    // 10. Shot relationship
    prevShotNote,
    // 11. Realism anchors
    "photorealistic, sharp focus, high production value, film grain, 35mm film texture",
  ].filter(Boolean);

  // Quality enhancement pass
  layers = qualityEnhance(layers);

  // Deduplicate and join
  const seen  = new Set<string>();
  const final = layers.filter(l => {
    const k = l.toLowerCase().trim().slice(0, 40);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const prompt = final.join(", ");
  console.log(`[PromptEngine] ${prompt.length}ch | ${scene.shotType} | ${scene.mood} | continuity=${Boolean(continuity?.characterContext)}`);
  return prompt;
}

// ── Full project-aware prompt (primary entrypoint) ────────────────────────────

export function buildFullPrompt(
  scene:    Scene,
  project:  Pick<Project, "genre" | "storyMemory" | "visualContext">,
  context?: {
    allScenes?:  Scene[];  // for shot relationship awareness
    sceneIndex?: number;
  },
): string {
  const continuity = project.visualContext
    ? buildSceneContinuityPrompt(scene, project.visualContext as ProjectVisualContext)
    : null;

  // Shot relationship context from adjacent scene
  const prevScene  = context?.allScenes && context.sceneIndex != null && context.sceneIndex > 0
    ? context.allScenes[context.sceneIndex - 1]
    : null;

  return buildCinematicPrompt(
    {
      description:   scene.description,
      location:      scene.location,
      shotType:      scene.shotType,
      lighting:      scene.lighting,
      mood:          scene.mood,
      characters:    scene.characters,
      title:         scene.title,
      cinematicMeta: scene.cinematicMeta,
      prevMood:      prevScene?.mood,
      prevShotType:  prevScene?.shotType,
    },
    project.storyMemory ?? null,
    continuity
      ? { characterContext: continuity.characterContext, environmentContext: continuity.environmentContext }
      : null,
  );
}

// ── Deterministic seed ────────────────────────────────────────────────────────

export function sceneToSeed(sceneId: string): number {
  let h = 0;
  for (let i = 0; i < sceneId.length; i++) {
    h = (Math.imul(31, h) + sceneId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_147_483_647 || 1;
}

// ── Negative prompt ───────────────────────────────────────────────────────────

export const NEGATIVE_PROMPT =
  "cartoon, anime, illustration, drawing, painting, sketch, 3d render, cgi, " +
  "blurry, low quality, watermark, signature, text, words, letters, logo, " +
  "deformed, ugly, bad anatomy, extra limbs, cloned face, disfigured, " +
  "stickman, silhouette only, abstract art, concept art, flat lighting, " +
  "oversaturated, plastic skin, toy figure, video game screenshot";
