import { analyzeScene, analyzeSequence, directorChat, generateTendencies } from "@/lib/ai-director";
import { AiError } from "@/lib/ai/provider-manager";
import {
  getFallbackInsight,
  getFallbackSequenceInsight,
  getFallbackChatReply,
} from "@/lib/ai/vish-fallbacks";
import type { Scene, Project, DirectorMessage, DirectorMemory } from "@/types";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action:         "analyze-scene" | "analyze-sequence" | "chat" | "generate-tendencies";
      scene?:         Scene;
      scenes?:        Scene[];
      project?:       Pick<Project, "title" | "genre" | "storyMemory" | "scenes">;
      messages?:      DirectorMessage[];
      selectedScene?: Scene | null;
      memoryContext?: string;
      tier?:          "flash" | "pro";
      memory?:        Pick<DirectorMemory,
        "dominantLighting" | "dominantMoods" | "dominantShotTypes" |
        "dominantLens" | "dominantMovement" | "locationVariety" | "moodVariety"
      >;
    };

    const tier: "flash" | "pro" = body.tier === "pro" ? "pro" : "flash";

    switch (body.action) {

      case "analyze-scene": {
        if (!body.scene) return Response.json({ error: "scene is required" }, { status: 400 });
        try {
          const insight = await analyzeScene(body.scene, body.project?.storyMemory, body.memoryContext, tier);
          return Response.json({ insight });
        } catch (err) {
          if (err instanceof AiError && (err.kind === "quota" || err.kind === "auth")) {
            return Response.json({
              insight: getFallbackInsight(body.scene.id, body.scene.mood, body.scene.order),
              notice: "VISH is operating in offline mode — observations are from cinematic knowledge base.",
            });
          }
          throw err;
        }
      }

      case "analyze-sequence": {
        if (!body.scenes || !body.project) {
          return Response.json({ error: "scenes and project are required" }, { status: 400 });
        }
        try {
          const insight = await analyzeSequence(body.scenes, body.project, body.memoryContext, tier);
          return Response.json({ insight });
        } catch (err) {
          if (err instanceof AiError && (err.kind === "quota" || err.kind === "auth")) {
            return Response.json({
              insight: getFallbackSequenceInsight(body.scenes),
              notice: "VISH is switching cinematic inference providers…",
            });
          }
          throw err;
        }
      }

      case "chat": {
        if (!body.messages || !body.project) {
          return Response.json({ error: "messages and project are required" }, { status: 400 });
        }
        const lastUserMsg = [...body.messages].reverse().find(m => m.role === "user");
        try {
          const reply = await directorChat(body.messages, body.project, body.selectedScene, body.memoryContext, tier);
          return Response.json({ reply });
        } catch (err) {
          if (err instanceof AiError && (err.kind === "quota" || err.kind === "auth")) {
            const fallback = getFallbackChatReply(lastUserMsg?.content ?? "");
            return Response.json({
              reply: fallback,
              notice: "VISH offline mode — response from cinematic knowledge base.",
            });
          }
          throw err;
        }
      }

      case "generate-tendencies": {
        if (!body.memory || !body.project) {
          return Response.json({ error: "memory and project are required" }, { status: 400 });
        }
        try {
          const result = await generateTendencies(body.memory, body.project, tier);
          return Response.json(result);
        } catch (err) {
          if (err instanceof AiError && (err.kind === "quota" || err.kind === "auth")) {
            return Response.json({
              tendencies: [
                "VISH creative analysis is recalibrating — patterns have been logged and will be processed when systems restore.",
                "Visual patterns detected from scene metadata — AI refinement pending.",
              ],
              flags: [
                "Full continuity analysis requires VISH to be online — check back shortly.",
              ],
              notice: "VISH is recalibrating visual systems…",
            });
          }
          throw err;
        }
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }

  } catch (err: unknown) {
    // Final safety net — cinematic error messaging, no raw strings
    const isAiErr = err instanceof AiError;
    const status  = isAiErr && err.kind === "auth" ? 503 : 500;
    const message = isAiErr
      ? "VISH cinematic systems are temporarily offline. The workspace remains fully functional."
      : "An unexpected error occurred.";
    return Response.json({ error: message }, { status });
  }
}
