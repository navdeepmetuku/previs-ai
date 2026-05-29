"use client";

/**
 * SceneCard3D — physical floating storyboard panel.
 *
 * Geometry:
 *   - Front face  — textured display plane (DoubleSide)
 *   - Body slab   — thin BoxGeometry gives physical thickness (~8mm)
 *   - Back panel  — dark matte face visible from behind
 *   - Border ring — subtle dark frame separating card from grey bg
 *
 * Interaction:
 *   - Click to select  → orbit target shifts to this card
 *   - Hover lift       → card rises 0.22u
 *   - Delete button    → Html overlay, visible on hover/select
 *   - Selection glow   → amber outline + brighter emissive
 *
 * Placeholder:
 *   Canvas 2D texture generated locally — mood-coded, always readable.
 *   No network calls, no blank planes.
 */

import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Scene } from "@/types";
import { useImageStore } from "@/lib/supabase/useImageStore";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  scene:      Scene;
  position:   [number, number, number];
  isSelected: boolean;
  onSelect:   () => void;
  onDelete:   () => void;
  onView3D?:  () => void;
  is3DMode?:  boolean;
}

// ── Mood palette ──────────────────────────────────────────────────────────────

interface MoodPalette { bg1: string; bg2: string; accent: string; label: string; }

const MOOD_PALETTE: Record<string, MoodPalette> = {
  Tense:       { bg1: "#3d0a06", bg2: "#0a0000", accent: "#ff3311", label: "TENSE"       },
  Dramatic:    { bg1: "#200535", bg2: "#06010e", accent: "#aa44ff", label: "DRAMATIC"    },
  Romantic:    { bg1: "#2e0618", bg2: "#0a0208", accent: "#ff5588", label: "ROMANTIC"    },
  Action:      { bg1: "#2a1400", bg2: "#0a0400", accent: "#ff8800", label: "ACTION"      },
  Mysterious:  { bg1: "#060422", bg2: "#010108", accent: "#3366ff", label: "MYSTERIOUS"  },
  Melancholic: { bg1: "#061528", bg2: "#010408", accent: "#4488cc", label: "MELANCHOLIC" },
  Triumphant:  { bg1: "#1c1400", bg2: "#060400", accent: "#ffcc00", label: "TRIUMPHANT"  },
  Horror:      { bg1: "#050505", bg2: "#000000", accent: "#00cc44", label: "HORROR"      },
  Comedic:     { bg1: "#061c0a", bg2: "#010602", accent: "#44ee88", label: "COMEDIC"     },
  Serene:      { bg1: "#041620", bg2: "#01080a", accent: "#00cccc", label: "SERENE"      },
};

const DEFAULT_PALETTE: MoodPalette = {
  bg1: "#0a0a1a", bg2: "#020208", accent: "#fbbf24", label: "SCENE",
};

// ── Canvas placeholder ────────────────────────────────────────────────────────

// Higher resolution for crispness; 16:9 aspect — texture upload is one-time
// per card so this doesn't hurt runtime perf.
const CW = 1024;
const CH = 576;

