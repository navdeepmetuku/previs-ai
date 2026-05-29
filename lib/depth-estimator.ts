"use client";

/**
 * depth-estimator.ts — Local browser-side depth estimation.
 *
 * Uses Depth Anything V2 (Small) via @huggingface/transformers (ONNX Runtime Web).
 * Runs entirely in the browser — no external API, no HuggingFace Inference API,
 * no token required, no network dependency after first model download.
 *
 * Model: onnx-community/depth-anything-v2-small
 *   - 27MB quantized ONNX (downloaded once, cached by browser)
 *   - Downloaded from huggingface.co main domain (confirmed reachable)
 *   - NeurIPS 2024 state-of-the-art monocular depth estimation
 *   - WebGPU backend (preferred) → WASM/CPU fallback
 *
 * Usage:
 *   const depthUrl = await estimateDepth(imageDataUrl, onProgress);
 *   // depthUrl is a data:image/png;base64,… grayscale depth map
 *
 * Pipeline is cached after first load — subsequent calls are fast (1–4s).
 */

// Dynamic import — keeps transformers.js out of the main bundle.
// Only loaded when the 3D button is first clicked.
type TransformersModule = typeof import("@huggingface/transformers");
type DepthPipeline = Awaited<ReturnType<TransformersModule["pipeline"]>>;

export type DepthProgressCallback = (phase: string, percent?: number) => void;

// Module-level singleton — pipeline is loaded once and reused
let _pipeline: DepthPipeline | null = null;
let _loadPromise: Promise<DepthPipeline> | null = null;

const MODEL_ID = "onnx-community/depth-anything-v2-small";

/**
 * Load the Depth Anything V2 pipeline.
 * Idempotent — safe to call multiple times; returns the same promise.
 */
async function loadPipeline(onProgress?: DepthProgressCallback): Promise<DepthPipeline> {
  if (_pipeline) {
    console.log("[DepthEstimator] Pipeline already loaded — reusing cached instance");
    return _pipeline;
  }

  if (_loadPromise) {
    console.log("[DepthEstimator] Pipeline load already in progress — waiting…");
    return _loadPromise;
  }

  _loadPromise = (async () => {
    console.log("[DepthEstimator] Loading @huggingface/transformers dynamically…");
    const t0 = performance.now();

    // Dynamic import — only runs in browser, never on server
    const { pipeline, env } = await import("@huggingface/transformers");

    // Configure: use huggingface.co main domain (NOT api-inference subdomain)
    // huggingface.co resolves correctly on this machine
    env.allowRemoteModels = true;
    env.allowLocalModels  = false;

    console.log("[DepthEstimator] Transformers.js loaded in", Math.round(performance.now() - t0), "ms");
    console.log("[DepthEstimator] Model:", MODEL_ID);
    console.log("[DepthEstimator] Source: huggingface.co (main domain, no api-inference subdomain)");

    onProgress?.("Downloading Depth Anything V2 model (27MB, one-time)…");

    const t1 = performance.now();

    // Try WebGPU first for best performance, fall back to WASM
    let pipe: DepthPipeline;
    let backendUsed = "unknown";

    try {
      console.log("[DepthEstimator] Attempting WebGPU backend…");
      pipe = await pipeline("depth-estimation", MODEL_ID, {
        device: "webgpu",
        dtype:  "fp32",
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === "progress" && p.file && p.total) {
            const pct = Math.round((p.loaded! / p.total) * 100);
            console.log(`[DepthEstimator] Downloading ${p.file}: ${pct}%`);
            onProgress?.(`Downloading model… ${pct}%`, pct);
          }
        },
      });
      backendUsed = "webgpu";
      console.log("[DepthEstimator] WebGPU backend loaded in", Math.round(performance.now() - t1), "ms");
    } catch (gpuErr) {
      console.warn("[DepthEstimator] WebGPU unavailable:", (gpuErr as Error).message);
      console.log("[DepthEstimator] Falling back to WASM/CPU backend…");
      onProgress?.("WebGPU unavailable — using CPU (slower, ~10s)…");

      const t2 = performance.now();
      pipe = await pipeline("depth-estimation", MODEL_ID, {
        device: "wasm",
        dtype:  "q8",
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === "progress" && p.file && p.total) {
            const pct = Math.round((p.loaded! / p.total) * 100);
            console.log(`[DepthEstimator] Downloading ${p.file}: ${pct}%`);
            onProgress?.(`Downloading model… ${pct}%`, pct);
          }
        },
      });
      backendUsed = "wasm";
      console.log("[DepthEstimator] WASM backend loaded in", Math.round(performance.now() - t2), "ms");
    }

    _pipeline = pipe;
    console.log(`[DepthEstimator] ✓ Pipeline ready | backend=${backendUsed} | total load time=${Math.round(performance.now() - t0)}ms`);
    onProgress?.(`Model ready (${backendUsed})`);
    return pipe;
  })();

  // Clear the promise ref on failure so next call retries
  _loadPromise.catch(() => { _loadPromise = null; });

  return _loadPromise;
}

