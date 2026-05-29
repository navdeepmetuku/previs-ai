"use client";

/**
 * PrevisSpace Workspace — professional 3D viewport.
 *
 * Camera architecture — restored to first working version:
 *
 *   CameraFocuser runs inside the R3F render loop (useFrame).
 *   This is required — setting camera/controls state from outside Canvas
 *   (useEffect in a React component) breaks OrbitControls' internal
 *   spherical coordinate tracking, causing orbit/pan to stop responding
 *   while zoom still works via DOM scroll events.
 *
 *   The useFrame approach:
 *     - Lerps controls.target to selected card every frame (orbit pivot follows card)
 *     - Lerps camera.position X/Z toward front-of-card (preserves Y so vertical orbit works)
 *     - Both operations use the same delta-based speed → natural, controllable feel
 *     - After lerp converges, controls delta is near zero → OrbitControls has full authority
 */

import { useRef, useCallback, useState, useEffect, useMemo, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Project, Scene } from "@/types";

import CinematicEnvironment from "./CinematicEnvironment";
import SceneCard3D from "./SceneCard3D";
import VishOrb from "./VishOrb";
import MiniTimeline from "./MiniTimeline";
import ShotDetailPanel from "./ShotDetailPanel";
import VishDirectorPanel from "./VishDirectorPanel";
import StoryEngine from "./StoryEngine";
import { useGenerationQueue } from "@/hooks/useGenerationQueue";
import DepthViewer from "./DepthViewer";
import { estimateDepth, preloadDepthModel } from "@/lib/depth-estimator";

// ── Error boundary — prevents a single broken card from crashing the Canvas ──

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[PrevisSpace] scene render error:", err, info);
    this.setState({ crashed: true });
  }
  render() {
    if (this.state.crashed) return this.props.fallback ?? null;
    return this.props.children;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RAIL_H  = 98;
const SPACING = 4.0;
const ARC_Z   = 1.0;

// ── Card layout ───────────────────────────────────────────────────────────────

function computeCardPositions(count: number): [number, number, number][] {
  if (count === 0) return [];
  const total  = (count - 1) * SPACING;
  const startX = -total / 2;
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const x = startX + i * SPACING;
    const z = -Math.cos((t - 0.5) * Math.PI) * ARC_Z;
    const y = i % 2 === 0 ? -0.05 : 0.22;
    return [x, y, z] as [number, number, number];
  });
}

// ── CameraFocuser — inside R3F tree, runs in render loop ─────────────────────
//
// MUST live inside Canvas so useFrame has access to the live THREE.js camera
// and OrbitControls instances. Running this logic in useEffect (React) breaks
// OrbitControls because its spherical coordinates get desynced from the camera.
//
// Behavior:
//   - Every frame: lerp controls.target toward selected card center
//     → orbit pivot gradually locks to the card, user can still resist it briefly
//   - Every frame: lerp camera.position X/Z toward (card.x, card.z + 6.5)
//     → camera stays in front of card; Y is read from current position so
//        vertical angle is fully preserved (no fighting when user tilts up/down)
//   - After convergence: lerp delta ≈ 0, OrbitControls owns the camera fully

const _camDest  = new THREE.Vector3();
const _ctrlDest = new THREE.Vector3();

interface FocuserProps {
  targetPos:   THREE.Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

function CameraFocuser({ targetPos, controlsRef }: FocuserProps) {
  useFrame(({ camera }, delta) => {
    if (!targetPos || !controlsRef.current) return;

    const speed = delta * 2.5;

    // Pull orbit pivot to card center
    _ctrlDest.set(targetPos.x, targetPos.y, targetPos.z);
    controlsRef.current.target.lerp(_ctrlDest, speed);

    // Pull camera X/Z in front of card, preserve user's current Y
    _camDest.set(targetPos.x, camera.position.y, targetPos.z + 6.5);
    camera.position.lerp(_camDest, speed);

    controlsRef.current.update();
  });

  return null;
}

// ── Scene content ─────────────────────────────────────────────────────────────

interface SceneInternalProps {
  scenes:      Scene[];
  selectedId:  string | null;
  onSelect:    (id: string) => void;
  onDelete:    (id: string) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  depth3DId:   string | null;
  depth3DUrl:  string | null;
  onView3D:    (id: string) => void;
}

function WorkspaceScene({ scenes, selectedId, onSelect, onDelete, controlsRef, depth3DId, depth3DUrl, onView3D }: SceneInternalProps) {
  const safe      = scenes ?? [];
  const positions = computeCardPositions(safe.length);
  const selIdx    = safe.findIndex(s => s.id === selectedId);
  const selPos    = selIdx >= 0 ? positions[selIdx] : null;
  const depth3DIdx = safe.findIndex(s => s.id === depth3DId);
  const depth3DPos = depth3DIdx >= 0 ? positions[depth3DIdx] : null;

  const targetVec = useMemo(
    () => selPos ? new THREE.Vector3(...selPos) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selPos?.[0], selPos?.[1], selPos?.[2]],
  );

