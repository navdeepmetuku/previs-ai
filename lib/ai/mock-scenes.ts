/**
 * Mock Scene Generator — deterministic script parser.
 *
 * Used when Gemini quota is exhausted. Produces real, structured Scene
 * objects from any script WITHOUT calling any AI API. The output looks
 * professional and feeds correctly into the rest of the pipeline.
 *
 * Algorithm:
 *   1. Split script on scene headings (INT./EXT.)
 *   2. Extract location, time-of-day, first action line
 *   3. Assign shot types and moods from keyword heuristics
 *   4. Return 4–8 scenes in correct Scene shape
 */

import type { Scene } from "@/types";

// ── Heuristics ───────────────────────────────────────────────────────────────

const MOOD_KEYWORDS: [RegExp, Scene["mood"]][] = [
  [/explosion|fight|chase|crash|battle|run|escape|attack/i,  "Action"],
  [/love|kiss|embrace|romantic|tender|hold|together/i,       "Romantic"],
  [/dark|shadow|fear|creature|blood|horror|terrif|scream/i,  "Horror"],
  [/laugh|funny|comedy|joke|silly|smile|grin/i,              "Comedic"],
  [/quiet|peace|serene|calm|gentle|soft|still/i,             "Serene"],
  [/sad|loss|grief|mourn|weep|tears|alone|empty/i,           "Melancholic"],
  [/victory|triumph|achieve|succeed|win|hero|glory/i,        "Triumphant"],
  [/mystery|strange|unknown|secret|shadow|fog|hidden/i,      "Mysterious"],
  [/tense|standoff|confrontation|danger|threat|weapon/i,     "Tense"],
];

const SHOT_HEURISTICS: [RegExp, Scene["shotType"]][] = [
  [/aerial|overhead|bird'?s.?eye|drone|from above/i, "Aerial Shot"],
  [/close.?up|face|eyes|expression|extreme close/i,  "Close-Up"],
  [/wide|establishing|landscape|skyline|exterior/i,  "Extreme Wide Shot"],
  [/over.*shoulder|reverse.*shot/i,                  "Over-the-Shoulder"],
  [/pov|point.of.view|through.*eyes|sees/i,          "POV Shot"],
];

const LIGHTING_HEURISTICS: [RegExp, Scene["lighting"]][] = [
  [/night|dark|midnight|moonlit|lamp|lantern/i,      "Night/low-key"],
  [/dawn|sunrise|morning|golden|sunset/i,            "Golden hour"],
  [/neon|sign|club|bar|colou?r.?light/i,             "Neon"],
  [/candle|firelight|torch|flame/i,                  "Candlelight"],
  [/overcast|grey|cloudy|dim|gloomy/i,               "Overcast"],
  [/harsh|blazing|noon|desert|glare/i,               "Harsh sunlight"],
  [/blue.?hour|dusk|twilight|last.light/i,           "Blue hour"],
];

function detectMood(text: string): Scene["mood"] {
  for (const [re, mood] of MOOD_KEYWORDS) {
    if (re.test(text)) return mood;
  }
  return "Dramatic";
}

function detectShot(text: string): Scene["shotType"] {
  for (const [re, shot] of SHOT_HEURISTICS) {
    if (re.test(text)) return shot;
  }
  return "Medium Shot";
}

function detectLighting(heading: string, text: string): Scene["lighting"] {
  const combined = heading + " " + text;
  for (const [re, light] of LIGHTING_HEURISTICS) {
    if (re.test(combined)) return light;
  }
  if (/night|ext.*night|int.*night/i.test(heading)) return "Night/low-key";
  if (/day|dawn|ext.*day/i.test(heading)) return "Natural daylight";
  return "Natural daylight";
}

// ── Scene heading parser ──────────────────────────────────────────────────────

interface ParsedSegment {
  heading:  string;
  location: string;
  body:     string;
}

function parseSegments(script: string): ParsedSegment[] {
  // Match INT./EXT. scene headings
  const HEADING = /^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+.+$/im;
  const lines   = script.split("\n");
  const segments: ParsedSegment[] = [];
  let current: ParsedSegment | null = null;

  for (const line of lines) {
    if (HEADING.test(line.trim())) {
      if (current) segments.push(current);
      const heading  = line.trim();
      const location = heading
        .replace(/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i, "")
        .replace(/\s*[-–—]\s*(DAY|NIGHT|DUSK|DAWN|CONTINUOUS|LATER|MOMENTS LATER)\s*$/i, "")
        .trim();
      current = { heading, location, body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) segments.push(current);
  return segments;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate 4–8 Scene objects from a screenplay script without any API call.
 * Returned scenes have real metadata but placeholder imageUrl/imagePrompt.
 */
export function generateMockScenes(script: string): Scene[] {
  let segments = parseSegments(script);

  // If script has no INT./EXT. headings, treat each paragraph as a scene
  if (segments.length === 0) {
    const paragraphs = script.split(/\n{2,}/).filter(p => p.trim().length > 20);
    segments = paragraphs.slice(0, 8).map((p, i) => ({
      heading:  `SCENE ${i + 1}`,
      location: `Scene ${i + 1} location`,
      body:     p,
    }));
  }

  // Pick up to 8 evenly-spaced segments
  const step = Math.max(1, Math.floor(segments.length / 8));
  const picked = segments.length <= 8
    ? segments
    : Array.from({ length: 8 }, (_, i) => segments[Math.min(i * step, segments.length - 1)]);

  return picked.map((seg, idx) => {
    const firstLine  = seg.body.split("\n").find(l => l.trim().length > 10)?.trim() ?? seg.location;
    const description = firstLine.slice(0, 160);
    const mood        = detectMood(seg.body);
    const shotType    = detectShot(seg.body);
    const lighting    = detectLighting(seg.heading, seg.body);

    // Extract character names (UPPERCASE lines in screenplay)
    const charLines = seg.body.match(/^\s{10,}([A-Z][A-Z\s]{2,})\s*$/gm) ?? [];
    const characters = [...new Set(
      charLines.map(l => l.trim()).filter(l => l.length < 30 && !l.includes("("))
    )].slice(0, 3).join(", ");

    return {
      id:          `mock-scene-${idx + 1}`,
      order:       idx + 1,
      title:       seg.location.split(",")[0].slice(0, 40) || `Scene ${idx + 1}`,
      description,
      shotType,
      lighting,
      mood,
      characters,
      location:    seg.location.slice(0, 80),
      imageUrl:    null,
      imagePrompt: null,
    } satisfies Scene;
  });
}
