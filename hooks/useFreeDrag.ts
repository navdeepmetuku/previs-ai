"use client";

/**
 * useFreeDrag — Chrome-tab / Figma / Blender style free-form draggable panel.
 *
 * Phase 16 upgraded engine:
 *   - True free X+Y movement (no row/grid snap, no axis lock)
 *   - Direct transform writes (bypass React state during drag = 60fps)
 *   - Velocity-tracked inertia after release
 *   - Soft-clamp on rest so panel stays grabbable
 *   - z-index focus: clicking any panel brings it to front
 *   - Position persisted to localStorage per panelId
 *   - Survives window resize via re-clamp
 *
 * Usage:
 *   const { panelRef, handleProps, focus, isDragging } = useFreeDrag({
 *     panelId: "vish-panel",
 *     defaultX: 100, defaultY: 100,
 *     anchor: "bottom-right",
 *     width: 360, height: 540,
 *   });
 *   <div ref={panelRef} {...positionStyle}>
 *     <header {...handleProps}>drag me</header>
 *   </div>
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "previslab_panel_pos_";
let _zCounter = 100;

type Anchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface Options {
  panelId:    string;
  defaultX:   number;
  defaultY:   number;
  anchor?:    Anchor;
  width?:     number;
  height?:    number;
  /** Min visible pixels of the panel after release (prevents losing it offscreen) */
  safetyPx?:  number;
  /** Inertia decay factor [0..1]; 0.92 ≈ ~1s glide */
  friction?:  number;
  /** Disable inertia */
  noInertia?: boolean;
}

interface PersistedState {
  x: number;
  y: number;
  z?: number;
  minimized?: boolean;
}

function readLs(panelId: string): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + panelId);
    return raw ? JSON.parse(raw) as PersistedState : null;
  } catch { return null; }
}

function writeLs(panelId: string, state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + panelId, JSON.stringify(state));
  } catch {}
}

function softClamp(x: number, y: number, w: number, h: number, safety = 24): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(safety - w, Math.min(x, vw - safety)),
    y: Math.max(safety - h, Math.min(y, vh - safety)),
  };
}

function defaultsToPx(d: { x: number; y: number; anchor?: Anchor }, w: number, h: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x: d.x, y: d.y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const a = d.anchor ?? "top-left";
  let x = d.x;
  let y = d.y;
  if (a.endsWith("right"))    x = vw - d.x - w;
  if (a.startsWith("bottom")) y = vh - d.y - h;
  return softClamp(x, y, w, h);
}

