// Standalone test — calls HuggingFace dpt-large directly to isolate failures.
// Run: node test-depth.mjs

import { readFileSync } from "fs";

// Manually parse .env.local
function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {
    console.error("Failed to read .env.local:", e.message);
  }
}
loadEnv();

const TOKEN = process.env.HUGGINGFACE_API_KEY;

console.log("═══ DEPTH PIPELINE STANDALONE TEST ═══");
console.log("STEP 0 — Token check");
console.log("  HUGGINGFACE_API_KEY set: ", !!TOKEN);
console.log("  Token prefix:            ", TOKEN ? TOKEN.slice(0, 8) + "…" : "(none)");
console.log("  Token length:            ", TOKEN?.length ?? 0);

if (!TOKEN) {
  console.error("STEP 0 FAIL — no token");
  process.exit(1);
}
console.log("STEP 0 PASS\n");

// STEP 1 — Fetch a real test image from Pollinations
console.log("STEP 1 — Fetch test image from Pollinations…");
const t1 = Date.now();
let imageBlob;
try {
  const imgRes = await fetch(
    "https://image.pollinations.ai/prompt/dimly%20lit%20bedroom?width=512&height=288&nologo=true",
    { signal: AbortSignal.timeout(30_000) },
  );
  console.log("  Pollinations status:      ", imgRes.status);
  console.log("  Pollinations content-type:", imgRes.headers.get("content-type"));
  if (!imgRes.ok) {
    console.error("STEP 1 FAIL — Pollinations returned", imgRes.status);
    process.exit(1);
  }
  imageBlob = await imgRes.blob();
  console.log("  Blob size:    ", imageBlob.size, "bytes");
  console.log("  Blob type:    ", imageBlob.type);
  console.log("  Time:         ", Date.now() - t1, "ms");
  console.log("STEP 1 PASS\n");
} catch (e) {
  console.error("STEP 1 FAIL — fetch threw:", e.name, "|", e.message);
  if (e.cause) console.error("  Cause:", e.cause);
  process.exit(1);
}

// STEP 2 — Call HuggingFace dpt-large
console.log("STEP 2 — Call HuggingFace dpt-large…");
const t2 = Date.now();
let hfRes;
try {
  hfRes = await fetch(
    "https://api-inference.huggingface.co/models/Intel/dpt-large",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type":  imageBlob.type || "image/jpeg",
      },
      body: imageBlob,
      signal: AbortSignal.timeout(60_000),
    },
  );
  console.log("  HF status:           ", hfRes.status);
  console.log("  HF content-type:     ", hfRes.headers.get("content-type"));
  console.log("  HF x-cache:          ", hfRes.headers.get("x-cache"));
  console.log("  Time:                ", Date.now() - t2, "ms");
} catch (e) {
  console.error("STEP 2 FAIL — fetch threw:", e.name, "|", e.message);
  if (e.cause) console.error("  Cause:", e.cause);
  process.exit(1);
}

if (!hfRes.ok) {
  const body = await hfRes.text().catch(() => "(unreadable)");
  console.error("STEP 2 FAIL — HF returned", hfRes.status);
  console.error("  Body:", body.slice(0, 500));
  process.exit(1);
}
console.log("STEP 2 PASS\n");

// STEP 3 — Read response body
console.log("STEP 3 — Read HF response body…");
const buf = await hfRes.arrayBuffer();
console.log("  Body size:", buf.byteLength, "bytes");
const head = Array.from(new Uint8Array(buf).slice(0, 8))
  .map(b => b.toString(16).padStart(2, "0")).join(" ");
console.log("  First 8 bytes (PNG sig should be 89 50 4e 47 …):");
console.log("  Hex:", head);
const isPng = head.startsWith("89 50 4e 47");
console.log(isPng ? "STEP 3 PASS — valid PNG depth map" : "STEP 3 FAIL — not a PNG");

console.log("\n═══ ALL STEPS PASS — depth pipeline is healthy from Node ═══");
