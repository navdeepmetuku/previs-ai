"use client";

/**
 * useGenerationQueue — background cinematic image generation.
 *
 * Generates frames for multiple scenes sequentially (one at a time to
 * avoid hammering the provider) while the workspace stays fully usable.
 *
 * Features:
 *   - Queue multiple scenes; generates in order
 *   - Per-scene status: idle | queued | generating | done | failed
 *   - onFrameReady callback fires when a scene gets its image
 *   - Cancellable at any time
 *   - Uses Mode B of /api/generate-image (full continuity context)
 *   - Phase 14 — reads current image tier from localStorage and passes to API
 *
 * Usage:
 *   const { enqueue, status, cancel, isRunning } = useGenerationQueue({
 *     project,
 *     onFrameReady: (sceneId, dataUrl) => updateScene(sceneId, dataUrl),
 *   });
 *   enqueue(scene);           // add one scene
 *   enqueue(...scenes);       // add many
 */

import { useState, useRef, useCallback } from "react";
import type { Scene, Project } from "@/types";
import { put as putImage } from "@/lib/supabase/image-store";
import { getImageTier, bumpQuota } from "@/lib/model-tiers";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GenerationStatus = "idle" | "queued" | "generating" | "done" | "failed";

interface SceneStatus {
  sceneId:  string;
  status:   GenerationStatus;
  error?:   string;
  provider?: string;
  ms?:       number;
}

interface Options {
  project:      Pick<Project, "id" | "genre" | "storyMemory" | "visualContext" | "scenes">;
  onFrameReady: (sceneId: string, dataUrl: string) => void;
}

interface QueueHook {
  /** Add scenes to the generation queue */
  enqueue:    (...scenes: Scene[]) => void;
  /** Current status map: sceneId → status */
  statuses:   Record<string, SceneStatus>;
  /** True while any scene is being generated */
  isRunning:  boolean;
  /** Cancel all pending generation */
  cancel:     () => void;
  /** How many scenes are queued or generating */
  pending:    number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGenerationQueue({ project, onFrameReady }: Options): QueueHook {
  const [statuses,   setStatuses]   = useState<Record<string, SceneStatus>>({});
  const [isRunning,  setIsRunning]  = useState(false);
  const queueRef     = useRef<Scene[]>([]);
  const cancelledRef = useRef(false);
  const runningRef   = useRef(false);

  const setStatus = useCallback((sceneId: string, update: Partial<SceneStatus>) => {
    setStatuses(prev => {
      const existing = prev[sceneId] ?? { sceneId, status: "idle" as const };
      return { ...prev, [sceneId]: { ...existing, ...update } };
    });
  }, []);

  // ── Process queue one-by-one ──────────────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (runningRef.current) return; // already running
    runningRef.current = true;
    cancelledRef.current = false;
    setIsRunning(true);

    while (queueRef.current.length > 0 && !cancelledRef.current) {
      const scene = queueRef.current.shift()!;
      setStatus(scene.id, { status: "generating" });

      try {
        const allScenes  = project.scenes ?? [];
        const sceneIndex = allScenes.findIndex(s => s.id === scene.id);
        const tier       = getImageTier(project.id);

        const res = await fetch("/api/generate-image", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            scene,
            project: {
              genre:         project.genre,
              storyMemory:   project.storyMemory,
              visualContext: project.visualContext,
            },
            allScenes:  allScenes,
            sceneIndex: sceneIndex >= 0 ? sceneIndex : undefined,
            sceneId:    scene.id,
            tier,
          }),
        });

        const data = await res.json() as {
          ok: boolean; dataUrl?: string; error?: string;
          provider?: string; durationMs?: number; model?: string; bytes?: number; tier?: string;
        };

        if (data.ok && data.dataUrl) {
          setStatus(scene.id, { status: "done", provider: data.provider, ms: data.durationMs });
          onFrameReady(scene.id, data.dataUrl);
          // Phase 14 — quota bookkeeping
          bumpQuota("image", data.tier ?? tier);
          // Phase 13 — universal image store: mirror to Supabase + cache
          putImage({
            sceneId:    scene.id,
            projectId:  project.id,
            imageUrl:   data.dataUrl,
            prompt:     scene.imagePrompt,
            provider:   data.provider,
            model:      data.model,
            tier:       data.tier ?? tier,
            bytes:      data.bytes,
            durationMs: data.durationMs,
          }).catch(() => {});
        } else {
          setStatus(scene.id, { status: "failed", error: data.error ?? "Generation failed" });
        }
      } catch (err) {
        setStatus(scene.id, { status: "failed", error: err instanceof Error ? err.message : "Network error" });
      }
    }

    runningRef.current = false;
    setIsRunning(false);
  }, [project, onFrameReady, setStatus]);

  // ── Enqueue ───────────────────────────────────────────────────────────────
  const enqueue = useCallback((...scenes: Scene[]) => {
    scenes.forEach(s => {
      if (!queueRef.current.find(q => q.id === s.id)) {
        queueRef.current.push(s);
        setStatus(s.id, { status: "queued" });
      }
    });
    processQueue();
  }, [processQueue, setStatus]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Mark remaining queued as idle
    queueRef.current.forEach(s => setStatus(s.id, { status: "idle" }));
    queueRef.current = [];
  }, [setStatus]);

  const pending = Object.values(statuses).filter(
    s => s.status === "queued" || s.status === "generating"
  ).length;

  return { enqueue, statuses, isRunning, cancel, pending };
}
