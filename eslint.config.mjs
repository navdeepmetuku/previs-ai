import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project-local ignores
    "test-gemini-real.js",      // local CLI smoke test, allowed to use require()
    "r3f.d.ts",                 // legacy R3F type augmentation
    "components/PrevisSpace/r3f.d.ts",
  ]),
  {
    rules: {
      // The new react-hooks/* rules in React 19 are very strict and flag many
      // legitimate patterns (mount flags, SSR hydration, prop sync, R3F bridges,
      // imperative ref handles). Downgrade to warnings so the build passes
      // while keeping the signal in dev.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs":                "warn",
      "react-hooks/immutability":        "warn",
      // Smart-quotes inside JSX text — not a runtime issue.
      "react/no-unescaped-entities":     "warn",
    },
  },
]);

export default eslintConfig;
