/**
 * Screenplay Parser — structured understanding of screenplay text.
 *
 * Extracts the elements that determine visual continuity:
 *   - Character roster with appearance hints from the script
 *   - Environment inventory (locations with their physical qualities)
 *   - Props inventory (objects that should persist across scenes)
 *   - Time-of-day map per scene heading
 *   - Weather/atmosphere signals
 *
 * This is pure computation — no API calls, no async.
 * Called once per project on the raw screenplay text.
 *
 * Scalability note:
 *   When Qwen2.5-VL or a local Ollama model becomes available, this parser
 *   can be swapped out for a multimodal version. The output interface
 *   (ParsedScreenplay) stays identical — nothing else changes.
 */

export interface CharacterHint {
  /** Canonical name as it appears in the script (all-caps) */
  name:        string;
  /** Raw appearance lines found near this character's first introduction */
  rawHints:    string[];
  /** Number of scenes this character appears in */
  sceneCount:  number;
}

export interface EnvironmentHint {
  /** Location string (from INT./EXT. heading) */
  location:    string;
  /** time of day token extracted from heading */
  timeOfDay:   "DAY" | "NIGHT" | "DUSK" | "DAWN" | "CONTINUOUS" | "UNKNOWN";
  /** Raw action lines from scenes set in this location */
  rawHints:    string[];
}

export interface ParsedScreenplay {
  characters:   CharacterHint[];
  environments: EnvironmentHint[];
  /** Set of prop words appearing in action lines (deduplicated) */
  propWords:    string[];
  /** Raw weather/atmosphere signals: "rain", "fog", "snow", etc. */
  atmosphere:   string[];
}

// ── Regexes ───────────────────────────────────────────────────────────────────

const HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+(.+?)\s*[-–—]\s*(DAY|NIGHT|DUSK|DAWN|CONTINUOUS|LATER|MOMENTS LATER)?\s*$/im;
const ALL_CAPS_RE = /^[A-Z][A-Z\s\.\-']{2,}$/;

// Props: common screenplay nouns that have visual weight
const PROP_PATTERNS = [
  /\b(laptop|computer|phone|gun|knife|briefcase|table|chair|desk|bed|door|window|car|truck|bottle|glass|book|camera|light|lamp|clock|bag|box|rope|wire)\b/gi,
];

const WEATHER_PATTERNS = [
  /\b(rain(?:ing)?|snow(?:ing)?|fog(?:gy)?|mist(?:y)?|storm(?:ing)?|wind(?:y)?|overcast|cloudy|sunny|dark|twilight)\b/gi,
];

// Appearance descriptor words near a character introduction
const APPEARANCE_WORDS = /\b(\d+s?|twenties|thirties|forties|fifties|young|old|tall|short|thin|heavy|muscular|lean|weathered|exhausted|nervous|calm|dressed|wearing|shirt|jacket|coat|jeans|suit|hoodie|t-shirt|hair|beard|glasses|eyes|face)\b/gi;

// ── Parser ────────────────────────────────────────────────────────────────────

function extractTimeOfDay(raw: string): EnvironmentHint["timeOfDay"] {
  const u = raw.toUpperCase();
  if (u.includes("NIGHT"))      return "NIGHT";
  if (u.includes("DAY"))        return "DAY";
  if (u.includes("DUSK"))       return "DUSK";
  if (u.includes("DAWN"))       return "DAWN";
  if (u.includes("CONTINUOUS")) return "CONTINUOUS";
  return "UNKNOWN";
}

/**
 * Parse a screenplay string into structured continuity data.
 * Works on any script format — Hollywood standard or plain prose.
 */
export function parseScreenplay(script: string): ParsedScreenplay {
  const lines = script.split("\n");

  const characterMap  = new Map<string, CharacterHint>();
  const environmentMap = new Map<string, EnvironmentHint>();
  const propSet       = new Set<string>();
  const atmosSet      = new Set<string>();

  let currentLocation = "";

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i].trim();
    const upper = line.toUpperCase();

    // ── Scene heading ──────────────────────────────────────────────────────
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const locRaw  = headingMatch[2].trim();
      const locKey  = locRaw.toLowerCase();
      currentLocation = locKey;

      if (!environmentMap.has(locKey)) {
        environmentMap.set(locKey, {
          location:  locRaw,
          timeOfDay: extractTimeOfDay(line),
          rawHints:  [],
        });
      }
      continue;
    }

    // ── Character name (ALL CAPS, short, centred-ish) ──────────────────────
    if (ALL_CAPS_RE.test(line) && line.length < 40 && !line.includes(".")) {
      const name = line.trim();
      // Skip common non-character caps: CUT TO, FADE IN, etc.
      if (!["CUT TO", "FADE IN", "FADE OUT", "SMASH CUT", "DISSOLVE TO",
            "TITLE CARD", "SUPER", "END TITLE", "THE END"].includes(name)) {
        if (!characterMap.has(name)) {
          characterMap.set(name, { name, rawHints: [], sceneCount: 0 });
        }
        characterMap.get(name)!.sceneCount++;

        // Collect appearance hints from surrounding action lines (±3 lines)
        const ctx: string[] = [];
        for (let j = Math.max(0, i - 3); j < Math.min(lines.length, i + 4); j++) {
          if (j !== i) ctx.push(lines[j]);
        }
        const ctxText = ctx.join(" ");
        const appearanceMatches = ctxText.match(APPEARANCE_WORDS);
        if (appearanceMatches) {
          const hint = characterMap.get(name)!;
          hint.rawHints = [...new Set([...hint.rawHints, ...appearanceMatches.map(m => m.toLowerCase())])];
        }
      }
      continue;
    }

    // ── Action line — attach hints to current location ────────────────────
    if (currentLocation && line.length > 10 && !line.startsWith("(")) {
      const env = environmentMap.get(currentLocation);
      if (env && env.rawHints.length < 5) {
        env.rawHints.push(line.slice(0, 120));
      }

      // Props
      for (const pattern of PROP_PATTERNS) {
        const matches = line.match(pattern);
        if (matches) matches.forEach(m => propSet.add(m.toLowerCase()));
      }

      // Weather / atmosphere
      for (const weatherRe of WEATHER_PATTERNS) {
        const wMatches = line.match(weatherRe);
        if (wMatches) wMatches.forEach(m => atmosSet.add(m.toLowerCase()));
      }
    }
  }

  // ── Build sorted output ────────────────────────────────────────────────────
  const characters = [...characterMap.values()]
    .filter(c => c.sceneCount >= 1)
    .sort((a, b) => b.sceneCount - a.sceneCount);

  const environments = [...environmentMap.values()];

  console.log(
    `[ScreenplayParser] ${characters.length} characters | ` +
    `${environments.length} environments | ` +
    `${propSet.size} props | ` +
    `atmosphere: ${[...atmosSet].join(", ") || "none"}`
  );

  return {
    characters,
    environments,
    propWords:  [...propSet],
    atmosphere: [...atmosSet],
  };
}
