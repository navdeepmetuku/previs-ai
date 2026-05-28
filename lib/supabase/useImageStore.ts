"use client";

/**
 * useImageStore — React hook to subscribe to a single scene's image.
 *
 * Returns the latest image URL for a sceneId. Auto-updates when:
 *   - put() is called from anywhere (e.g. generation completes in PREVIS SPACE,
 *     Studio storyboard updates immediately)
 *   - hydrateProject() loads from Supabase
 *   - remove() is called
 *
 * Falls back to scene.imageUrl prop if store has no entry yet.
 */

import { useState, useEffect } from "react";
import { get, subscribe, type StoredImage } from "./image-store";

export function useImageStore(sceneId: string, fallbackUrl: string | null = null): {
  imageUrl: string | null;
  image:    StoredImage | null;
} {
  const [image, setImage] = useState<StoredImage | null>(() => get(sceneId));

  useEffect(() => {
    // Sync immediately on mount and on sceneId change
    setImage(get(sceneId));

    const unsub = subscribe((id, img) => {
      if (id === sceneId) setImage(img);
    });
    return unsub;
  }, [sceneId]);

  return {
    imageUrl: image?.imageUrl ?? fallbackUrl,
    image,
  };
}

/** Hydrate a project's images on mount — call once at the page level. */
export function useHydrateProject(projectId: string | null | undefined): void {
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    import("./image-store").then(m => {
      if (cancelled) return;
      m.hydrateProject(projectId).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [projectId]);
}
