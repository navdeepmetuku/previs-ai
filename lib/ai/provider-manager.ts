/**
 * AI Provider Manager — Gemini wrapper with retry, quota detection,
 * and graceful error classification.
 *
 * Components and API routes NEVER import GoogleGenerativeAI directly.
 * They call createModel() and let this manager handle failures.
 *
 * Error taxonomy:
 *   QUOTA     — 429 / "quota" / "resource exhausted" — not retryable today
 *   TRANSIENT — 503 / "unavailable" — retry once after a short backoff
 *   MODEL     — "not found" / "model" — try next model in priority list
 *   AUTH      — "API key" / "permission" — hard fail, check .env.local
 *   UNKNOWN   — anything else
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { GEMINI_MODEL_PRIORITY, GEMINI_MAX_RETRIES, GEMINI_RETRY_DELAY_MS } from "./models";

// ── Error classification ────────────────────────────────────────────────────

export type AiErrorKind = "quota" | "transient" | "model" | "auth" | "unknown";

export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    public readonly originalMessage?: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

function classify(err: unknown): AiErrorKind {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("quota") || msg.includes("resource exhausted") || msg.includes("429"))
    return "quota";
  if (msg.includes("unavailable") || msg.includes("503") || msg.includes("overloaded"))
    return "transient";
  if (msg.includes("not found") || msg.includes("model"))
    return "model";
  if (msg.includes("api key") || msg.includes("permission") || msg.includes("invalid key"))
    return "auth";
  return "unknown";
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Provider manager ────────────────────────────────────────────────────────

let _cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (_cachedClient) return _cachedClient;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("auth", "GEMINI_API_KEY is not set");
  _cachedClient = new GoogleGenerativeAI(key);
  return _cachedClient;
}

/**
 * Get a working GenerativeModel, trying each model in GEMINI_MODEL_PRIORITY.
 *
 * - Skips models that return model-not-found errors
 * - Retries once on transient 503 errors
 * - Throws AiError("quota") on quota exhaustion — callers must catch and
 *   serve fallback content rather than surfacing the error to the user
 */
export async function createModel(): Promise<GenerativeModel> {
  const client = getClient();

  for (const modelName of GEMINI_MODEL_PRIORITY) {
    let attempts = 0;
    const maxAttempts = GEMINI_MAX_RETRIES + 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const model = client.getGenerativeModel({ model: modelName });
        // Lightweight probe — just construct, don't call yet; actual errors
        // surface on the first generateContent call in the caller.
        return model;
      } catch (err) {
        const kind = classify(err);
        if (kind === "model") break;           // try next model
        if (kind === "quota") throw new AiError("quota", "Gemini quota exceeded", String(err));
        if (kind === "auth")  throw new AiError("auth", "Gemini authentication failed", String(err));
        if (kind === "transient" && attempts < maxAttempts) {
          await delay(GEMINI_RETRY_DELAY_MS);
          continue;
        }
        throw new AiError("unknown", `Gemini error (${modelName})`, String(err));
      }
    }
  }

  throw new AiError("model", "No working Gemini model found");
}

/**
 * Execute a Gemini call with automatic retry on transient errors.
 *
 * Usage:
 *   const text = await withRetry(() => model.generateContent(prompt));
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const kind = classify(err);
      if (kind === "quota") throw new AiError("quota", "Gemini quota exceeded", String(err));
      if (kind === "auth")  throw new AiError("auth", "Gemini authentication failed", String(err));
      if (kind === "transient" && attempt < GEMINI_MAX_RETRIES) {
        await delay(GEMINI_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** True if the error is a quota/rate-limit from Gemini */
export function isQuotaError(err: unknown): boolean {
  return err instanceof AiError && err.kind === "quota";
}

/** True if the error is an auth failure */
export function isAuthError(err: unknown): boolean {
  return err instanceof AiError && err.kind === "auth";
}