function createPlaceholder(scene: Scene): THREE.CanvasTexture {
  const cv  = document.createElement("canvas");
  cv.width  = CW; cv.height = CH;
  const ctx = cv.getContext("2d")!;
  const pal = MOOD_PALETTE[scene.mood] ?? DEFAULT_PALETTE;

  // Base radial gradient
  const g = ctx.createRadialGradient(CW*.5, CH*.45, CH*.05, CW*.5, CH*.5, CW*.72);
  g.addColorStop(0,   pal.bg1);
  g.addColorStop(0.6, blend(pal.bg1, pal.bg2, 0.5));
  g.addColorStop(1,   pal.bg2);
  ctx.fillStyle = g; ctx.fillRect(0,0,CW,CH);

  // Vignette
  const v = ctx.createRadialGradient(CW*.5,CH*.5,CH*.1,CW*.5,CH*.5,CW*.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(0.65,"rgba(0,0,0,0.2)");
  v.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = v; ctx.fillRect(0,0,CW,CH);

  // Scanlines
  ctx.save(); ctx.globalAlpha=0.035; ctx.fillStyle="#000";
  for (let y=0;y<CH;y+=2) ctx.fillRect(0,y,CW,1);
  ctx.restore();

  // Rule-of-thirds guides
  ctx.save(); ctx.globalAlpha=0.07; ctx.strokeStyle="#fff";
  ctx.lineWidth=1; ctx.setLineDash([8,16]);
  [CW/3,CW*2/3].forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke();});
  [CH/3,CH*2/3].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke();});
  ctx.restore();

  // Accent glow
  const gx = CW*(0.3+Math.sin(scene.order*1.3)*0.25), gy = CH*0.28;
  const gl = ctx.createRadialGradient(gx,gy,2,gx,gy,CH*.55);
  gl.addColorStop(0, rgba(pal.accent,0.22));
  gl.addColorStop(0.4,rgba(pal.accent,0.07));
  gl.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=gl; ctx.fillRect(0,0,CW,CH);

  // Lens flare dot
  ctx.save(); ctx.globalAlpha=0.5;
  const fl=ctx.createRadialGradient(gx,gy,0,gx,gy,12);
  fl.addColorStop(0,rgba(pal.accent,0.9)); fl.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=fl; ctx.fillRect(gx-20,gy-20,40,40);
  ctx.restore();

  // Letterbox
  const lb = Math.floor(CH*0.09);
  ctx.fillStyle="#000";
  ctx.fillRect(0,0,CW,lb); ctx.fillRect(0,CH-lb,CW,lb);

  // Corner brackets
  ctx.save(); ctx.globalAlpha=0.55;
  ctx.strokeStyle=rgba(pal.accent,0.7); ctx.lineWidth=3; ctx.setLineDash([]);
  const M=24,L=36;
  ([
    [M,M+lb,M+L,M+lb,M,M+lb+L],
    [CW-M,M+lb,CW-M-L,M+lb,CW-M,M+lb+L],
    [M,CH-M-lb,M+L,CH-M-lb,M,CH-M-lb-L],
    [CW-M,CH-M-lb,CW-M-L,CH-M-lb,CW-M,CH-M-lb-L],
  ] as [number,number,number,number,number,number][]).forEach(([ax,ay,bx,by,cx,cy])=>{
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);
    ctx.moveTo(ax,ay);ctx.lineTo(cx,cy);ctx.stroke();
  });
  ctx.restore();

  // Scene number badge
  ctx.save();
  ctx.fillStyle=pal.accent;
  rr(ctx,M,lb+12,64,36,3); ctx.fill();
  ctx.fillStyle="#000"; ctx.font="bold 20px monospace";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(String(scene.order).padStart(2,"0"),M+32,lb+30);
  ctx.restore();

  // Shot type badge
  ctx.save();
  const ab=abbr(scene.shotType);
  ctx.font="bold 16px monospace"; ctx.textAlign="right"; ctx.textBaseline="top";
  ctx.globalAlpha=0.7;
  const sw=ctx.measureText(ab).width+16;
  ctx.fillStyle="rgba(0,0,0,0.6)"; rr(ctx,CW-M-sw,lb+12,sw,32,3); ctx.fill();
  ctx.fillStyle=rgba(pal.accent,0.9);
  ctx.fillText(ab,CW-M-8,lb+16);
  ctx.restore();

  // Title lower-third
  ctx.save();
  const ty=CH-lb-68;
  const sc=ctx.createLinearGradient(0,ty-36,0,CH-lb);
  sc.addColorStop(0,"rgba(0,0,0,0)"); sc.addColorStop(0.4,"rgba(0,0,0,0.55)"); sc.addColorStop(1,"rgba(0,0,0,0.75)");
  ctx.fillStyle=sc; ctx.fillRect(0,ty-36,CW,CH-lb-(ty-36));
  ctx.font="600 26px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="bottom";
  ctx.fillStyle="rgba(255,255,255,0.92)"; ctx.shadowColor="rgba(0,0,0,0.8)"; ctx.shadowBlur=12;
  ctx.fillText(trunc(ctx,scene.title,CW-64),CW/2,ty);
  ctx.restore();

  // Mood label
  ctx.save(); ctx.font="700 14px monospace"; ctx.textAlign="left"; ctx.textBaseline="bottom";
  ctx.fillStyle=rgba(pal.accent,0.65); ctx.fillText(pal.label,M,CH-lb-16); ctx.restore();

  // Location label
  ctx.save(); ctx.font="400 14px monospace"; ctx.textAlign="right"; ctx.textBaseline="bottom";
  ctx.fillStyle="rgba(255,255,255,0.28)";
  ctx.fillText(trunc(ctx,scene.location.toUpperCase(),CW*.45),CW-M,CH-lb-16);
  ctx.restore();

  // Accent line
  ctx.save(); ctx.globalAlpha=0.4; ctx.strokeStyle=pal.accent; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(M,CH-lb-8); ctx.lineTo(CW-M,CH-lb-8); ctx.stroke();
  ctx.restore();

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace      = THREE.SRGBColorSpace;
  t.minFilter       = THREE.LinearMipMapLinearFilter;
  t.magFilter       = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy      = 8;
  return t;
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function rgba(hex: string, a: number) {
  const h=hex.replace("#","");
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
}

