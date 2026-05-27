/**
 * /api/extract-scenes — Scene extraction with full continuity analysis.
 *
 * Pipeline:
 *   1. Gemini: parse screenplay → structured Scene[]
 *   2. StoryMemory: derive film style, colour grade, atmospheric base
 *   3. VisualContext: parse screenplay for character + environment memory
 *   4. Per scene: build continuity prompt fragment → inject into imagePrompt
 *
 * The imagePrompt on each returned scene now contains:
 *   [character continuity] + [action] + [environment] + [camera] + [lighting] + [grade] + [DOP]
 *
 * This is the primary continuity injection point.
 * ScriptInput calls this once, stores the prompts on each Scene,
 * then /api/generate-image is called per scene with the stored prompt.
 */

import { extractScenes, AiError } from "@/lib/gemini";
import { buildCinematicPrompt }    from "@/lib/image-prompts";
import { buildStoryMemory }        from "@/lib/story-memory";
import { generateMockScenes }      from "@/lib/ai/mock-scenes";
import { buildVisualContext, buildSceneContinuityPrompt } from "@/lib/continuity/visual-context";
import type { StoryVisualMemory, ProjectVisualContext } from "@/types";

export async function POST(request: Request) {
  try {
    const { script, title, genre } = await request.json() as {
      script: string;
      title?:  string;
      genre?:  string;
    };

    if (!script || script.trim().length < 20) {
      return Response.json(
        { error: "Script is too short. Please provide at least a paragraph." },
        { status: 400 }
      );
    }

    // ── Step 1: Scene extraction ─────────────────────────────────────────────
    let scenes;
    let isMockMode = false;

    try {
      scenes = await extractScenes(script);
    } catch (err) {
      if (err instanceof AiError && (err.kind === "quota" || err.kind === "auth")) {
        scenes     = generateMockScenes(script);
        isMockMode = true;
      } else {
        throw err;
      }
    }

    // ── Step 2: Project-level story memory (genre/style/grade) ───────────────
    const storyMemory: StoryVisualMemory = buildStoryMemory(scenes, genre ?? "Drama");

    // ── Step 3: Visual continuity context (characters + environments) ────────
    // Parse the original screenplay text to extract character appearances
    // and environment descriptors — these persist across every shot.
    let visualContext: ProjectVisualContext | undefined;
    try {
      visualContext = buildVisualContext(script);
    } catch (ctxErr) {
      // Continuity is enhancement, not critical — never block scene generation
      console.warn("[extract-scenes] visual context build failed:", ctxErr);
    }

    // ── Step 4: Build per-scene prompts with continuity injection ────────────
    const scenesWithPrompts = scenes.map((scene, idx) => {
      const continuity = visualContext
        ? buildSceneContinuityPrompt(scene, visualContext)
        : null;

      const imagePrompt = buildCinematicPrompt(
        {
          ...scene,
          prevMood:     idx > 0 ? scenes[idx - 1].mood     : undefined,
          prevShotType: idx > 0 ? scenes[idx - 1].shotType : undefined,
        },
        storyMemory,
        continuity
          ? { characterContext: continuity.characterContext, environmentContext: continuity.environmentContext }
          : null,
      );

      return { ...scene, imagePrompt };
    });

    return Response.json({
      scenes:        scenesWithPrompts,
      title,
      storyMemory,
      visualContext,   // stored on Project for future VISH use and re-generation
      notice: isMockMode
        ? "VISH is recalibrating. Scene structure derived from script analysis — AI refinement resumes when quota restores."
        : null,
    });

  } catch (err: unknown) {
    const isAiErr = err instanceof AiError;
    const status  = isAiErr && err.kind === "auth" ? 503 : 500;
    const message = isAiErr
      ? err.kind === "auth"
        ? "Cinematic inference systems are offline."
        : "Scene generation temporarily unavailable. Please retry."
      : "An unexpected error occurred during scene analysis.";

    return Response.json({ error: message }, { status });
  }
}
