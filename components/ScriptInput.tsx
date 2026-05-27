"use client";

/**
 * ScriptInput — project creation form.
 *
 * Two-phase approach:
 *   Phase A: Extract scenes (Gemini) → create project immediately → navigate to storyboard
 *   Phase B: Generate images in background → update project as each image completes
 *
 * Why two phases?
 *   HF FLUX can take 30–90s per image. With 6 scenes that's 3–9 minutes of blank screen
 *   if we wait for all images before showing the storyboard.
 *   The user should see their storyboard immediately (with skeletons), and images
 *   should appear progressively as they complete.
 *
 * Architecture:
 *   - onProjectCreated(project)  → fires immediately after extraction
 *   - onProjectUpdated(project)  → fires as each image completes (optional)
 *   The parent (StudioPage) handles saving both calls identically.
 */

import { useState } from "react";
import type { Project, Scene } from "@/types";

interface Props {
  onProjectCreated: (project: Project) => void;
  onProjectUpdated?: (project: Project) => void;
}

const DEMO_SCRIPT = `INT. ABANDONED WAREHOUSE - NIGHT

Rain hammers the corrugated roof. DETECTIVE MARA CHEN (40s, weathered) sweeps her flashlight across rusted machinery.

She stops. A figure—VICTOR COLE (50s, expensive suit, wrong place)—stands in the shadows, a briefcase at his feet.

MARA
I've been looking for you for three years.

VICTOR
(smiling)
And yet here we are. You found me... just as they planned.

Mara raises her weapon. Victor doesn't flinch. Behind him, a dozen MERCENARIES step out of the darkness.

EXT. WAREHOUSE ROOFTOP - CONTINUOUS

JACKSON (30s, ex-military) watches through a sniper scope. He exhales slowly, finger resting on the trigger.

JACKSON
(into comms)
She's surrounded. Your call.

Silence on the radio. Then—an explosion rocks the far end of the warehouse.`;

export default function ScriptInput({ onProjectCreated, onProjectUpdated }: Props) {
  const [title,   setTitle]   = useState("");
  const [genre,   setGenre]   = useState("Thriller");
  const [script,  setScript]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!script.trim() || !title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // ── Phase A: Extract scenes ───────────────────────────────────────────
      const res = await fetch("/api/extract-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, title, genre }),
      });

      const data = await res.json() as {
        scenes?:        Scene[];
        error?:         string;
        storyMemory?:   import("@/types").StoryVisualMemory;
        visualContext?: import("@/types").ProjectVisualContext;
      };

      if (!res.ok || data.error) throw new Error(data.error ?? "Scene extraction failed");

      const scenes = data.scenes ?? [];
      const projectId = `proj-${Date.now()}`;

      // Create project IMMEDIATELY with null imageUrls — user sees storyboard at once
      const project: import("@/types").Project = {
        id:            projectId,
        title,
        genre,
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        scenes:        scenes.map(s => ({ ...s, imageUrl: null })),
        storyMemory:   data.storyMemory,
        visualContext: data.visualContext,
      };

      // Navigate to storyboard immediately — user doesn't wait for images
      onProjectCreated(project);
      setLoading(false);

      // ── Phase B: Generate images in background ────────────────────────────
      // Each scene generates independently. As each completes, update the project.
      // If a scene fails, its card shows an explicit retry button — never blocks others.
      let currentScenes = [...project.scenes];

      for (let idx = 0; idx < scenes.length; idx++) {
        const scene = scenes[idx];
        if (!scene.imagePrompt) continue;

        // Fire and don't await — but we do need to process results in order
        // for the continuity seed to remain deterministic
        try {
          console.log(`[ScriptInput] generating scene ${scene.order}/${scenes.length}`);

          const genRes = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt:  scene.imagePrompt,
              seed:    (idx + 1) * 1337,
              sceneId: scene.id,
            }),
          });

          const genData = await genRes.json() as {
            ok:        boolean;
            dataUrl?:  string;
            provider?: string;
            model?:    string;
            durationMs?: number;
            error?:    string;
            kind?:     string;
          };

          if (genData.ok && genData.dataUrl) {
            console.log(`[ScriptInput] scene ${scene.order} ✅ ${genData.provider} ${genData.durationMs}ms`);
            // Update this scene's imageUrl in our local copy
            currentScenes = currentScenes.map(s =>
              s.id === scene.id ? { ...s, imageUrl: genData.dataUrl! } : s
            );
          } else {
            console.warn(`[ScriptInput] scene ${scene.order} ❌ kind=${genData.kind} error=${genData.error}`);
            // null stays — SceneCard shows retry button
          }

          // Push the updated project to parent after each image
          if (onProjectUpdated) {
            onProjectUpdated({
              ...project,
              scenes: currentScenes,
              updatedAt: new Date().toISOString(),
            });
          }

        } catch (imgErr) {
          console.error(`[ScriptInput] scene ${scene.order} fetch threw:`, imgErr);
          // Continue to next scene — one failure doesn't block others
        }
      }

      console.log(`[ScriptInput] background generation complete`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  function loadDemo() {
    setTitle("The Setup");
    setGenre("Thriller");
    setScript(DEMO_SCRIPT);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">New Project</h1>
        <p className="text-sm text-white/40 mt-1">
          Paste your script — VISH will extract scenes instantly, images generate in background
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Project Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="My Film"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-amber-400/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Genre</label>
            <select
              value={genre}
              onChange={e => setGenre(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0a0f] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50 transition-colors"
            >
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-white/50 font-medium">Script / Scene Description</label>
            <button type="button" onClick={loadDemo}
              className="text-xs text-amber-400/60 hover:text-amber-400 transition-colors">
              Load demo script
            </button>
          </div>
          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="Paste your script here… (INT./EXT. scenes, action lines, dialogue)"
            required
            rows={14}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-amber-400/50 transition-colors font-mono resize-none leading-relaxed"
          />
          <p className="mt-1 text-xs text-white/20">
            {script.length} characters · Scenes extracted instantly · Images generate in background
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !title.trim() || !script.trim()}
          className="w-full rounded-full bg-amber-400 py-3 text-sm font-semibold text-black hover:bg-amber-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingDots />
              Analyzing script with VISH…
            </span>
          ) : (
            "Generate Storyboard →"
          )}
        </button>
      </form>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-black animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

const GENRES = [
  "Thriller", "Drama", "Action", "Sci-Fi", "Horror",
  "Romance", "Comedy", "Fantasy", "Mystery", "Documentary",
];
