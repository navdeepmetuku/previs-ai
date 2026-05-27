/**
 * Visual Continuity Context — central orchestration layer.
 *
 * This is the single object that flows from screenplay parsing
 * through to prompt generation. Every image prompt for a project
 * is built using this context.
 *
 * Data flow:
 *   screenplay text
 *       ↓ parseScreenplay()
 *   ParsedScreenplay
 *       ↓ buildVisualContext()
 *   ProjectVisualContext          ← stored on Project, serializable
 *       ↓ buildContinuityPrompt() (called per scene at generation time)
 *   continuity string             ← injected into image prompt
 *
 * Why a single context object vs. separate memory calls?
 *   - One localStorage key per project (cheap storage)
 *   - One function call to build a prompt fragment
 *   - The structure matches what IPAdapter/ControlNet will need in Phase 4:
 *     character visual → reference image lookup
 *     environment visual → room conditioning image
 *
 * Scalability:
 *   In Phase 4, `characterVisuals[n].referenceImageUrl` gets populated
 *   by the identity pipeline. This file doesn't change — only the
 *   prompt builder and provider gain new conditioning parameters.
 */

import type { Scene } from "@/types";
import { parseScreenplay } from "./screenplay-parser";
import { buildCharacterMemory, getSceneCharacterDescriptors } from "./character-memory";
import { buildEnvironmentMemory, getEnvironmentDescriptor } from "./environment-memory";
import type { CharacterVisual }    from "./character-memory";
import type { EnvironmentVisual }  from "./environment-memory";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProjectVisualContext {
  /** Characters with visual descriptors — serializable, stored on Project */
  characters:   CharacterVisual[];
  /** Environments with visual descriptors — serializable, stored on Project */
  environments: EnvironmentVisual[];
  /** Dominant atmosphere signals for the whole screenplay */
  atmosphere:   string[];
  /** Props that should persist visually when relevant */
  propWords:    string[];
}

export interface SceneContinuityPrompt {
  /** Characters visible in this scene with their visual descriptors */
  characterContext:   string;
  /** Environment context for this scene's location */
  environmentContext: string;
  /** Combined continuity string ready to inject into image prompt */
  combined:           string;
  /** Debug: which source each token came from */
  debugTokens: {
    characters:  string[];
    environment: string | null;
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Parse a screenplay and build the full visual context for a project.
 * Call once per project at extract-scenes time.
 * Store the result on Project.visualContext and pass to buildContinuityPrompt.
 */
export function buildVisualContext(script: string): ProjectVisualContext {
  const parsed = parseScreenplay(script);

  const characters   = buildCharacterMemory(parsed.characters);
  const environments = buildEnvironmentMemory(parsed.environments);

  console.log(
    `[VisualContext] built: ${characters.length} chars | ` +
    `${environments.length} envs | ` +
    `${parsed.propWords.length} props | ` +
    `atmos=[${parsed.atmosphere.join(",")}]`
  );

  return {
    characters,
    environments,
    atmosphere: parsed.atmosphere,
    propWords:  parsed.propWords,
  };
}

/**
 * Build the continuity prompt fragment for a single scene.
 * This string is injected into the image prompt as an additional layer.
 *
 * @param scene    The scene being rendered
 * @param context  The project's visual context (from buildVisualContext)
 */
export function buildSceneContinuityPrompt(
  scene:   Pick<Scene, "characters" | "location">,
  context: ProjectVisualContext,
): SceneContinuityPrompt {
  // ── Characters ────────────────────────────────────────────────────────────
  const charDescriptors = getSceneCharacterDescriptors(scene.characters ?? "", context.characters);
  const characterContext = charDescriptors.join("; ");

  // ── Environment ───────────────────────────────────────────────────────────
  const environmentContext = getEnvironmentDescriptor(scene.location, context.environments) ?? "";

  // ── Atmosphere ────────────────────────────────────────────────────────────
  // Add project-wide atmosphere only if it meaningfully applies
  const atmosContext = context.atmosphere.length > 0
    ? context.atmosphere.slice(0, 2).join(", ")
    : "";

  // ── Combined ─────────────────────────────────────────────────────────────
  const parts = [characterContext, environmentContext, atmosContext].filter(Boolean);
  const combined = parts.join(", ");

  if (combined) {
    console.log(`[Continuity] scene chars="${scene.characters}" loc="${scene.location}" → "${combined.slice(0, 80)}…"`);
  }

  return {
    characterContext,
    environmentContext,
    combined,
    debugTokens: {
      characters:  charDescriptors,
      environment: environmentContext || null,
    },
  };
}