export function useFreeDrag(opts: Options) {
  const w = opts.width ?? 320;
  const h = opts.height ?? 80;
  const friction = opts.friction ?? 0.92;
  const safety   = opts.safetyPx ?? 24;

  // Stable initial position
  const initial = useRef<{ x: number; y: number; z: number; minimized: boolean }>(null!);
  if (!initial.current) {
    if (typeof window !== "undefined") {
      const saved = readLs(opts.panelId);
      if (saved) {
        const c = softClamp(saved.x, saved.y, w, h, safety);
        initial.current = { x: c.x, y: c.y, z: saved.z ?? ++_zCounter, minimized: !!saved.minimized };
      } else {
        const px = defaultsToPx({ x: opts.defaultX, y: opts.defaultY, anchor: opts.anchor }, w, h);
        initial.current = { x: px.x, y: px.y, z: ++_zCounter, minimized: false };
      }
    } else {
      initial.current = { x: opts.defaultX, y: opts.defaultY, z: 100, minimized: false };
    }
  }

  // Live position lives in refs; React renders only on rest/minimize/focus.
  const panelRef    = useRef<HTMLDivElement | null>(null);
  const xRef        = useRef(initial.current.x);
  const yRef        = useRef(initial.current.y);
  const vxRef       = useRef(0);
  const vyRef       = useRef(0);
  const lastTimeRef = useRef(0);
  const draggingRef = useRef(false);
  const dragOffRef  = useRef<{ dx: number; dy: number } | null>(null);
  const inertiaRafRef = useRef<number | null>(null);

  const [zIndex,    setZIndex]    = useState(initial.current.z);
  const [minimized, setMinimized] = useState(initial.current.minimized);
  const [isDragging, setIsDragging] = useState(false);
  // Tick to force re-render after settle so React-driven style sees the final position
  const [, setTick] = useState(0);

  // Apply position via direct DOM transform — bypasses React reconciliation
  const applyTransform = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.left = `${xRef.current}px`;
    el.style.top  = `${yRef.current}px`;
  }, []);

  const persist = useCallback((deb = 200) => {
    if (typeof window === "undefined") return;
    if (persist.timer) clearTimeout(persist.timer);
    persist.timer = setTimeout(() => {
      writeLs(opts.panelId, {
        x: xRef.current, y: yRef.current,
        z: zIndex, minimized,
      });
    }, deb);
  }, [opts.panelId, zIndex, minimized]) as ((deb?: number) => void) & { timer?: ReturnType<typeof setTimeout> };

  // ── Focus (bring to front) ─────────────────────────────────────────────────
  const focus = useCallback(() => {
    setZIndex(z => {
      const nz = Math.max(z, ++_zCounter);
      return nz;
    });
  }, []);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [data-no-drag]")) return;
    e.preventDefault();
    e.stopPropagation();

    // Cancel inertia immediately
    if (inertiaRafRef.current !== null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    vxRef.current = 0;
    vyRef.current = 0;

    focus();
    dragOffRef.current = {
      dx: e.clientX - xRef.current,
      dy: e.clientY - yRef.current,
    };
    draggingRef.current = true;
    setIsDragging(true);
    lastTimeRef.current = performance.now();

    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
  }, [focus]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !dragOffRef.current) return;
    const now = performance.now();
    const dt  = Math.max(1, now - lastTimeRef.current);

    const newX = e.clientX - dragOffRef.current.dx;
    const newY = e.clientY - dragOffRef.current.dy;

    // Velocity tracking (px/ms) for inertia
    vxRef.current = (newX - xRef.current) / dt;
    vyRef.current = (newY - yRef.current) / dt;

    xRef.current = newX;
    yRef.current = newY;
    lastTimeRef.current = now;

    applyTransform();
  }, [applyTransform]);

  // Inertia loop — runs after pointerUp
  const startInertia = useCallback(() => {
    if (opts.noInertia) {
      const c = softClamp(xRef.current, yRef.current, w, h, safety);
      xRef.current = c.x; yRef.current = c.y;
      applyTransform();
      persist(0);
      setTick(t => t + 1);
      return;
    }

    const speed = Math.hypot(vxRef.current, vyRef.current);
    if (speed < 0.05) {
      const c = softClamp(xRef.current, yRef.current, w, h, safety);
      xRef.current = c.x; yRef.current = c.y;
      applyTransform();
      persist(0);
      setTick(t => t + 1);
      return;
    }

    const step = () => {
      // Apply velocity (scaled by ~16ms frame budget)
      xRef.current += vxRef.current * 16;
      yRef.current += vyRef.current * 16;

      // Decay
      vxRef.current *= friction;
      vyRef.current *= friction;

      applyTransform();

      const remaining = Math.hypot(vxRef.current, vyRef.current);
      if (remaining > 0.05) {
        inertiaRafRef.current = requestAnimationFrame(step);
      } else {
        // Settle — soft-clamp to keep panel grabbable
        inertiaRafRef.current = null;
        const c = softClamp(xRef.current, yRef.current, w, h, safety);
        if (c.x !== xRef.current || c.y !== yRef.current) {
          // Animate the clamp-back over ~150ms
          const startX = xRef.current, startY = yRef.current;
          const dx = c.x - startX, dy = c.y - startY;
          const t0 = performance.now();
          const D  = 150;
          const ease = (t: number) => 1 - Math.pow(1 - t, 3);
          const back = () => {
            const elapsed = performance.now() - t0;
            const t = Math.min(1, elapsed / D);
            const e = ease(t);
            xRef.current = startX + dx * e;
            yRef.current = startY + dy * e;
            applyTransform();
            if (t < 1) requestAnimationFrame(back);
            else { persist(0); setTick(tk => tk + 1); }
          };
          requestAnimationFrame(back);
        } else {
          persist(0);
          setTick(t => t + 1);
        }
      }
    };

    inertiaRafRef.current = requestAnimationFrame(step);
  }, [applyTransform, friction, w, h, safety, opts.noInertia, persist]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dragOffRef.current = null;
    setIsDragging(false);
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch {}
    startInertia();
  }, [startInertia]);

  const toggleMinimized = useCallback(() => {
    setMinimized(m => !m);
    persist(0);
  }, [persist]);

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    try { localStorage.removeItem(STORAGE_PREFIX + opts.panelId); } catch {}
    const px = defaultsToPx({ x: opts.defaultX, y: opts.defaultY, anchor: opts.anchor }, w, h);
    xRef.current = px.x; yRef.current = px.y;
    applyTransform();
    setMinimized(false);
    setTick(t => t + 1);
  }, [opts.panelId, opts.defaultX, opts.defaultY, opts.anchor, w, h, applyTransform]);

  // Window resize — re-clamp so panel stays grabbable
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const c = softClamp(xRef.current, yRef.current, w, h, safety);
      if (c.x !== xRef.current || c.y !== yRef.current) {
        xRef.current = c.x; yRef.current = c.y;
        applyTransform();
        setTick(t => t + 1);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [w, h, safety, applyTransform]);

  // Cancel inertia on unmount
  useEffect(() => {
    return () => {
      if (inertiaRafRef.current !== null) cancelAnimationFrame(inertiaRafRef.current);
    };
  }, []);

  // React-resetable state for callers
  return {
    panelRef,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      "data-drag-handle": true,
      style: { touchAction: "none" as const, userSelect: "none" as const, cursor: isDragging ? "grabbing" : "grab" },
    },
    isDragging,
    minimized,
    toggleMinimized,
    reset,
    focus,
    zIndex,
    /** Read-only — current pixel position (for headers / debugging) */
    getPosition: () => ({ x: xRef.current, y: yRef.current }),
    /** Initial computed position for the inline style */
    initialX: initial.current.x,
    initialY: initial.current.y,
  };
}

/** Reset every saved panel position. */
export function resetAllPanelPositions(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
  window.dispatchEvent(new CustomEvent("previslab:panels-reset"));
}

export function onPanelsReset(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("previslab:panels-reset", handler);
  return () => window.removeEventListener("previslab:panels-reset", handler);
}
