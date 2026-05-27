/**
 * AI Model Registry — single source of truth for every model name.
 *
 * Update here to upgrade models across the entire application without
 * touching any other file. The provider-manager reads from this list
 * and tries them in priority order.
 *
 * Confirmed working against the current API key:
 *   gemini-flash-latest  — fast, reliable on free tier
 *
 * Try on a fresh API key (may hit quota on free tier):
 *   gemini-2.0-flash     — higher quality, more context
 *   gemini-2.0-flash-lite — fastest, lowest quota cost
 */

export const GEMINI_MODELS = {
  /** Primary — confirmed working on free tier */
  PRIMARY:   "gemini-flash-latest",
  /** Secondary — better quality, use when primary quota is exceeded */
  SECONDARY: "gemini-2.0-flash",
  /** Lite — lowest token cost, use for high-frequency calls */
  LITE:      "gemini-2.0-flash-lite",
} as const;

/**
 * Ordered list — provider-manager tries these in sequence.
 * Reorder to change the preference.
 */
export const GEMINI_MODEL_PRIORITY: string[] = [
  GEMINI_MODELS.PRIMARY,
  GEMINI_MODELS.SECONDARY,
];

/** Maximum retries for a single transient (503) failure */
export const GEMINI_MAX_RETRIES = 1;

/** Backoff delay (ms) before a transient retry */
export const GEMINI_RETRY_DELAY_MS = 2000;
