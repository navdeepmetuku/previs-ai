/**
 * R3F JSX intrinsic element declarations.
 *
 * React Three Fiber extends the JSX namespace by dynamically registering
 * Three.js object constructors as lowercase JSX elements.
 * This file tells TypeScript about that extension so editors and tsc
 * don't complain about unknown JSX elements.
 *
 * The import of @react-three/fiber adds ThreeElements to the global
 * JSX namespace when the project includes it.
 */

/// <reference types="@react-three/fiber" />
