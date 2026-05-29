"use client";

/**
 * VISH Mascot — the emotional identity of PREVIS AI.
 *
 * A minimal cinematic snowman: three circles, dot eyes, a small amber scarf,
 * and a floating idle animation. Intentionally low-detail — it reads as a
 * premium minimal character, not a cartoon.
 *
 * States:
 *   idle     — gentle float + slow breath
 *   thinking — rotating orbital dot, faster pulse
 *   speaking — mouth animates
 *   success  — amber glow burst
 *   error    — slight shake
 *
 * Design philosophy:
 *   The mascot uses SVG so it scales to any size without assets.
 *   Animation is pure CSS — no JavaScript animation libraries.
 *   It can be placed anywhere: empty states, loading, onboarding, VISH panel.
 */

import { useEffect, useState } from "react";

export type VishState = "idle" | "thinking" | "speaking" | "success" | "error";

interface Props {
  state?:   VishState;
  size?:    number;    // px — default 64
  className?: string;
}

const STATE_GLOW: Record<VishState, string> = {
  idle:     "rgba(251,191,36,0.12)",
  thinking: "rgba(147,197,253,0.18)",
  speaking: "rgba(251,191,36,0.22)",
  success:  "rgba(74,222,128,0.25)",
  error:    "rgba(248,113,113,0.22)",
};

const STATE_EYE: Record<VishState, string> = {
  idle:     "#fbbf24",
  thinking: "#93c5fd",
  speaking: "#fbbf24",
  success:  "#4ade80",
  error:    "#f87171",
};

export default function VishMascot({ state = "idle", size = 64, className = "" }: Props) {
  const [mouthOpen, setMouthOpen] = useState(false);

  // Mouth blink while speaking
  useEffect(() => {
    if (state !== "speaking") { setMouthOpen(false); return; }
    const interval = setInterval(() => setMouthOpen(o => !o), 280);
    return () => clearInterval(interval);
  }, [state]);

  const r  = size / 2;
  const glow = STATE_GLOW[state];
  const eyeColor = STATE_EYE[state];

  // Proportional measurements
  const bodyR   = r * 0.42;
  const headR   = r * 0.30;
  const baseR   = r * 0.20;
  const cx      = r;
  const baseY   = size - baseR - 2;
  const bodyY   = baseY - bodyR - headR * 0.4;
  const headY   = bodyY - bodyR - headR * 0.6;

  return (
    <div
      className={[
        "relative inline-flex items-center justify-center",
        state === "idle"     ? "vish-float"   : "",
        state === "thinking" ? "vish-think"   : "",
        state === "error"    ? "vish-shake"   : "",
        className,
      ].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`VISH — ${state}`}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 50% 65%, ${glow} 0%, transparent 70%)`,
          filter: "blur(8px)",
        }}
      />

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10"
      >
        {/* ── Base ── */}
        <ellipse
          cx={cx}
          cy={baseY + baseR * 0.3}
          rx={baseR * 1.1}
          ry={baseR * 0.35}
          fill="rgba(255,255,255,0.06)"
        />

        {/* ── Body ── */}
        <circle
          cx={cx}
          cy={bodyY}
          r={bodyR}
          fill="rgba(248,250,252,0.88)"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.5"
        />
        {/* Body shading */}
        <circle
          cx={cx + bodyR * 0.3}
          cy={bodyY - bodyR * 0.2}
          r={bodyR * 0.6}
          fill="rgba(255,255,255,0.06)"
        />

        {/* ── Scarf (amber) ── */}
        <ellipse
          cx={cx}
          cy={headY + headR * 0.9}
          rx={headR * 0.85}
          ry={headR * 0.18}
          fill="#fbbf24"
          opacity="0.85"
        />
        {/* Scarf knot */}
        <circle
          cx={cx + headR * 0.4}
          cy={headY + headR * 0.9}
          r={headR * 0.14}
          fill="#f59e0b"
        />

        {/* ── Head ── */}
        <circle
          cx={cx}
          cy={headY}
          r={headR}
          fill="rgba(248,250,252,0.92)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.5"
        />
        {/* Head shading */}
        <circle
          cx={cx + headR * 0.3}
          cy={headY - headR * 0.25}
          r={headR * 0.55}
          fill="rgba(255,255,255,0.07)"
        />

        {/* ── Eyes ── */}
        <circle
          cx={cx - headR * 0.32}
          cy={headY - headR * 0.15}
          r={headR * 0.13}
          fill={eyeColor}
          className={[
            "vish-eye transition-colors duration-300",
            state === "idle" || state === "thinking" || state === "speaking"
              ? "vish-eye-blink-l"
              : "",
          ].join(" ")}
        />
        <circle
          cx={cx + headR * 0.32}
          cy={headY - headR * 0.15}
          r={headR * 0.13}
          fill={eyeColor}
          className={[
            "vish-eye transition-colors duration-300",
            state === "idle" || state === "thinking" || state === "speaking"
              ? "vish-eye-blink-r"
              : "",
          ].join(" ")}
        />
        {/* Eye shine */}
        <circle cx={cx - headR * 0.28} cy={headY - headR * 0.20} r={headR * 0.04} fill="white" opacity="0.8" />
        <circle cx={cx + headR * 0.36} cy={headY - headR * 0.20} r={headR * 0.04} fill="white" opacity="0.8" />

        {/* ── Mouth ── */}
        {mouthOpen ? (
          <ellipse
            cx={cx}
            cy={headY + headR * 0.30}
            rx={headR * 0.20}
            ry={headR * 0.12}
            fill="rgba(30,30,40,0.7)"
          />
        ) : (
          <path
            d={`M ${cx - headR * 0.22} ${headY + headR * 0.26} Q ${cx} ${headY + headR * 0.40} ${cx + headR * 0.22} ${headY + headR * 0.26}`}
            stroke="rgba(100,100,120,0.7)"
            strokeWidth="0.8"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* ── Thinking orbital ── */}
        {state === "thinking" && (
          <circle
            cx={cx + headR * 1.1}
            cy={headY - headR * 0.8}
            r={headR * 0.12}
            fill="#93c5fd"
            className="vish-orbit"
          />
        )}
      </svg>
    </div>
  );
}