  return (
    <>
      <CinematicEnvironment />
      {safe.map((scene, i) => (
        <SceneErrorBoundary key={scene.id}>
          <SceneCard3D
            scene={scene}
            position={positions[i] ?? [0, 0, 0]}
            isSelected={scene.id === selectedId}
            onSelect={() => onSelect(scene.id)}
            onDelete={() => onDelete(scene.id)}
            onView3D={() => onView3D(scene.id)}
            is3DMode={scene.id === depth3DId}
          />
        </SceneErrorBoundary>
      ))}
      {/* Depth viewer — renders when a scene is in 3D mode */}
      {depth3DId && depth3DUrl && depth3DPos && (
        <DepthViewer
          imageUrl={safe.find(s => s.id === depth3DId)?.imageUrl ?? ""}
          depthUrl={depth3DUrl}
          position={[depth3DPos[0], depth3DPos[1] + 0.5, depth3DPos[2] + 1.5]}
          onClose={() => onView3D(depth3DId)}
        />
      )}
      <VishOrb selectedScenePosition={selPos} />
      <CameraFocuser targetPos={targetVec} controlsRef={controlsRef} />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Workspace({ project, onProjectUpdated }: { project: Project; onProjectUpdated?: (p: Project) => void }) {
  const [scenes,     setScenes]     = useState<Scene[]>(() => project.scenes ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // ── 3D depth viewer state ──────────────────────────────────────────────────
  const [depth3DId,      setDepth3DId]      = useState<string | null>(null);
  const [depth3DUrl,     setDepth3DUrl]     = useState<string | null>(null);
  const [depth3DLoading, setDepth3DLoading] = useState(false);
  const [depth3DError,   setDepth3DError]   = useState<string | null>(null);

  // Sync on project change: full replace when project switches,
  // otherwise patch only imageUrl fields that changed.
  const prevProjectRef = useRef<Project | null>(null);
  useEffect(() => {
    // ── RUNTIME VERIFICATION LOG ──────────────────────────────────────────
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  [RUNTIME-VERIFY] Workspace mounted                      ║");
    console.log("║  depth-estimator.ts IS the active module (new pipeline)  ║");
    console.log("║  No HuggingFace Inference API. No /api/depth-token.      ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    // Preload depth model in background so it's ready when user clicks 3D
    preloadDepthModel();
  }, []);
  useEffect(() => {
    const prev  = prevProjectRef.current;
    const next  = project.scenes ?? [];
    prevProjectRef.current = project;

    if (!prev || prev.id !== project.id) {
      // Different project — full replace
      setScenes(next);
      setSelectedId(next[0]?.id ?? null);
      return;
    }

    if (prev.scenes === project.scenes) return; // same reference, skip

    // Same project — patch only changed imageUrls, preserve local edits
    setScenes(current => {
      if (current.length !== next.length) return next;
      let changed = false;
      const patched = current.map((local, i) => {
        const incoming = next[i];
        if (incoming && incoming.id === local.id && incoming.imageUrl !== local.imageUrl) {
          changed = true;
          return { ...local, imageUrl: incoming.imageUrl };
        }
        return local;
      });
      return changed ? patched : current; // return same ref if nothing changed → no re-render
    });
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remove redundant Effect 2 — Effect 1 (project sync) already handles initial selection

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setScenes(prev => {
      const next = prev.filter(s => s.id !== id);
      setSelectedId(sel => {
        if (sel !== id) return sel;
        const idx = prev.findIndex(s => s.id === id);
        return next[Math.min(idx, next.length - 1)]?.id ?? null;
      });
      return next;
    });
  }, []);

  // Toggle 3D depth view for a scene — uses local Depth Anything V2 (no HuggingFace API)
  const handleView3D = useCallback(async (id: string) => {
    // ── RUNTIME VERIFICATION ──────────────────────────────────────────────
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  [RUNTIME-VERIFY] handleView3D() CALLED                  ║");
    console.log(`║  scene id: ${id.slice(0, 20).padEnd(20)}                    ║`);
    console.log("║  Pipeline: Depth Anything V2 LOCAL (no HF API)           ║");
    console.log("╚══════════════════════════════════════════════════════════╝");

    // Toggle off
    if (depth3DId === id) {
      console.log("[RUNTIME-VERIFY] Toggling 3D OFF");
      setDepth3DId(null);
      setDepth3DUrl(null);
      setDepth3DError(null);
      return;
    }

    const scene = scenes.find(s => s.id === id);
    console.log("[RUNTIME-VERIFY] scene found:", !!scene, "| imageUrl present:", !!scene?.imageUrl);

    if (!scene?.imageUrl) {
      setDepth3DError("Generate an image for this shot first, then try 3D view.");
      setTimeout(() => setDepth3DError(null), 4000);
      return;
    }

    setDepth3DId(id);
    setDepth3DUrl(null);
    setDepth3DError(null);
    setDepth3DLoading(true);

    try {
      console.log("[RUNTIME-VERIFY] Calling estimateDepth() from lib/depth-estimator.ts…");
      const depthUrl = await estimateDepth(
        scene.imageUrl,
        (phase, pct) => {
          console.log(`[RUNTIME-VERIFY] Progress: ${phase}${pct !== undefined ? ` (${pct}%)` : ""}`);
        },
      );
      console.log("[RUNTIME-VERIFY] estimateDepth() SUCCESS — depthUrl length:", depthUrl.length);
      setDepth3DUrl(depthUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : "";
      console.error("╔══════════════════════════════════════════════════════════╗");
      console.error("║  [RUNTIME-VERIFY] estimateDepth() THREW                  ║");
      console.error(`║  Error: ${msg.slice(0, 50).padEnd(50)}  ║`);
      console.error("╚══════════════════════════════════════════════════════════╝");
      console.error("[RUNTIME-VERIFY] Full stack:", stack);
      setDepth3DError(msg.slice(0, 80));
      setDepth3DId(null);
    } finally {
      setDepth3DLoading(false);
    }
  }, [depth3DId, scenes]);

  // ── Generation queue — background continuity-aware frame generation ──────
  const { enqueue, statuses: genStatuses, isRunning: genRunning, cancel: cancelGen, pending: genPending } =
    useGenerationQueue({
      project,
      onFrameReady: (sceneId, dataUrl) => {
        setScenes(prev => {
          const next = prev.map(s => s.id === sceneId ? { ...s, imageUrl: dataUrl } : s);
          // Persist to localStorage so images survive navigation/refresh
          if (onProjectUpdated) {
            onProjectUpdated({ ...project, scenes: next });
          }
          return next;
        });
      },
    });

  // Drag-to-reorder from timeline
  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    setScenes(prev => {
      const arr  = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      // Re-assign order numbers
      return arr.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }, []);

  const selectedScene = scenes.find(s => s.id === selectedId) ?? null;
  return (
    <div className="relative w-full h-full">

      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: "default", preserveDrawingBuffer: false }}
        dpr={[1, 1.5]}
        style={{ background: "#363636" }}
        shadows={false}
      >
        <PerspectiveCamera makeDefault position={[0, 1.5, 8]} fov={48} near={0.1} far={200} />

        {/*
          OrbitControls — same settings as the original first working version.
          Polar angle constraints prevent gimbal flip at poles, which would
          cause orbit to suddenly invert and feel broken.
          damping 0.08 = responsive stop with very slight easing (original was 0.07).
        */}
        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI * 0.78}
          minPolarAngle={Math.PI * 0.05}
          minDistance={2}
          maxDistance={28}
          panSpeed={0.75}
          rotateSpeed={0.45}
          zoomSpeed={0.85}
          dampingFactor={0.08}
          enableDamping
          makeDefault
        />

        <WorkspaceScene
          scenes={scenes}
          selectedId={selectedId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          controlsRef={controlsRef}
          depth3DId={depth3DId}
          depth3DUrl={depth3DUrl}
          onView3D={handleView3D}
        />
      </Canvas>

      <MiniTimeline scenes={scenes} selectedId={selectedId} onSelect={handleSelect} onReorder={handleReorder} />

      {/* ── 3D depth loading indicator ── */}
      {depth3DLoading && (
        <div style={{
          position:   "fixed",
          bottom:     110,
          left:       "50%",
          transform:  "translateX(-50%)",
          zIndex:     50,
          background: "rgba(8,8,18,0.95)",
          border:     "1px solid rgba(74,127,167,0.35)",
          borderRadius: 6,
          padding:    "8px 16px",
          display:    "flex",
          alignItems: "center",
          gap:        8,
          backdropFilter: "blur(12px)",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#4a7fa7",
            animation: "pulse 1.2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(147,196,224,0.85)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Depth Anything V2 — generating depth map…
          </span>
        </div>
      )}

      {/* ── 3D depth error ── */}
      {depth3DError && (
        <div style={{
          position:   "fixed",
          bottom:     110,
          left:       "50%",
          transform:  "translateX(-50%)",
          zIndex:     50,
          background: "rgba(18,8,8,0.95)",
          border:     "1px solid rgba(248,113,113,0.30)",
          borderRadius: 6,
          padding:    "8px 16px",
          display:    "flex",
          alignItems: "center",
          gap:        8,
          backdropFilter: "blur(12px)",
        }}>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(248,113,113,0.85)", letterSpacing: "0.12em" }}>
            3D unavailable — {depth3DError.slice(0, 60)}
          </span>
          <button
            onClick={() => setDepth3DError(null)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11 }}
          >✕</button>
        </div>
      )}

      {/* ── VISH Director Panel ── */}
      <VishDirectorPanel
        project={project}
        scenes={scenes}
        selectedScene={selectedScene}
        onGenerateSelected={() => selectedScene && enqueue(selectedScene)}
        onGenerateAll={() => enqueue(...scenes.filter(s => !s.imageUrl))}
        genStatuses={genStatuses}
        genRunning={genRunning}
        onCancelGen={cancelGen}
        genPending={genPending}
      />

      {/* ── Story Engine — narrative intelligence ── */}
      <StoryEngine project={project} scenes={scenes} />

      {/* ── Shot detail panel — selected scene ── */}
      {selectedScene && (
        <ShotDetailPanel scene={selectedScene} />
      )}

      {/* ── Top-right toolbar ── */}
      <div className="absolute top-3 z-20 flex flex-col items-end gap-1.5" style={{ right: 12 }}>
        {/* Identity row */}
        <div className="flex items-center gap-1.5 pointer-events-none">
          <span className="text-[7px] font-mono uppercase tracking-[0.3em]"
            style={{ color: "rgba(20,20,28,0.55)" }}>Previs Space</span>
          <div className="w-1.5 h-1.5 rounded-full"
            style={{ background: MOOD_ACCENT[selectedScene?.mood ?? ""] ?? "#fbbf24", opacity: 0.60 }} />
        </div>
        <span className="text-[6.5px] font-mono pointer-events-none" style={{ color: "rgba(20,20,28,0.38)" }}>
          {scenes.length} shots · {project.genre}
        </span>

        {/* Action buttons */}
        {selectedScene && (
          <div className="flex items-center gap-1 mt-1">
            {/* Duplicate shot */}
            <button
              title="Duplicate shot"
              onClick={() => {
                const clone = {
                  ...selectedScene,
                  id:    `${selectedScene.id}-copy-${Date.now()}`,
                  order: scenes.length + 1,
                  title: `${selectedScene.title} (copy)`,
                };
                setScenes(prev => [...prev, clone]);
              }}
              style={{
                fontSize: 9, fontFamily: "monospace", padding: "3px 7px",
                borderRadius: 3, border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(18,18,28,0.88)", color: "rgba(220,220,240,0.65)",
                cursor: "pointer", backdropFilter: "blur(8px)",
              }}
            >
              ⧉ Duplicate
            </button>
          </div>
        )}
      </div>

      {/* Nav hint */}
      <div className="absolute z-20 pointer-events-none" style={{ bottom: RAIL_H + 6, right: 12 }}>
        <p className="text-[6px] font-mono text-right leading-relaxed"
          style={{ color: "rgba(20,20,28,0.26)" }}>
          Left-drag · orbit &nbsp;|&nbsp; Scroll · zoom &nbsp;|&nbsp; Right-drag · pan
        </p>
      </div>

    </div>
  );
}

const MOOD_ACCENT: Record<string, string> = {
  Tense: "#ff3311", Dramatic: "#aa44ff", Romantic: "#ff5588", Action: "#ff8800",
  Mysterious: "#3366ff", Melancholic: "#4488cc", Triumphant: "#ffcc00",
  Horror: "#00cc44", Comedic: "#44ee88", Serene: "#00cccc",
};
