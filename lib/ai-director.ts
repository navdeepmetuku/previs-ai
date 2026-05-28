/**
 * VISH AI engine — Gemini-powered cinematic intelligence.
 *
 * Uses provider-manager for retry + quota detection.
 * All functions throw AiError("quota") on quota exhaustion — API routes
 * must catch this and serve fallback content.
 */

import type { Scene, Project, SceneInsight, SequenceInsight, DirectorMessage, DirectorMemory } from "@/types";
import { createModel, withRetry } from "@/lib/ai/provider-manager";

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

// ── Scene analysis ──────────────────────────────────────────────────────────

export async function analyzeScene(
  scene:          Scene,
  storyMemory?:   Project["storyMemory"],
  memoryContext?: string,
  tier?:          "flash" | "pro",
): Promise<SceneInsight> {
  const model = await createModel(tier);

  const context = [
    storyMemory ? `Project style: ${storyMemory.filmStyle}\nColour grade: ${storyMemory.colorGrade}` : "",
    memoryContext ?? "",
  ].filter(Boolean).join("\n\n");

  const prompt = `You are VISH — expert cinematographer and co-director. Give precise technical advice.

Analyze this single storyboard shot. Return a JSON object ONLY — no markdown.

SHOT:
  Title: ${scene.title}
  Description: ${scene.description}
  Shot type: ${scene.shotType}
  Lighting: ${scene.lighting}
  Mood: ${scene.mood}
  Location: ${scene.location}
  Characters: ${scene.characters || "unspecified"}
${context ? `\nCONTEXT:\n${context}` : ""}

Return EXACTLY this JSON shape:
{
  "sceneId": "${scene.id}",
  "cameraAdvice": "<1 sentence: specific camera placement and angle advice>",
  "lensRecommendation": "<e.g. '85mm telephoto, shallow DOF' — specific focal length and why>",
  "lightingNote": "<1 sentence: practical lighting rig suggestion>",
  "cinematicReference": "<single film title this shot should evoke>",
  "cinematographerRef": "<single DOP name whose style fits>",
  "improvementTip": "<1 concrete improvement — reference earlier creative choices if relevant>",
  "emotionalIntensity": <integer 1-10>,
  "references": ["<film 1>", "<film 2>", "<film 3>"]
}`;

  const result  = await withRetry(() => model.generateContent(prompt));
  const cleaned = stripFences(result.response.text());
  return JSON.parse(cleaned) as SceneInsight;
}

// ── Sequence analysis ───────────────────────────────────────────────────────

export async function analyzeSequence(
  scenes:         Scene[],
  project:        Pick<Project, "title" | "genre" | "storyMemory">,
  memoryContext?: string,
  tier?:          "flash" | "pro",
): Promise<SequenceInsight> {
  const model = await createModel(tier);

  const shotList = scenes.map(s =>
    `  Shot ${s.order}: "${s.title}" | ${s.shotType} | ${s.mood} | ${s.timelineMeta?.durationSeconds ?? 3}s | trans: ${s.timelineMeta?.transitionType ?? "cut"}`
  ).join("\n");

  const prompt = `You are VISH — seasoned film editor and co-director.

PROJECT: "${project.title}" (${project.genre})
${project.storyMemory ? `Style: ${project.storyMemory.filmStyle}` : ""}
${memoryContext ? `\n${memoryContext}` : ""}

SHOT SEQUENCE:
${shotList}

Return EXACTLY this JSON — no markdown:
{
  "overallRhythm": "<one of: tight | balanced | sluggish | uneven>",
  "directorNote": "<2-3 sentences: directorial assessment>",
  "pacingIssues": ["<issue 1>", "<issue 2>"],
  "emotionalArc": [${scenes.map(s => `{"sceneId":"${s.id}","intensity":<1-10>}`).join(",")}],
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}`;

  const result  = await withRetry(() => model.generateContent(prompt));
  const cleaned = stripFences(result.response.text());
  return JSON.parse(cleaned) as SequenceInsight;
}

