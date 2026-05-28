"use client";

/**
 * Model Tier System (Phase 14) — Higgsfield/Gemini/Kiro-style.
 *
 * Users select a quality tier for image and VISH generation.
 * Each tier maps to a provider preference list. Generation cascades within
 * the tier, then optionally falls back to lower tiers if a tier is unavailable.
 *
 * Tier persistence: localStorage per project + global default.
 *
 * IMAGE TIERS:
 *   draft     → Pollinations FLUX (always free, slower)
 *   standard  → fal.ai FLUX-schnell → Pollinations
 *   premium   → Replicate FLUX-schnell → fal.ai → Pollinations
 *   hf        → HuggingFace FLUX-schnell → Pollinations
 *
 * VISH TIERS:
 *   flash → gemini-flash-latest (fast, generous quota)
 *   pro   → gemini-2.0-flash + gemini-2.5-pro fallback (higher reasoning)
 */

export type ImageTier = "draft" | "standard" | "premium" | "hf";
export type VishTier  = "flash" | "pro";

export interface TierSpec<T extends string> {
  id:          T;
  label:       string;
  blurb:       string;
  cost:        "free" | "free-credits" | "paid";
  badge:       string;     // emoji/symbol for the chip
  recommended?: boolean;
}

export const IMAGE_TIERS: TierSpec<ImageTier>[] = [
  { id: "draft",    label: "Draft",    badge: "◇", cost: "free",         blurb: "Pollinations FLUX · always free, no key",                  recommended: true },
  { id: "hf",       label: "Studio",   badge: "◈", cost: "free",         blurb: "HuggingFace FLUX-schnell · free 1k req/day"  },
  { id: "standard", label: "Standard", badge: "◉", cost: "free-credits", blurb: "fal.ai FLUX-schnell · uses your fal balance" },
  { id: "premium",  label: "Premium",  badge: "▣", cost: "free-credits", blurb: "Replicate FLUX-schnell · presentation quality"  },
];

export const VISH_TIERS: TierSpec<VishTier>[] = [
  { id: "flash", label: "Flash", badge: "⚡", cost: "free", blurb: "Gemini Flash · fast, generous free quota", recommended: true },
  { id: "pro",   label: "Pro",   badge: "✦",  cost: "free", blurb: "Gemini Pro · deeper reasoning, slower"  },
];

// ── Persistence ──────────────────────────────────────────────────────────────
const LS_GLOBAL_IMG  = "previslab_tier_image_global";
const LS_GLOBAL_VISH = "previslab_tier_vish_global";
const LS_PROJ_PREFIX = "previslab_tier_proj_";

function readLs<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return (v as T) || fallback;
  } catch { return fallback; }
}

function writeLs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch {}
}

// ── Image tier ───────────────────────────────────────────────────────────────
export function getImageTier(projectId?: string): ImageTier {
  if (projectId) {
    const v = readLs<ImageTier>(LS_PROJ_PREFIX + projectId + "_image", "" as ImageTier);
    if (v) return v;
  }
  return readLs<ImageTier>(LS_GLOBAL_IMG, "draft");
}

export function setImageTier(tier: ImageTier, projectId?: string): void {
  writeLs(LS_GLOBAL_IMG, tier);
  if (projectId) writeLs(LS_PROJ_PREFIX + projectId + "_image", tier);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("previslab:tier-changed", { detail: { kind: "image", tier, projectId } }));
  }
}

// ── VISH tier ────────────────────────────────────────────────────────────────
export function getVishTier(projectId?: string): VishTier {
  if (projectId) {
    const v = readLs<VishTier>(LS_PROJ_PREFIX + projectId + "_vish", "" as VishTier);
    if (v) return v;
  }
  return readLs<VishTier>(LS_GLOBAL_VISH, "flash");
}

export function setVishTier(tier: VishTier, projectId?: string): void {
  writeLs(LS_GLOBAL_VISH, tier);
  if (projectId) writeLs(LS_PROJ_PREFIX + projectId + "_vish", tier);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("previslab:tier-changed", { detail: { kind: "vish", tier, projectId } }));
  }
}

// ── Subscribe to tier changes ────────────────────────────────────────────────
export function onTierChanged(handler: (e: { kind: "image" | "vish"; tier: string; projectId?: string }) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (evt: Event) => {
    const ce = evt as CustomEvent;
    handler(ce.detail);
  };
  window.addEventListener("previslab:tier-changed", listener);
  return () => window.removeEventListener("previslab:tier-changed", listener);
}

// ── Quota tracking ───────────────────────────────────────────────────────────
//
// Light-touch counter. Each successful generation increments a counter
// per tier per day. Used for the "X used today" indicator.
const LS_QUOTA_PREFIX = "previslab_quota_";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function bumpQuota(kind: "image" | "vish", tier: string, by = 1): void {
  if (typeof window === "undefined") return;
  const k = `${LS_QUOTA_PREFIX}${kind}_${tier}_${todayKey()}`;
  try {
    const cur = parseInt(localStorage.getItem(k) ?? "0", 10) || 0;
    localStorage.setItem(k, String(cur + by));
  } catch {}
}

export function getQuota(kind: "image" | "vish", tier: string): number {
  if (typeof window === "undefined") return 0;
  const k = `${LS_QUOTA_PREFIX}${kind}_${tier}_${todayKey()}`;
  try {
    return parseInt(localStorage.getItem(k) ?? "0", 10) || 0;
  } catch { return 0; }
}
