"use client";

/**
 * CinematicEnvironment — Blender-style professional viewport.
 *
 * Background is set via Canvas gl.setClearColor in Workspace.tsx.
 * This component handles only scene content: lighting, floor, grid, axes.
 */

import { useMemo, useEffect } from "react";
import { Grid } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

const BG_COLOR = new THREE.Color("#363636");
const FOG_COLOR = new THREE.Color("#363636");

// ── Set scene background + fog imperatively ───────────────────────────────────
// Avoids the R3F v9 <color attach="background"> JSX primitive which can
// silently fail and leave the renderer clear color at white.

function SceneSetup() {
  const { scene, gl } = useThree();

  useEffect(() => {
    scene.background = BG_COLOR;
    scene.fog = new THREE.Fog(FOG_COLOR, 30, 80);
    gl.setClearColor(BG_COLOR, 1);

    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, gl]);

  return null;
}

// ── Axis lines — red X, green Z ───────────────────────────────────────────────

function AxisLines() {
  const xLine = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-48, -2.17, 0),
          new THREE.Vector3( 48, -2.17, 0),
        ]),
        new THREE.LineBasicMaterial({ color: "#bb2222", transparent: true, opacity: 0.70 }),
      ),
    [],
  );

  const zLine = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, -2.17, -48),
          new THREE.Vector3(0, -2.17,  48),
        ]),
        new THREE.LineBasicMaterial({ color: "#22aa44", transparent: true, opacity: 0.70 }),
      ),
    [],
  );

  return (
    <>
      <primitive object={xLine} />
      <primitive object={zLine} />
    </>
  );
}

// ── Main Environment ──────────────────────────────────────────────────────────

export default function CinematicEnvironment() {
  return (
    <>
      <SceneSetup />

      {/* ── Studio lighting rig ── */}

      {/* Hemisphere — sky/ground fill, primary source of even lighting */}
      <hemisphereLight args={["#b0b0b0", "#2a2a2a", 0.80]} />

      {/* Key directional — warm-neutral, upper-left-front */}
      <directionalLight
        position={[-6, 10, 5]}
        intensity={0.90}
        color="#f5f0e8"
        castShadow={false}
      />

      {/* Fill directional — cool-neutral, right side */}
      <directionalLight
        position={[8, 5, -3]}
        intensity={0.40}
        color="#e0e8f5"
      />

      {/* Ambient base */}
      <ambientLight intensity={0.12} color="#888888" />

      {/* ── Floor ── */}
      <mesh position={[0, -2.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial
          color="#313131"
          roughness={0.92}
          metalness={0.0}
        />
      </mesh>

      {/* ── Grid — Blender-style ── */}
      <Grid
        position={[0, -2.20, 0]}
        args={[160, 160]}
        cellSize={1}
        cellThickness={0.30}
        cellColor="#1e1e1e"
        sectionSize={5}
        sectionThickness={0.60}
        sectionColor="#4a4a4a"
        fadeDistance={55}
        fadeStrength={1.4}
        infiniteGrid
      />

      {/* Axis orientation lines */}
      <AxisLines />
    </>
  );
}