// ── Director chat ───────────────────────────────────────────────────────────

export async function directorChat(
  messages:        DirectorMessage[],
  project:         Pick<Project, "title" | "genre" | "storyMemory" | "scenes">,
  selectedScene?:  Scene | null,
  memoryContext?:  string,
  tier?:           "flash" | "pro",
): Promise<string> {
  const model = await createModel(tier);

  const systemContext = `You are VISH — Visual Intelligence for Shot Handling. Embedded AI co-director inside PREVIS-LAB.

Your voice: precise, cinematic, director-oriented. Speak like a seasoned DOP and film director — never a generic AI. Reference specific films, cinematographers, lenses, lighting rigs. Be concise: 2–5 sentences or a tight list. Never say "Great question" or "Certainly". Get straight to the craft. When memory reveals patterns, reference them.

Working on "${project.title}" — a ${project.genre} project.
${project.storyMemory ? `Visual identity: ${project.storyMemory.filmStyle}. Colour: ${project.storyMemory.colorGrade}.` : ""}
${memoryContext ? `\n${memoryContext}` : ""}

All ${project.scenes.length} shots:
${project.scenes.map(s => `  ${s.order}. "${s.title}" — ${s.shotType}, ${s.mood}, ${s.lighting}`).join("\n")}
${selectedScene ? `\nCurrently focused: Shot ${selectedScene.order} — "${selectedScene.title}" (${selectedScene.shotType}, ${selectedScene.mood}, ${selectedScene.lighting})` : ""}`;

  const history = messages.slice(-10).map(m => ({
    role:  m.role === "director" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const lastUser = history.pop();
  if (!lastUser || lastUser.role !== "user") {
    return "Tell me what you want to shape in this sequence.";
  }

  const chat = model.startChat({
    history: [
      { role: "user",  parts: [{ text: systemContext }] },
      { role: "model", parts: [{ text: `VISH online. I've read all ${project.scenes.length} shots on "${project.title}". What do you want to shape?` }] },
      ...history,
    ],
  });

  const result = await withRetry(() => chat.sendMessage(lastUser.parts[0].text));
  return result.response.text().trim();
}

// ── Generate creative tendencies ────────────────────────────────────────────

export async function generateTendencies(
  memory: Pick<DirectorMemory,
    "dominantLighting" | "dominantMoods" | "dominantShotTypes" |
    "dominantLens" | "dominantMovement" | "locationVariety" | "moodVariety"
  >,
  project: Pick<Project, "title" | "genre" | "scenes">,
  tier?:   "flash" | "pro",
): Promise<{ tendencies: string[]; flags: string[] }> {
  const model = await createModel(tier);

  const shotSummary = project.scenes.map(s =>
    `${s.order}. ${s.shotType}, ${s.mood}, ${s.lighting}`
  ).join(" | ");

  const prompt = `You are VISH. Analyze these creative patterns from a ${project.genre} previs project.

PATTERNS:
  Dominant lighting: ${memory.dominantLighting}
  Dominant moods: ${memory.dominantMoods.join(", ")}
  Dominant shot types: ${memory.dominantShotTypes.join(", ")}
  Preferred lens: ${memory.dominantLens ?? "unset"}
  Camera movement: ${memory.dominantMovement ?? "unset"}
  Location variety: ${Math.round(memory.locationVariety * 100)}%
  Mood variety: ${Math.round(memory.moodVariety * 100)}%

SHOT LOG: ${shotSummary}

Return EXACTLY this JSON — no markdown:
{
  "tendencies": ["<observation 1>", "<observation 2>", "<observation 3>", "<observation 4>"],
  "flags": ["<concern 1>", "<concern 2>"]
}`;

  const result  = await withRetry(() => model.generateContent(prompt));
  const cleaned = stripFences(result.response.text());
  return JSON.parse(cleaned) as { tendencies: string[]; flags: string[] };
}
