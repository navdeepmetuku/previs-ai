/**
 * VISH Fallback Responses — pre-written cinematic advice library.
 *
 * Used when Gemini quota is exhausted so VISH never goes silent.
 * Responses are keyed by shot type + mood for specificity.
 * They sound like real director advice — not generic placeholders.
 */

import type { SceneInsight, SequenceInsight } from "@/types";

// ── Per-scene insight fallbacks ───────────────────────────────────────────────

// Pre-written cinematic advice indexed by mood
const INSIGHT_BY_MOOD: Record<string, Omit<SceneInsight, "sceneId" | "emotionalIntensity">> = {
  Tense: {
    cameraAdvice:       "Place camera at chest height, locked off on a 35mm — let the subject's stillness carry the threat.",
    lensRecommendation: "50mm at f2.0 — keeps the environment readable while compressing space into claustrophobia.",
    lightingNote:       "Single motivated source from the side; let the far half of the face fall into shadow.",
    cinematicReference: "Sicario",
    cinematographerRef: "Roger Deakins",
    improvementTip:     "Cut in closer than feels comfortable — the discomfort is the point.",
    references:         ["Sicario", "No Country for Old Men", "Drive"],
  },
  Dramatic: {
    cameraAdvice:       "Low-angle, slight dutch tilt; let the architecture frame the character as trapped or elevated.",
    lensRecommendation: "35mm standard — honest perspective, no distortion, truth in every wrinkle.",
    lightingNote:       "Motivated window light with a hard opposite-side shadow; Rembrandt pattern.",
    cinematicReference: "There Will Be Blood",
    cinematographerRef: "Robert Elswit",
    improvementTip:     "Reduce camera movement; static shots in high-drama scenes read as inevitable.",
    references:         ["There Will Be Blood", "Zodiac", "The Godfather"],
  },
  Mysterious: {
    cameraAdvice:       "Push the subject into the background; lead with an environmental detail in the foreground.",
    lensRecommendation: "85mm at f1.4 — background dissolves into atmosphere, subject emerges like memory.",
    lightingNote:       "Practicals only; motivate every source, leave the ceiling in darkness.",
    cinematicReference: "Blade Runner 2049",
    cinematographerRef: "Roger Deakins",
    improvementTip:     "Don't reveal too much — partial information creates sustained dread.",
    references:         ["Blade Runner 2049", "Arrival", "Enemy"],
  },
  Action: {
    cameraAdvice:       "Stay tight and handheld — wide lenses for context, then cut to close for impact.",
    lensRecommendation: "24mm handheld — immersive, fast, keeps the geography readable in motion.",
    lightingNote:       "High-key with hard rim lights; action reads best with punchy contrast.",
    cinematicReference: "Mad Max: Fury Road",
    cinematographerRef: "John Seale",
    improvementTip:     "Establish geography in one wide shot, then commit to chaos — audiences can orient from one clear frame.",
    references:         ["Mad Max: Fury Road", "Children of Men", "Heat"],
  },
  Romantic: {
    cameraAdvice:       "Slow push-in on a two-shot; let physical proximity increase as the camera moves.",
    lensRecommendation: "85mm at f1.2 — faces sharp, world soft, the two of them alone in the universe.",
    lightingNote:       "Warm practical sources; candle equivalent at 3200K; no fill, let shadows live.",
    cinematicReference: "In the Mood for Love",
    cinematographerRef: "Christopher Doyle",
    improvementTip:     "Slow down. In romantic scenes the camera should feel like it's breathing.",
    references:         ["In the Mood for Love", "Her", "Lost in Translation"],
  },
  Horror: {
    cameraAdvice:       "Keep the threat at the edge of frame or just out of it; the unseen is always scarier.",
    lensRecommendation: "28mm at f2.8 — just wide enough to feel wrong, to see too much peripheral darkness.",
    lightingNote:       "Near-black with a single cold blue source; skin should read as bloodless.",
    cinematicReference: "Hereditary",
    cinematographerRef: "Pawel Pogorzelski",
    improvementTip:     "Hold the shot longer than feels right. Audience tension builds in the wait.",
    references:         ["Hereditary", "The Witch", "Midsommar"],
  },
  Melancholic: {
    cameraAdvice:       "Wide, still, the subject small in the frame; loneliness is a spatial problem.",
    lensRecommendation: "35mm on a tripod — understated, honest, no romanticism.",
    lightingNote:       "Overcast flat light or blue-hour; avoid shadows that add drama to quiet grief.",
    cinematicReference: "Manchester by the Sea",
    cinematographerRef: "Jody Lee Lipes",
    improvementTip:     "Resist cutting. Melancholy lives in duration, not in editing rhythm.",
    references:         ["Manchester by the Sea", "Blue Valentine", "Moonlight"],
  },
  Triumphant: {
    cameraAdvice:       "Low heroic angle, subject rising into sky or light; let them inhabit the frame completely.",
    lensRecommendation: "24mm from a low position — exaggerates height and presence.",
    lightingNote:       "Golden rim light from behind; warm and generous, the world is for them today.",
    cinematicReference: "Dunkirk",
    cinematographerRef: "Hoyte van Hoytema",
    improvementTip:     "Let them breathe in the frame — heroic moments need space.",
    references:         ["Dunkirk", "Glory", "The Dark Knight Rises"],
  },
  Comedic: {
    cameraAdvice:       "Eye-level, static — comedy is truth, and truth doesn't try to be interesting.",
    lensRecommendation: "35mm or 50mm; keep everyone in the frame, let reaction shots breathe.",
    lightingNote:       "Bright, even, high-key — comedy dies in shadow.",
    cinematicReference: "The Grand Budapest Hotel",
    cinematographerRef: "Robert Yeoman",
    improvementTip:     "Wider is funnier. Tight close-ups in comedy feel desperate.",
    references:         ["The Grand Budapest Hotel", "Burn After Reading", "Palm Springs"],
  },
  Serene: {
    cameraAdvice:       "Slow pan or locked wide; let nature or the environment breathe without interruption.",
    lensRecommendation: "50mm standard — naturalistic, unobtrusive, present without imposing.",
    lightingNote:       "Soft north-sky or overcast; diffused and directionless, like a good memory.",
    cinematicReference: "Nomadland",
    cinematographerRef: "Joshua James Richards",
    improvementTip:     "Resist filling silence with camera movement — stillness is the mood.",
    references:         ["Nomadland", "Days of Heaven", "Tree of Life"],
  },
};

