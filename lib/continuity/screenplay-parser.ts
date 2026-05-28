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
  /** Detected gender from pronouns in the introduction paragraph */
  gender:      "male" | "female" | "neutral" | "unknown";
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

// Non-character ALL-CAPS tokens to skip
const SKIP_CAPS = new Set([
  "CUT TO", "FADE IN", "FADE OUT", "SMASH CUT", "DISSOLVE TO",
  "TITLE CARD", "SUPER", "END TITLE", "THE END", "INTERCUT WITH",
  "MATCH CUT", "JUMP CUT", "FREEZE FRAME", "BACK TO SCENE",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

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
 * Detect gender from pronoun usage in a block of text.
 * Counts he/his vs she/her occurrences and picks the majority.
 */
function detectGender(text: string): "male" | "female" | "neutral" | "unknown" {
  const lower = text.toLowerCase();
  // Count gendered pronoun occurrences (word-boundary matched)
  const maleMatches   = (lower.match(/\b(he|his|him)\b/g) ?? []).length;
  const femaleMatches = (lower.match(/\b(she|her|hers)\b/g) ?? []).length;
  const theyMatches   = (lower.match(/\b(they|them|their)\b/g) ?? []).length;

  if (maleMatches === 0 && femaleMatches === 0 && theyMatches === 0) return "unknown";
  if (theyMatches > maleMatches && theyMatches > femaleMatches)       return "neutral";
  if (femaleMatches > maleMatches)                                     return "female";
  if (maleMatches > femaleMatches)                                     return "male";
  return "unknown";
}

/**
 * Split a block of text into segments, each "owned" by the nearest preceding
 * ALL-CAPS character token. Returns a map of characterName → text segment.
 *
 * This is the core fix: descriptors are attributed to the closest preceding
 * character mention, not pooled across the whole paragraph.
 *
 * Example paragraph:
 *   "MARA (40s, weathered) enters. She looks tired.
 *    VICTOR (50s, expensive suit) follows."
 *
 * Result:
 *   MARA  → "(40s, weathered) enters. She looks tired."
 *   VICTOR → "(50s, expensive suit) follows."
 */
function splitByCharacterOwnership(
  paragraphLines: string[],
): Map<string, string> {
  const segments = new Map<string, string>();
  let currentOwner: string | null = null;
  let currentText: string[] = [];

  const flush = () => {
    if (currentOwner && currentText.length > 0) {
      const existing = segments.get(currentOwner) ?? "";
      segments.set(currentOwner, (existing + " " + currentText.join(" ")).trim());
    }
    currentText = [];
  };

  for (const line of paragraphLines) {
    const trimmed = line.trim();

    // Check if this line contains an inline character introduction like
    // "MARA (40s, weathered) enters" — the name is embedded in action text.
    // We split on ALL-CAPS name tokens within the line.
    const inlineCharRe = /\b([A-Z][A-Z\s\-']{2,})(?:\s*\([^)]*\))?/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let lineHasCharToken = false;

    // Reset regex state
    inlineCharRe.lastIndex = 0;

    while ((match = inlineCharRe.exec(trimmed)) !== null) {
      const candidate = match[1].trim();
      // Only treat as a character token if it's a known screenplay name pattern
      // (not a common word like "INT" or "EXT" which are handled by HEADING_RE)
      if (
        candidate.length >= 3 &&
        candidate.length < 40 &&
        !SKIP_CAPS.has(candidate) &&
        !/^(INT|EXT|INT\/EXT|I\/E)$/.test(candidate)
      ) {
        // Text before this character token belongs to the current owner
        const before = trimmed.slice(lastIndex, match.index).trim();
        if (before) currentText.push(before);

        flush();
        currentOwner = candidate;
        lastIndex = match.index + match[0].length;
        lineHasCharToken = true;
      }
    }

    // Remaining text after the last character token (or the whole line if no token)
    const remainder = trimmed.slice(lastIndex).trim();
    if (remainder) currentText.push(remainder);

    // If the line itself IS a standalone ALL-CAPS character cue (dialogue header),
    // flush and set owner without adding the name itself to the text.
    if (!lineHasCharToken && ALL_CAPS_RE.test(trimmed) && trimmed.length < 40 && !trimmed.includes(".")) {
      if (!SKIP_CAPS.has(trimmed)) {
        flush();
        currentOwner = trimmed;
        currentText = [];
      }
    }
  }

  flush();
  return segments;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a screenplay string into structured continuity data.
 * Works on any script format — Hollywood standard or plain prose.
 */
export function parseScreenplay(script: string): ParsedScreenplay {
  // Split into paragraph blocks (blank-line separated).
  // This is the key boundary: descriptors never cross paragraph boundaries.
  const paragraphs = script.split(/\n\s*\n/).map(p => p.split("\n"));

  const characterMap   = new Map<string, CharacterHint>();
  const environmentMap = new Map<string, EnvironmentHint>();
  const propSet        = new Set<string>();
  const atmosSet       = new Set<string>();

  let currentLocation = "";

  for (const paragraphLines of paragraphs) {
    for (let i = 0; i < paragraphLines.length; i++) {
      const line = paragraphLines[i].trim();

      // ── Scene heading ────────────────────────────────────────────────────
      const headingMatch = line.match(HEADING_RE);
      if (headingMatch) {
        const locRaw = headingMatch[2].trim();
        const locKey = locRaw.toLowerCase();
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

      // ── Standalone character cue (dialogue header) ───────────────────────
      if (ALL_CAPS_RE.test(line) && line.length < 40 && !line.includes(".")) {
        const name = line.trim();
        if (!SKIP_CAPS.has(name)) {
          if (!characterMap.has(name)) {
            characterMap.set(name, { name, rawHints: [], sceneCount: 0, gender: "unknown" });
          }
          characterMap.get(name)!.sceneCount++;
        }
        continue;
      }

      // ── Action line — attach hints to current location ───────────────────
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

    // ── Per-paragraph character introduction detection ────────────────────
    // Check if this paragraph introduces any characters with appearance hints.
    // We use ownership splitting so each character only gets their own descriptors.
    const paragraphText = paragraphLines.map(l => l.trim()).join(" ");

    // Quick check: does this paragraph contain any ALL-CAPS name-like tokens?
    const hasCharToken = /\b[A-Z][A-Z\s\-']{2,}\b/.test(paragraphText);
    if (!hasCharToken) continue;

    // Split the paragraph by character ownership
    const ownershipMap = splitByCharacterOwnership(paragraphLines);

    for (const [name, ownedText] of ownershipMap) {
      // Only process names that look like character names (not scene directions)
      if (SKIP_CAPS.has(name)) continue;
      if (/^(INT|EXT|INT\/EXT|I\/E)$/.test(name)) continue;
      if (name.length < 2 || name.length >= 40) continue;

      // Extract appearance words only from this character's owned text
      const appearanceMatches = ownedText.match(APPEARANCE_WORDS);
      if (!appearanceMatches) continue;

      // Register character if not already known
      if (!characterMap.has(name)) {
        characterMap.set(name, { name, rawHints: [], sceneCount: 0, gender: "unknown" });
      }

      const hint = characterMap.get(name)!;

      // Merge appearance tokens (deduplicated)
      hint.rawHints = [...new Set([...hint.rawHints, ...appearanceMatches.map(m => m.toLowerCase())])];

      // Detect gender from the owned text (only update if still unknown)
      if (hint.gender === "unknown") {
        hint.gender = detectGender(ownedText);
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
