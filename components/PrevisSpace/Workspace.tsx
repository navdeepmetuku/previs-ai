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

import { useRef, useCallback, useState, useEffect, Component } from "react";
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
}

function WorkspaceScene({ scenes, selectedId, onSelect, onDelete, controlsRef }: SceneInternalProps) {
  const safe      = scenes ?? [];
  const positions = computeCardPositions(safe.length);
  const selIdx    = safe.findIndex(s => s.id === selectedId);
  const selPos    = selIdx >= 0 ? positions[selIdx] : null;
  const targetVec = selPos ? new THREE.Vector3(...selPos) : null;

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
          />
        </SceneErrorBoundary>
      ))}
      <VishOrb selectedScenePosition={selPos} />
      <CameraFocuser targetPos={targetVec} controlsRef={controlsRef} />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Workspace({ project }: { project: Project }) {
  const [scenes,     setScenes]     = useState<Scene[]>(() => project.scenes ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Sync on project change: full replace when project switches,
  // otherwise patch only imageUrl fields that changed.
  const prevProjectRef = useRef<Project | null>(null);
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

  // Initial selection (only once)
  useEffect(() => {
    setSelectedId(project.scenes?.[0]?.id ?? null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
    setSelectedId(prev => {
      if (prev !== id) return prev;
      const safe = scenes ?? [];
      const idx  = safe.findIndex(s => s.id === id);
      const next = safe.filter(s => s.id !== id);
      return next[Math.min(idx, next.length - 1)]?.id ?? null;
    });
  }, [scenes]);

  // ── Generation queue — background continuity-aware frame generation ──────
  const { enqueue, statuses: genStatuses, isRunning: genRunning, cancel: cancelGen, pending: genPending } =
    useGenerationQueue({
      project,
      onFrameReady: (sceneId, dataUrl) => {
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl: dataUrl } : s));
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
        />
      </Canvas>

      <MiniTimeline scenes={scenes} selectedId={selectedId} onSelect={handleSelect} onReorder={handleReorder} />

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
      <div className="absolute top-3 z-20 flex flex-col items-end gap-1.5" style={{ right: 286 }}>
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