/**
 * Convert a RawImage (single-channel grayscale depth output) to a PNG data URL.
 * Uses OffscreenCanvas for off-main-thread rendering.
 */
async function rawImageToDataUrl(rawImage: {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}): Promise<string> {
  const { data, width, height } = rawImage;

  // Build RGBA from single-channel grayscale
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = data[i];
    rgba[i * 4 + 0] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }

  // Use OffscreenCanvas if available (modern browsers), fall back to regular canvas
  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx    = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    blob = await canvas.convertToBlob({ type: "image/png" });
  } else {
    blob = await new Promise<Blob>((resolve, reject) => {
      const canvas    = document.createElement("canvas");
      canvas.width    = width;
      canvas.height   = height;
      const ctx       = canvas.getContext("2d")!;
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("canvas.toBlob failed")), "image/png");
    });
  }

  // Blob → base64 data URL (chunked to avoid stack overflow)
  const buffer = await blob.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary   = "";
  const chunk  = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * Estimate depth from a 2D image.
 *
 * @param imageInput  — data URL, blob URL, or HTTP(S) URL of the source image
 * @param onProgress  — optional callback for loading/inference progress messages
 * @returns           — data:image/png;base64,… grayscale depth map
 *
 * First call: downloads model (~27MB), then runs inference (~1–10s)
 * Subsequent calls: inference only (~1–4s, model cached)
 */
export async function estimateDepth(
  imageInput: string,
  onProgress?: DepthProgressCallback,
): Promise<string> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  [RUNTIME-VERIFY] depth-estimator.ts estimateDepth()     ║");
  console.log("║  ✅ NEW PIPELINE — Depth Anything V2 LOCAL ONNX          ║");
  console.log("║  ❌ NO HuggingFace Inference API                         ║");
  console.log("║  ❌ NO /api/depth-token                                  ║");
  console.log("║  ❌ NO api-inference.huggingface.co                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("═══════════════════════════════════════════════════════");
  console.log("[DepthEstimator] estimateDepth() called");
  console.log("[DepthEstimator] Provider: Depth Anything V2 (LOCAL — no HuggingFace API)");
  console.log("[DepthEstimator] Model:    onnx-community/depth-anything-v2-small");
  console.log("[DepthEstimator] Input:    ", imageInput.startsWith("data:") ? `data URL (${imageInput.length} chars)` : imageInput.slice(0, 80));

  // Step 1: Load pipeline (cached after first call)
  const pipe = await loadPipeline(onProgress);

  // Step 2: Run inference
  console.log("[DepthEstimator] Running depth inference…");
  onProgress?.("Running depth estimation…");
  const t0 = performance.now();

  // The pipeline accepts data URLs, blob URLs, and HTTP URLs directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (pipe as any)(imageInput) as {
    predicted_depth: unknown;
    depth: { data: Uint8Array; width: number; height: number; channels: number };
  };

  const inferenceMs = Math.round(performance.now() - t0);
  console.log(`[DepthEstimator] Inference complete in ${inferenceMs}ms`);
  console.log(`[DepthEstimator] Depth map size: ${output.depth.width}×${output.depth.height}`);

  // Step 3: Convert to PNG data URL
  console.log("[DepthEstimator] Converting depth map to PNG data URL…");
  const depthDataUrl = await rawImageToDataUrl(output.depth);
  console.log(`[DepthEstimator] ✓ Depth URL ready (${depthDataUrl.length} chars)`);
  console.log("═══════════════════════════════════════════════════════");

  return depthDataUrl;
}

/**
 * Preload the model in the background (optional — call on PREVIS SPACE mount
 * so the model is ready before the user clicks 3D).
 */
export function preloadDepthModel(): void {
  if (typeof window === "undefined") return;
  if (_pipeline || _loadPromise) {
    console.log("[RUNTIME-VERIFY] preloadDepthModel() — pipeline already loaded/loading, skipping");
    return;
  }
  console.log("[RUNTIME-VERIFY] preloadDepthModel() — starting background model download");
  console.log("[RUNTIME-VERIFY] Model: onnx-community/depth-anything-v2-small (27MB ONNX)");
  loadPipeline().catch(err => {
    console.warn("[DepthEstimator] Background preload failed (non-fatal):", err.message);
  });
}
