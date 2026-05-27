/**
 * HuggingFace Inference API — FLUX.1-schnell image provider.
 *
 * Model: black-forest-labs/FLUX.1-schnell
 * Returns: binary image → base64 data URL
 *
 * Requires: HUGGINGFACE_API_KEY in .env.local
 * Get one free at: https://huggingface.co/settings/tokens (READ scope)
 */

const HF_MODEL_URL =
  "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";

// FLUX.1-schnell requires dimensions divisible by 64.
// 768×448: 768/64=12 ✓  448/64=7 ✓  (closest 16:9 pair with 64-alignment)
const IMG_WIDTH  = 768;
const IMG_HEIGHT = 448;

export interface HfGenerateResult {
  dataUrl:    string;   // "data:image/jpeg;base64,..."
  provider:   "huggingface";
  model:      string;
  durationMs: number;
  bytes:      number;
}

/** Classified error kind returned in HfError.kind */
export type HfErrorKind =
  | "no_key"
  | "invalid_token"
  | "rate_limit"
  | "model_loading"
  | "bad_response"
  | "timeout"
  | "network"
  | "unknown";

export class HfError extends Error {
  constructor(
    public readonly kind: HfErrorKind,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "HfError";
  }
}

export async function generateImageHF(
  prompt: string,
  seed?: number,
): Promise<HfGenerateResult> {
  const key = process.env.HUGGINGFACE_API_KEY?.trim();

  // ── Key check ───────────────────────────────────────────────────────────
  if (!key) {
    throw new HfError("no_key", "HUGGINGFACE_API_KEY is not set");
  }

  const keyPrefix = key.slice(0, 12) + "…";
  console.log(`[HF] key loaded: ${keyPrefix} | model: FLUX.1-schnell`);
  console.log(`[HF] target: ${HF_MODEL_URL}`);
  console.log(`[HF] dimensions: ${IMG_WIDTH}×${IMG_HEIGHT} (64-aligned)`);

  const t0 = Date.now();

  // ── Payload ──────────────────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    inputs: prompt,
    parameters: {
      num_inference_steps: 4,
      guidance_scale:      3.5,   // schnell works better with small positive guidance
      width:               IMG_WIDTH,
      height:              IMG_HEIGHT,
    },
  };
  if (seed != null && seed > 0) {
    (payload.parameters as Record<string, unknown>).seed = seed;
  }

  const payloadStr = JSON.stringify(payload);
  console.log(`[HF] payload bytes: ${payloadStr.length}`);
  console.log(`[HF] prompt (${prompt.length} chars): ${prompt.slice(0, 120)}…`);

  // ── Request ───────────────────────────────────────────────────────────────
  let response: Response;
  try {
    response = await fetch(HF_MODEL_URL, {
      method: "POST",
      headers: {
        "Authorization":    `Bearer ${key}`,
        "Content-Type":     "application/json",
        "x-wait-for-model": "true",
      },
      body: payloadStr,
      signal: AbortSignal.timeout(55_000),
    });
  } catch (fetchErr) {
    const isTimeout = fetchErr instanceof Error && fetchErr.name === "TimeoutError";
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[HF] fetch failed — ${isTimeout ? "TIMEOUT (55s)" : msg}`);
    throw new HfError(
      isTimeout ? "timeout" : "network",
      isTimeout ? "HuggingFace request timed out after 55 s" : `Network error: ${msg}`,
      msg,
    );
  }

  const elapsed = Date.now() - t0;
  const ct = response.headers.get("content-type") ?? "(none)";
  console.log(`[HF] response: HTTP ${response.status} | content-type: ${ct} | ${elapsed}ms`);

  // ── Error responses ────────────────────────────────────────────────────────
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[HF] error body: ${body.slice(0, 400)}`);

    if (response.status === 401 || response.status === 403) {
      throw new HfError("invalid_token", "HuggingFace token is invalid or lacks permission", body);
    }
    if (response.status === 429) {
      throw new HfError("rate_limit", "HuggingFace rate limit exceeded — try again in 60 s", body);
    }
    if (response.status === 503) {
      // 503 with x-wait-for-model means the wait itself timed out
      throw new HfError("model_loading", "HuggingFace model is still loading — retry in 20 s", body);
    }
    throw new HfError("bad_response", `HuggingFace HTTP ${response.status}`, body.slice(0, 200));
  }

  // ── Content-type guard — ensure we got an image, not a JSON error body ────
  if (!ct.startsWith("image/")) {
    const body = await response.text().catch(() => "");
    console.error(`[HF] unexpected content-type "${ct}" — body: ${body.slice(0, 300)}`);
    throw new HfError(
      "bad_response",
      `Expected image response but got "${ct}"`,
      body.slice(0, 200),
    );
  }

  // ── Decode ─────────────────────────────────────────────────────────────────
  const buffer   = await response.arrayBuffer();
  const bytes    = buffer.byteLength;
  const base64   = Buffer.from(buffer).toString("base64");
  const dataUrl  = `data:${ct};base64,${base64}`;

  console.log(`[HF] ✅ success — ${bytes} bytes | ${elapsed}ms | data URL: ${dataUrl.slice(0, 40)}…`);

  return {
    dataUrl,
    provider:   "huggingface",
    model:      "FLUX.1-schnell",
    durationMs: elapsed,
    bytes,
  };
}

/** Returns true only if the key is non-empty */
export function isHuggingFaceConfigured(): boolean {
  return Boolean(process.env.HUGGINGFACE_API_KEY?.trim());
}
