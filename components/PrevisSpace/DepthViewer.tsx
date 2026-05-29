"use client";

/**
 * DepthViewer — R3F component that renders a 2D image as a 3D depth-displaced plane.
 *
 * Uses manual texture loading (no useLoader/Suspense) to avoid Canvas flicker.
 * Displaces a subdivided PlaneGeometry along Z using the depth map's luminance.
 *
 * Props:
 *   imageUrl  — original scene image (data URL)
 *   depthUrl  — grayscale depth map (data URL, from /api/depth-map)
 *   position  — [x, y, z] world position
 *   onClose   — called when user exits 3D mode
 */

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  imageUrl: string;
  depthUrl: string;
  position: [number, number, number];
  onClose:  () => void;
}

// Custom shader — displaces vertices by depth map luminance
const VERTEX_SHADER = `
  uniform sampler2D depthMap;
  uniform float     displacementScale;
  varying vec2      vUv;

  void main() {
    vUv = uv;
    float depth = texture2D(depthMap, uv).r;
    vec3 displaced = position + normal * depth * displacementScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D imageMap;
  varying vec2      vUv;

  void main() {
    gl_FragColor = texture2D(imageMap, vUv);
  }
`;

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter  = THREE.LinearFilter;
        tex.magFilter  = THREE.LinearFilter;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

export default function DepthViewer({ imageUrl, depthUrl, position }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Load textures manually — no Suspense, no Canvas flicker
  const [imageTex, setImageTex] = useState<THREE.Texture | null>(null);
  const [depthTex,  setDepthTex]  = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadTexture(imageUrl), loadTexture(depthUrl)])
      .then(([img, dep]) => {
        if (cancelled) { img.dispose(); dep.dispose(); return; }
        setImageTex(img);
        setDepthTex(dep);
      })
      .catch(err => console.warn("[DepthViewer] texture load failed:", err));
    return () => {
      cancelled = true;
    };
  }, [imageUrl, depthUrl]);

  // Cleanup textures on unmount
  useEffect(() => {
    return () => {
      imageTex?.dispose();
      depthTex?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subdivided plane — 128×128 segments for smooth displacement
  const geometry = useMemo(() => new THREE.PlaneGeometry(3.2, 1.8, 128, 128), []);

  // Shader material — only create when both textures are ready
  const material = useMemo(() => {
    if (!imageTex || !depthTex) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        imageMap:          { value: imageTex },
        depthMap:          { value: depthTex },
        displacementScale: { value: 0.35 },
      },
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.FrontSide,
    });
  }, [imageTex, depthTex]);

  // Gentle rock animation — clamps at ±0.3 rad so it doesn't spin
  const dirRef = useRef(1);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 0.06 * dirRef.current;
    if (mesh.rotation.y > 0.28)  dirRef.current = -1;
    if (mesh.rotation.y < -0.28) dirRef.current =  1;
  });

  // Don't render until textures are loaded — avoids black flash
  if (!material) return null;

  return (
    <group position={position}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {/* Subtle steel-blue glow plane behind */}
      <mesh position={[0, 0, -0.06]}>
        <planeGeometry args={[3.7, 2.3]} />
        <meshBasicMaterial color="#4a7fa7" transparent opacity={0.07} side={THREE.FrontSide} />
      </mesh>
    </group>
  );
}
