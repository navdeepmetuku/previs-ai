"use client";

/**
 * useScrollProgress — tracks window scroll position.
 *
 * Returns:
 *   scrollY        — raw pixel scroll from top
 *   scrollProgress — 0..1 normalised over the full scrollable height
 *
 * Uses passive event listener for 60fps performance.
 * Safe to call on server (returns 0 values until mounted).
 */

import { useState, useEffect } from "react";

export function useScrollProgress() {
  const [scrollY,        setScrollY]        = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const y   = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollY(y);
      setScrollProgress(max > 0 ? Math.min(1, y / max) : 0);
    };

    update(); // initial read
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return { scrollY, scrollProgress };
}
