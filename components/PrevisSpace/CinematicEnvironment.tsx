"use client";

/**
 * CinematicEnvironment — Blender-style professional viewport.
 *
 * Reference: Blender 4 default viewport (grey background, even studio
 * lighting, clean readable grid, red/green axis lines).
 *
 * Philosophy: maximum spatial readability. Zero theatrical gimmicks.
 * Cards must be clearly visible and inspectable from any camera angle.
 *
 * Layers:
 *   - Scene background: mid-grey (#363636)
 *   - Linear fog: same grey, starts far so cards are never fogged
 *   - HemisphereLight: sky/ground for even fill (primary lighting)
 *   - Directional key: soft warm-neutral from upper-left
 *   - Directional fill: cool-neutral from right
 *   - Ambient: gentle base so nothing is pure black
 *   - Matte grey floor plane
 *   - Grid: Blender-style — fine cells + visible section lines
 *   - Axis lines: red (X), green (Z) — immediate orientation reference
 *
 * No sweep lights. No glow pools. No particles. No stars. No fog animation.
 */

import { useMemo } from "react";
import { Grid } from "@react-three/drei";
import * as THREE from "three";

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
      {/* Viewport background — Blender grey */}
      <color attach="background" args={["#363636"]} />

      {/* Linear fog — matches background colour, starts at 30u so cards
          are never fogged, fades environment geometry naturally */}
      <fog attach="fog" args={["#363636", 30, 80]} />

      {/* ── Studio lighting rig ── */}

      {/* Hemisphere — sky/ground fill, the primary source of even lighting.
          This is what makes everything readable without harsh shadows. */}
      <hemisphereLight
        args={["#c8c8c8", "#2a2a2a", 0.95]}
      />

      {/* Key directional — warm-neutral, upper-left-front */}
      <directionalLight
        position={[-6, 10, 5]}
        intensity={1.05}
        color="#f5f0e8"
        castShadow={false}
      />

      {/* Fill directional — cool-neutral, right side, softer */}
      <directionalLight
        position={[8, 5, -3]}
        intensity={0.50}
        color="#e0e8f5"
      />

      {/* Ambient base — prevents complete black in shadow areas */}
      <ambientLight intensity={0.18} color="#aaaaaa" />

      {/* ── Floor ── */}

      {/* Matte grey floor plane — matches scene background */}
      <mesh position={[0, -2.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial
          color="#313131"
          roughness={0.92}
          metalness={0.0}
        />
      </mesh>

      {/* ── Grid — Blender-style: fine cells + visible section lines ── */}
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
