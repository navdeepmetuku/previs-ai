/// <reference types="@react-three/fiber" />

// Force R3F's global JSX augmentation into the React namespace
// Required because Next.js uses react-jsx transform (React 18+ JSX)
import type * as ReactThreeFiber from "@react-three/fiber";
declare global {
  namespace React {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
      interface IntrinsicElements extends ReactThreeFiber.ThreeElements {}
    }
  }
}