// ── Per-scene fallback factory ───────────────────────────────────────────────

export function getFallbackInsight(sceneId: string, mood: string, order: number): SceneInsight {
  const base = INSIGHT_BY_MOOD[mood] ?? INSIGHT_BY_MOOD["Dramatic"];
  return {
    ...base,
    sceneId,
    emotionalIntensity: Math.min(10, Math.max(1, order * 2 - 1 + (order % 3))), // varied 1–10
  };
}

// ── Sequence fallback ────────────────────────────────────────────────────────

export function getFallbackSequenceInsight(
  scenes: { id: string; order: number; mood: string; timelineMeta?: { durationSeconds?: number | null } | null }[],
): SequenceInsight {
  const moods    = scenes.map(s => s.mood);
  const variety  = new Set(moods).size;
  const rhythm   = variety >= 4 ? "balanced" : variety >= 3 ? "tight" : "uneven";
  const totalSec = scenes.reduce((a, s) => a + (s.timelineMeta?.durationSeconds ?? 3), 0);

  return {
    overallRhythm: rhythm,
    directorNote: `This ${scenes.length}-shot sequence runs approximately ${totalSec}s. ` +
      `The dominant mood is ${moods[0] ?? "Dramatic"} — ` +
      `ensure visual contrast builds toward the final beat. ` +
      `VISH analysis will refine these observations once quota is restored.`,
    pacingIssues: variety < 3
      ? ["Limited mood variety — consider alternating emotional registers between shots"]
      : [],
    emotionalArc: scenes.map((s, i) => ({
      sceneId:   s.id,
      intensity: Math.round((i / Math.max(scenes.length - 1, 1)) * 6 + 3),
    })),
    suggestions: [
      "VISH is operating in offline mode — full analysis will resume when quota is restored.",
      "Review the emotional arc manually and ensure the sequence has a clear rise and resolution.",
      "Check that no three consecutive shots share the same shot type.",
    ],
  };
}

