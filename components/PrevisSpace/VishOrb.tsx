"use client";

/**
 * VishOrb — holographic AI presence of VISH.
 *
 * Upgrade: multi-ring holographic shell + inner core pulse +
 * orbiting satellite sparks + volumetric point light contribution.
 *
 * All animation in useFrame, zero allocations per frame.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  selectedScenePosition?: [number, number, number] | null;
}

const _targetPos = new THREE.Vector3();

export default function VishOrb({ selectedScenePosition }: Props) {
  const groupRef  = useRef<THREE.Group>(null);
  const coreRef   = useRef<THREE.Mesh>(null);
  const ring1Ref  = useRef<THREE.Mesh>(null);
  const ring2Ref  = useRef<THREE.Mesh>(null);
  const ring3Ref  = useRef<THREE.Mesh>(null);
  const haloRef   = useRef<THREE.Mesh>(null);
  const spark1Ref = useRef<THREE.Mesh>(null);
  const spark2Ref = useRef<THREE.Mesh>(null);
  const spark3Ref = useRef<THREE.Mesh>(null);
  const glowRef   = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // ── Follow selected card ─────────────────────────────────────────────
    if (groupRef.current) {
      _targetPos.set(
        selectedScenePosition ? selectedScenePosition[0] + 2.2 : 7,
        selectedScenePosition ? selectedScenePosition[1] + 1.8 : 2.4,
        selectedScenePosition ? selectedScenePosition[2] + 1.4 : 0,
      );
      groupRef.current.position.lerp(_targetPos, 0.022);
      groupRef.current.position.y += Math.sin(t * 0.85) * 0.14;
    }

    // ── Core orb pulse ───────────────────────────────────────────────────
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 2.8) * 0.08;
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.rotation.y = t * 0.4;
      coreRef.current.rotation.z = t * 0.15;
      const m = coreRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.7 + Math.sin(t * 2.8) * 0.35;
    }

    // ── Outer halo breath ────────────────────────────────────────────────
    if (haloRef.current) {
      const m = haloRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.04 + Math.sin(t * 1.1) * 0.025;
      const s = 1.0 + Math.sin(t * 0.7) * 0.06;
      haloRef.current.scale.setScalar(s);
    }

    // ── Rings — three axes, independent speeds ───────────────────────────
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.55;
      ring1Ref.current.rotation.z = t * 0.22;
      const m = ring1Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.28 + Math.sin(t * 2.0) * 0.10;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = t * 0.42;
      ring2Ref.current.rotation.x = Math.PI * 0.5 + t * 0.18;
      const m = ring2Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.20 + Math.cos(t * 1.6) * 0.08;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.z = t * 0.68;
      ring3Ref.current.rotation.y = t * 0.30;
      const m = ring3Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.15 + Math.sin(t * 2.4 + 1.2) * 0.07;
    }

    // ── Orbiting satellite sparks ────────────────────────────────────────
    const R = 0.60;
    if (spark1Ref.current) {
      spark1Ref.current.position.set(
        Math.cos(t * 1.3)  * R,
        Math.sin(t * 1.3)  * R * 0.5,
        Math.sin(t * 1.3)  * R,
      );
    }
    if (spark2Ref.current) {
      spark2Ref.current.position.set(
        Math.cos(t * 0.9 + 2.1) * R,
        Math.sin(t * 1.8 + 1.0) * R * 0.4,
        Math.sin(t * 0.9 + 2.1) * R,
      );
    }
    if (spark3Ref.current) {
      spark3Ref.current.position.set(
        Math.cos(t * 1.6 + 4.2) * R * 0.8,
        Math.cos(t * 1.1 + 3.0) * R * 0.6,
        Math.sin(t * 1.6 + 4.2) * R * 0.8,
      );
    }

    // ── Point light pulse ────────────────────────────────────────────────
    if (glowRef.current) {
      glowRef.current.intensity = 1.6 + Math.sin(t * 2.8) * 0.65;
    }
  });

  return (
    <group ref={groupRef} position={[7, 2.4, 0]}>

      {/* Outer soft halo sphere */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.58, 18, 18]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.05} depthWrite={false} />
      </mesh>

      {/* Ring 1 — wide, amber */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[0.44, 0.022, 8, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.28} />
      </mesh>

      {/* Ring 2 — medium, blue-white */}
      <mesh ref={ring2Ref}>
        <torusGeometry args={[0.36, 0.015, 8, 48]} />
        <meshBasicMaterial color="#aaccff" transparent opacity={0.20} />
      </mesh>

      {/* Ring 3 — tight, white accent */}
      <mesh ref={ring3Ref}>
        <torusGeometry args={[0.28, 0.012, 8, 36]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.15} />
      </mesh>

      {/* Core orb */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.17, 24, 24]} />
        <meshStandardMaterial
          color="#fff4e0"
          emissive="#fbbf24"
          emissiveIntensity={0.75}
          roughness={0.08}
          metalness={0.30}
        />
      </mesh>

      {/* Satellite spark 1 — amber */}
      <mesh ref={spark1Ref}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>

      {/* Satellite spark 2 — cool blue */}
      <mesh ref={spark2Ref}>
        <sphereGeometry args={[0.020, 8, 8]} />
        <meshBasicMaterial color="#88aaff" />
      </mesh>

      {/* Satellite spark 3 — white */}
      <mesh ref={spark3Ref}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Volumetric contribution light */}
      <pointLight ref={glowRef} color="#fbbf24" intensity={1.6} distance={6.5} decay={2} />
    </group>
  );
}