function blend(a: string, b: string, t: number) {
  const ah=a.replace("#",""), bh=b.replace("#","");
  const r=Math.round(parseInt(ah.slice(0,2),16)*(1-t)+parseInt(bh.slice(0,2),16)*t);
  const g=Math.round(parseInt(ah.slice(2,4),16)*(1-t)+parseInt(bh.slice(2,4),16)*t);
  const bl=Math.round(parseInt(ah.slice(4,6),16)*(1-t)+parseInt(bh.slice(4,6),16)*t);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${bl.toString(16).padStart(2,"0")}`;
}

function abbr(type: string) {
  const M: Record<string,string> = {
    "Extreme Wide Shot":"EWS","Wide Shot":"WS","Medium Shot":"MS","Close-Up":"CU",
    "Extreme Close-Up":"ECU","Over-the-Shoulder":"OTS","POV Shot":"POV",
    "Dutch Angle":"DUTCH","Aerial Shot":"AERIAL",
  };
  return M[type] ?? type.slice(0,4).toUpperCase();
}

function trunc(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width<=maxW) return text;
  let t=text;
  while (t.length>3 && ctx.measureText(t+"…").width>maxW) t=t.slice(0,-1);
  return t+"…";
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// ── Emissive map ──────────────────────────────────────────────────────────────

const MOOD_EMISSIVE: Record<string,string> = {
  Tense:"#1a0404",Dramatic:"#0d0312",Romantic:"#1a0508",Action:"#1a0a00",
  Mysterious:"#04040e",Melancholic:"#04090e",Triumphant:"#110d00",
  Horror:"#040404",Comedic:"#040a04",Serene:"#040a0e",
};

// ── Dimensions ────────────────────────────────────────────────────────────────

const W       = 3.2;
const H       = 1.8;
const DEPTH   = 0.08;  // physical thickness of card slab

// ── Component ─────────────────────────────────────────────────────────────────

export default function SceneCard3D({ scene, position, isSelected, onSelect, onDelete, onView3D, is3DMode }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentY = useRef(position[1]);

  // Placeholder texture — generated once, zero network
  const placeholderTex = useMemo(
    () => createPlaceholder(scene),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene.id, scene.mood, scene.order],
  );

  // Real image texture — draw via canvas for reliable WebGL upload.
  // Tracks the texture in a ref so cleanup only disposes what THIS effect created,
  // preventing the race where cleanup disposes a texture created by a newer effect.
  const [imageTex, setImageTex] = useState<THREE.Texture | null>(null);
  const imageTexRef = useRef<THREE.Texture | null>(null);
  const lastUrlRef  = useRef<string | null>(null);

  // Phase 13 — prefer image-store URL (cross-view sync) over scene.imageUrl prop
  const { imageUrl: effectiveUrl } = useImageStore(scene.id, scene.imageUrl);

  useEffect(() => {
    // Dedup — if URL hasn't changed, do nothing (prevents texture flicker
    // when the parent re-renders for unrelated reasons)
    if (effectiveUrl === lastUrlRef.current) return;
    lastUrlRef.current = effectiveUrl;

    if (!effectiveUrl) {
      // Don't dispose — keep showing whatever we last had (placeholder or older image).
      // Disposal happens on unmount only.
      return;
    }

    let cancelled = false;
    const img = new Image();
    // Allow cross-origin CDN images (Supabase, fal.ai, replicate.delivery)
    img.crossOrigin = "anonymous";
    img.decoding    = "async";

    img.onload = async () => {
      if (cancelled) return;

      // Wait for decode to complete (avoids partial-frame upload to GPU)
      try { await img.decode?.(); } catch {}
      if (cancelled) return;

      // Pick best-fit resolution — preserve actual image quality but cap at 2048
      // to avoid WebGL texture-size limits on lower-end GPUs.
      const maxDim = 2048;
      const sw = img.naturalWidth  || 1024;
      const sh = img.naturalHeight || 576;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const tw = Math.max(1, Math.round(sw * scale));
      const th = Math.max(1, Math.round(sh * scale));

      const canvas = document.createElement("canvas");
      canvas.width  = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx || cancelled) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, tw, th);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace      = THREE.SRGBColorSpace;
      tex.minFilter       = THREE.LinearMipMapLinearFilter;
      tex.magFilter       = THREE.LinearFilter;
      tex.generateMipmaps = true;          // mipmaps prevent shimmering at distance
      tex.anisotropy      = 8;              // crisp at angle (capped at GPU max)
      tex.needsUpdate     = true;

      // Dispose previous before storing new — only after we have the new one ready
      const prev = imageTexRef.current;
      imageTexRef.current = tex;
      if (prev && prev !== tex) prev.dispose();

      setImageTex(tex);
    };

    img.onerror = () => {
      if (cancelled) return;
      console.warn(`[SceneCard3D] image load failed scene=${scene.id.slice(0, 8)} url=${effectiveUrl.slice(0, 60)}`);
      // Keep last good texture — don't null out → no black flash
    };
    img.src = effectiveUrl;

    return () => {
      cancelled = true;
      // Do NOT dispose imageTexRef here — the texture may still be committed
      // to the material. Disposal happens when the next texture is ready (above)
      // or on component unmount (below).
    };
  }, [effectiveUrl, scene.id]);

  // Dispose image texture on unmount only
  useEffect(() => {
    return () => { imageTexRef.current?.dispose(); imageTexRef.current = null; };
  }, []);

  // Dispose placeholder on unmount.
  // Placeholder is recomputed on scene.id/mood/order change — those are stable
  // per scene so the new placeholder lifecycle is short. We dispose only on
  // unmount to avoid the race where the swap happens mid-frame.
  useEffect(() => {
    const tex = placeholderTex;
    return () => { tex.dispose(); };
  }, [placeholderTex]);

  // Dismiss confirm-delete if deselected/unhovered
  useEffect(() => {
    if (!hovered && !isSelected) setConfirmDelete(false);
  }, [hovered, isSelected]);

  // Emissives
  const selEmissive  = useMemo(() => new THREE.Color("#fbbf24"), []);
  const moodEmissive = useMemo(
    () => new THREE.Color(MOOD_EMISSIVE[scene.mood] ?? "#0a0a1a"),
    [scene.mood],
  );

  // Animation
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const liftTarget = (hovered || isSelected) ? position[1] + 0.22 : position[1];
    currentY.current = THREE.MathUtils.lerp(currentY.current, liftTarget, delta * 7);
    const bob = (!hovered && !isSelected)
      ? Math.sin(Date.now() * 0.0005 + position[0] * 0.9) * 0.010
      : 0;
    groupRef.current.position.y = currentY.current + bob;
  });

  // Sticky display texture — once a real image is loaded, keep showing it
  // even if the URL transiently changes. Only the loader effect can swap
  // imageTexRef. This prevents the "image → placeholder → image" flicker
  // that happens when parent re-renders and React batches setState.
  const displayTex = imageTex ?? placeholderTex;

  // Single source of truth for material map — imperative only.
  // Avoids the fragile dual-write (R3F prop reconciler + imperative effect).
  // Only update when the texture actually changes — not every render.
  const lastDisplayTexRef = useRef<THREE.Texture | null>(null);
  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    if (lastDisplayTexRef.current === displayTex) return;  // dedup
    lastDisplayTexRef.current = displayTex;
    mat.map = displayTex;
    mat.needsUpdate = true;
  }, [displayTex]);
  const emissive          = isSelected ? selEmissive : moodEmissive;
  const emissiveIntensity = isSelected ? 0.20 : hovered ? 0.10 : 0.04;
  const accentColor       = MOOD_PALETTE[scene.mood]?.accent ?? "#fbbf24";
  const showUI            = hovered || isSelected;

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* ── Front face — textured, double-sided ── */}
      <mesh position={[0, 0, DEPTH / 2]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          ref={matRef}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.72}
          metalness={0.04}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Physical card body — gives thickness from any angle ── */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[W + 0.04, H + 0.04, DEPTH]} />
        <meshStandardMaterial
          color="#14141f"
          roughness={0.85}
          metalness={0.10}
        />
      </mesh>

      {/* ── Back face — dark matte panel ── */}
      <mesh position={[0, 0, -DEPTH / 2]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          color="#1c1c2c"
          roughness={0.90}
          metalness={0.05}
          side={THREE.BackSide}
        />
      </mesh>

      {/* ── Selection amber outline ── */}
      {isSelected && (
        <mesh position={[0, 0, DEPTH / 2 + 0.001]}>
          <planeGeometry args={[W + 0.10, H + 0.10]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.28} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* ── Hover/select edge rim ── */}
      {showUI && (
        <mesh position={[0, 0, DEPTH / 2 + 0.002]}>
          <planeGeometry args={[W + 0.04, H + 0.04]} />
          <meshBasicMaterial
            color={isSelected ? "#fbbf24" : accentColor}
            transparent
            opacity={isSelected ? 0.16 : 0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* ── Metadata tag below card ── */}
      {showUI && (
        <group position={[0, -(H / 2 + 0.50), DEPTH / 2]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[W, 0.54]} />
            <meshBasicMaterial color="#0e0e1a" transparent opacity={0.94} />
          </mesh>
          <Text position={[0, 0.12, 0.003]} fontSize={0.072} color="#fbbf24" anchorX="center">
            {scene.shotType}  ·  {scene.mood}
          </Text>
          <Text position={[0, -0.06, 0.003]} fontSize={0.062} color="#606070" anchorX="center" maxWidth={W*.92}>
            {scene.location}
          </Text>
        </group>
      )}

      {/* ── Delete + 3D buttons — Html overlay, hover/select reveal ── */}
      {showUI && (
        <Html
          position={[W / 2 + 0.08, H / 2 + 0.08, DEPTH / 2]}
          style={{ pointerEvents: "auto" }}
          zIndexRange={[50, 60]}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {/* 3D depth view button — only show if scene has an image */}
            {scene.imageUrl && onView3D && (
              <button
                title={is3DMode ? "Exit 3D view" : "View in 3D (depth parallax)"}
                onClick={(e) => { e.stopPropagation(); onView3D(); }}
                style={{
                  width:        22,
                  height:       22,
                  borderRadius: "50%",
                  background:   is3DMode ? "rgba(74,127,167,0.90)" : "rgba(20,20,30,0.90)",
                  border:       `1px solid ${is3DMode ? "rgba(147,196,224,0.6)" : "rgba(255,255,255,0.15)"}`,
                  color:        is3DMode ? "#fff" : "rgba(147,196,224,0.85)",
                  fontSize:     9,
                  cursor:       "pointer",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  backdropFilter: "blur(8px)",
                  fontFamily:   "monospace",
                  fontWeight:   700,
                  lineHeight:   1,
                }}
              >
                3D
              </button>
            )}

            {/* Delete button */}
            {!confirmDelete ? (
              <button
                title="Remove frame"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                style={{
                  width:        22,
                  height:       22,
                  borderRadius: "50%",
                  background:   "rgba(20,20,30,0.90)",
                  border:       "1px solid rgba(255,255,255,0.15)",
                  color:        "rgba(255,255,255,0.55)",
                  fontSize:     11,
                  cursor:       "pointer",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  backdropFilter: "blur(8px)",
                  transition:   "all 0.15s",
                  lineHeight:   1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(180,30,30,0.90)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(20,20,30,0.90)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; }}
              >
                ✕
              </button>
            ) : (
              <div style={{
                display:        "flex",
                alignItems:     "center",
                gap:            5,
                background:     "rgba(14,14,22,0.96)",
                border:         "1px solid rgba(255,255,255,0.12)",
                borderRadius:   5,
                padding:        "4px 6px",
                backdropFilter: "blur(10px)",
                whiteSpace:     "nowrap",
              }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>
                  Remove?
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  style={{
                    background:   "rgba(180,30,30,0.85)",
                    border:       "none",
                    borderRadius: 3,
                    color:        "#fff",
                    fontSize:     9,
                    padding:      "2px 6px",
                    cursor:       "pointer",
                    fontFamily:   "monospace",
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  style={{
                    background:   "rgba(255,255,255,0.08)",
                    border:       "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 3,
                    color:        "rgba(255,255,255,0.55)",
                    fontSize:     9,
                    padding:      "2px 6px",
                    cursor:       "pointer",
                    fontFamily:   "monospace",
                  }}
                >
                  No
                </button>
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