// ── Chat fallbacks keyed by user intent ─────────────────────────────────────

type ChatTopic = "tension" | "pacing" | "lens" | "transition" | "general" | "reference";

function detectTopic(message: string): ChatTopic {
  const m = message.toLowerCase();
  if (m.includes("tense") || m.includes("tension") || m.includes("suspense")) return "tension";
  if (m.includes("pace") || m.includes("pacing") || m.includes("rhythm") || m.includes("slow")) return "pacing";
  if (m.includes("lens") || m.includes("focal") || m.includes("mm") || m.includes("camera")) return "lens";
  if (m.includes("transition") || m.includes("cut") || m.includes("dissolve")) return "transition";
  if (m.includes("like") || m.includes("reference") || m.includes("feel") || m.includes("style")) return "reference";
  return "general";
}

const CHAT_FALLBACKS: Record<ChatTopic, string[]> = {
  tension: [
    "Tension is architectural. Compress the frame, reduce headroom, and hold the shot past comfort. The audience should feel the edit is late.",
    "Don't move the camera to build tension — lock it off. A static frame during confrontation reads as inevitability, not indifference.",
    "Consider reducing ambient fill to 20% of your key. When faces fall into shadow, the audience projects their own fear.",
  ],
  pacing: [
    "Pacing is about contrast, not speed. A fast sequence reads faster when preceded by a genuinely slow one — don't cut everything short, cut the right things short.",
    "Examine your shot durations against the emotional arc. Setup scenes can run long. Climax scenes should feel too short.",
    "The most common pacing mistake is uniformity — every shot the same length, every transition a cut. Introduce one long take to reset the audience's clock.",
  ],
  lens: [
    "For intimate drama, 85mm at f1.4 is the standard — it compresses background into pure atmosphere. Avoid going wider than 35mm unless you want the environment to comment on the character.",
    "Wide lenses (24mm and below) are political lenses — they show context, power dynamics, where everyone stands. Use them when geography is the story.",
    "The 50mm is the most honest lens — it sees roughly as the human eye sees. Use it when you want truth, not interpretation.",
  ],
  transition: [
    "The match cut is the most cinematic transition in the language — find a shape, movement, or colour that bridges two worlds and the audience does the editing for you.",
    "Use dissolves sparingly. They signal time passing or psychological overlap. If you're using them for mood, you might need a better shot instead.",
    "Hard cuts are the default for reason — they respect the audience's attention. If you're considering a softer transition, ask whether the cut itself can carry that weight.",
  ],
  reference: [
    "For cold, controlled atmospheres: Fincher. Every frame is designed, every shadow motivated. Extremely precise.",
    "For epic visual poetry: Villeneuve with Greig Fraser or Roger Deakins. Vast scale, intimate emotion, extraordinary colour restraint.",
    "For handheld truth: Paul Greengrass with Barry Ackroyd. Urgent, present, uncomfortable in the best possible way.",
  ],
  general: [
    "VISH is operating at reduced capacity while quota is refreshed. These observations are from my offline knowledge base — the full cinematic analysis system will resume shortly.",
    "Good previs isn't about perfect images — it's about locking down intent. Use this sequence to confirm your visual language before production.",
    "The storyboard is a communication tool, not a finished product. Focus on shot type, lens, and lighting — the three pillars that survive into production.",
  ],
};

export function getFallbackChatReply(userMessage: string): string {
  const topic     = detectTopic(userMessage);
  const responses = CHAT_FALLBACKS[topic];
  // Deterministic selection based on message length — avoids random
  const idx = Math.abs(userMessage.length) % responses.length;
  return responses[idx];
}
