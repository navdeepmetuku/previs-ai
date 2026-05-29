"use client";

/**
 * HeroScrollScene — 7-stage scroll-driven snowman animation.
 *
 * Stages (each triggered by one scroll unit = 1 × window.innerHeight):
 *   0  → Snowman at mountain base (static)
 *   1  → Climbs halfway up
 *   2  → Reaches the summit
 *   3  → Takes camera from pocket
 *   4  → Poses as cameraman (camera raised to face)
 *   5  → Speech bubble "Say cheese!" appears
 *   6  → White flash → onReveal() fires → hero content shows
 *
 * Implementation:
 *   - Pure CSS transitions + inline style interpolation
 *   - No Framer Motion, no GSAP — zero new dependencies
 *   - The component occupies 7 × 100vh of scroll space (sticky container)
 *   - After stage 6 completes, onReveal() is called once
 *   - Mountain and snowman are inline SVG — no external assets
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  onReveal: () => void;
}

// Easing function — ease-out cubic
function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

// Linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function HeroScrollScene({ onReveal }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const revealedRef   = useRef(false);

  // Stage: 0–6 (float, not integer — allows smooth interpolation between stages)
  const [stage,       setStage]       = useState(0);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [revealed,    setRevealed]    = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect     = container.getBoundingClientRect();
      const vh       = window.innerHeight;
      // How far we've scrolled into the sticky zone (0 = top, 7*vh = bottom)
      const scrolled = -rect.top;
      // Normalise to 0..7 (one unit per stage)
      const raw      = scrolled / vh;
      const clamped  = Math.max(0, Math.min(7, raw));

      setStage(clamped);

      // Stage 6+: trigger flash and reveal
      if (clamped >= 6 && !revealedRef.current) {
        revealedRef.current = true;
        // Flash in
        setFlashOpacity(1);
        setTimeout(() => {
          setFlashOpacity(0);
          setRevealed(true);
          onReveal();
        }, 400);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initial read
    return () => window.removeEventListener("scroll", onScroll);
  }, [onReveal]);

  // ── Derived animation values ──────────────────────────────────────────────

  // Snowman Y position: starts at bottom of mountain, climbs to peak
  // Stage 0→1: bottom → halfway (50% of mountain height)
  // Stage 1→2: halfway → peak
  const climbProgress = easeOut(Math.min(1, stage / 2)); // 0..1 over stages 0–2
  // Mountain peak is at ~30% from top of viewport, base at ~75%
  // We move the snowman from baseY to peakY
  const snowmanBaseY  = 68;  // % from top
  const snowmanPeakY  = 28;  // % from top
  const snowmanY      = lerp(snowmanBaseY, snowmanPeakY, climbProgress);

  // Snowman X: slight arc left as it climbs (mountain is centred)
  const snowmanX      = 50 + lerp(0, -2, climbProgress); // % from left

  // Camera appears at stage 3
  const cameraOpacity = easeOut(Math.max(0, Math.min(1, stage - 2)));
  // Camera raises to face at stage 4
  const cameraRaise   = easeOut(Math.max(0, Math.min(1, stage - 3)));
  // Camera Y offset: starts at waist, raises to face
  const cameraOffsetY = lerp(12, -8, cameraRaise); // px relative to snowman

  // Speech bubble at stage 5
  const bubbleOpacity = easeOut(Math.max(0, Math.min(1, stage - 4)));
  const bubbleScale   = lerp(0.7, 1, easeOut(Math.max(0, Math.min(1, stage - 4))));

  // Snowman tilt at stage 4 (cameraman pose)
  const snowmanTilt   = lerp(0, -8, easeOut(Math.max(0, Math.min(1, stage - 3))));

  return (
    <>
      {/* ── Scroll container — 7 × 100vh tall, sticky child ── */}
      <div
        ref={containerRef}
        style={{
          height:   "700vh",
          position: "relative",
          // Hide once revealed so it doesn't block the hero content
          display:  revealed ? "none" : "block",
        }}
      >
        {/* Sticky viewport — stays in view while user scrolls through 7 stages */}
        <div style={{
          position: "sticky",
          top:      0,
          height:   "100vh",
          width:    "100%",
          overflow: "hidden",
          background: "linear-gradient(180deg, #07070f 0%, #0c0c18 60%, #07070f 100%)",
        }}>

          {/* ── Mountain SVG ── */}
          <svg
            viewBox="0 0 800 500"
            preserveAspectRatio="xMidYMax meet"
            style={{
              position: "absolute",
              bottom:   0,
              left:     "50%",
              transform: "translateX(-50%)",
              width:    "min(900px, 120vw)",
              height:   "auto",
              pointerEvents: "none",
            }}
          >
            {/* Far mountain — lighter, behind */}
            <polygon
              points="200,500 400,120 600,500"
              fill="#0e0e1e"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
            {/* Main mountain — darker, in front */}
            <polygon
              points="120,500 400,60 680,500"
              fill="#0a0a16"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            {/* Snow cap */}
            <polygon
              points="370,90 400,60 430,90 415,105 385,105"
              fill="rgba(255,255,255,0.85)"
            />
            {/* Mountain edge highlight */}
            <line x1="120" y1="500" x2="400" y2="60" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
            <line x1="680" y1="500" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          </svg>

          {/* ── Snowman ── */}
          <div style={{
            position:  "absolute",
            left:      `${snowmanX}%`,
            top:       `${snowmanY}%`,
            transform: `translate(-50%, -50%) rotate(${snowmanTilt}deg)`,
            transition: "transform 0.1s ease-out",
            width:     64,
            height:    80,
            zIndex:    10,
          }}>
            <svg viewBox="0 0 64 80" width="64" height="80" fill="none">
              {/* Body */}
              <ellipse cx="32" cy="62" rx="14" ry="12" fill="rgba(248,250,252,0.90)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
              {/* Head */}
              <circle cx="32" cy="38" r="12" fill="rgba(248,250,252,0.92)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
              {/* Hat brim */}
              <ellipse cx="32" cy="27" rx="13" ry="2.5" fill="#1a2349" />
              {/* Hat body */}
              <rect x="22" y="14" width="20" height="14" rx="2" fill="#1a2349" />
              {/* Gold band */}
              <rect x="22" y="24" width="20" height="3" fill="#d4a843" />
              {/* Scarf */}
              <ellipse cx="32" cy="49" rx="10" ry="2.5" fill="#fbbf24" opacity="0.85" />
              {/* Eyes */}
              <circle cx="27.5" cy="36" r="1.8" fill="#0c1027" />
              <circle cx="36.5" cy="36" r="1.8" fill="#0c1027" />
              {/* Eye highlights */}
              <circle cx="28.2" cy="35.2" r="0.6" fill="white" opacity="0.8" />
              <circle cx="37.2" cy="35.2" r="0.6" fill="white" opacity="0.8" />
              {/* Smile */}
              <path d="M 27 41 Q 32 45 37 41" stroke="#0c1027" strokeWidth="1" fill="none" strokeLinecap="round" />
              {/* Left arm */}
              <line x1="18" y1="56" x2="10" y2="48" stroke="rgba(100,80,60,0.8)" strokeWidth="2" strokeLinecap="round" />
              {/* Right arm — raised when camera appears */}
              <line
                x1="46" y1="56"
                x2={46 + lerp(8, 4, cameraRaise)}
                y2={56 - lerp(8, 18, cameraRaise)}
                stroke="rgba(100,80,60,0.8)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

            {/* ── Camera ── */}
            <div style={{
              position:  "absolute",
              right:     -18,
              top:       cameraOffsetY,
              opacity:   cameraOpacity,
              transition: "top 0.3s ease-out, opacity 0.3s ease-out",
            }}>
              <svg viewBox="0 0 28 20" width="28" height="20" fill="none">
                {/* Camera body */}
                <rect x="2" y="5" width="22" height="14" rx="2" fill="#1a1a2e" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
                {/* Lens */}
                <circle cx="13" cy="12" r="5" fill="#0a0a14" stroke="rgba(74,127,167,0.6)" strokeWidth="1" />
                <circle cx="13" cy="12" r="3" fill="#050510" stroke="rgba(74,127,167,0.3)" strokeWidth="0.5" />
                <circle cx="13" cy="12" r="1.2" fill="rgba(74,127,167,0.4)" />
                {/* Viewfinder bump */}
                <rect x="8" y="2" width="8" height="4" rx="1" fill="#1a1a2e" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
                {/* Shutter button */}
                <circle cx="22" cy="7" r="1.5" fill="#e8b84b" opacity="0.8" />
              </svg>
            </div>
          </div>

          {/* ── Speech bubble ── */}
          <div style={{
            position:  "absolute",
            left:      "50%",
            top:       `${snowmanY - 14}%`,
            transform: `translate(-10%, -100%) scale(${bubbleScale})`,
            transformOrigin: "bottom left",
            opacity:   bubbleOpacity,
            transition: "opacity 0.2s ease-out",
            pointerEvents: "none",
          }}>
            <div style={{
              background:   "rgba(255,255,255,0.95)",
              borderRadius: 12,
              padding:      "8px 14px",
              position:     "relative",
              boxShadow:    "0 4px 20px rgba(0,0,0,0.4)",
            }}>
              <span style={{
                fontSize:      13,
                fontWeight:    700,
                color:         "#0a0a14",
                fontFamily:    "monospace",
                letterSpacing: "0.05em",
                whiteSpace:    "nowrap",
              }}>
                Say cheese! 📸
              </span>
              {/* Bubble tail */}
              <div style={{
                position:    "absolute",
                bottom:      -8,
                left:        20,
                width:       0,
                height:      0,
                borderLeft:  "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop:   "8px solid rgba(255,255,255,0.95)",
              }} />
            </div>
          </div>

          {/* ── Ambient gold glow at mountain peak ── */}
          <div style={{
            position:  "absolute",
            left:      "50%",
            top:       "28%",
            transform: "translate(-50%, -50%)",
            width:     200,
            height:    200,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(232,184,75,${lerp(0, 0.12, climbProgress)}) 0%, transparent 70%)`,
            pointerEvents: "none",
            filter:    "blur(20px)",
          }} />

          {/* ── Stage indicator dots (subtle) ── */}
          <div style={{
            position:  "absolute",
            bottom:    32,
            left:      "50%",
            transform: "translateX(-50%)",
            display:   "flex",
            gap:       6,
          }}>
            {[0,1,2,3,4,5,6].map(i => (
              <div key={i} style={{
                width:        i <= Math.floor(stage) ? 6 : 4,
                height:       i <= Math.floor(stage) ? 6 : 4,
                borderRadius: "50%",
                background:   i <= Math.floor(stage)
                  ? "rgba(232,184,75,0.7)"
                  : "rgba(255,255,255,0.15)",
                transition:   "all 0.3s ease",
              }} />
            ))}
          </div>

          {/* ── Scroll hint (fades out after stage 1) ── */}
          <div style={{
            position:  "absolute",
            bottom:    60,
            left:      "50%",
            transform: "translateX(-50%)",
            opacity:   Math.max(0, 1 - stage * 2),
            transition: "opacity 0.3s ease",
            textAlign: "center",
          }}>
            <p style={{
              fontSize:      9,
              fontFamily:    "monospace",
              color:         "rgba(255,255,255,0.30)",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
            }}>
              Scroll to continue
            </p>
            <div style={{
              margin:    "6px auto 0",
              width:     1,
              height:    24,
              background: "linear-gradient(180deg, rgba(255,255,255,0.25), transparent)",
              animation: "crane 1.5s ease-in-out infinite alternate",
            }} />
          </div>
        </div>
      </div>

      {/* ── White flash overlay ── */}
      {!revealed && (
        <div style={{
          position:   "fixed",
          inset:      0,
          background: "white",
          opacity:    flashOpacity,
          transition: flashOpacity > 0 ? "opacity 0.15s ease-in" : "opacity 0.4s ease-out",
          pointerEvents: flashOpacity > 0 ? "all" : "none",
          zIndex:     9998,
        }} />
      )}
    </>
  );
}
