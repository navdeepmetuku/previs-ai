/**
 * ImageProvider — unified interface for all image generation backends.
 *
 * Every provider (HuggingFace, fal.ai, Replicate, ComfyUI) implements this.
 * The orchestration route talks only to this interface — providers are
 * completely interchangeable without touching any other file.
 *
 * Scalability:
 *   Adding ControlNet, IPAdapter, or InstantID means adding optional fields
 *   to GenerateOptions and implementing them in the relevant adapter.
 *   The interface itself stays stable.
 */

export interface GenerateOptions {
  prompt:         string;
  negativePrompt?: string;
  seed?:           number;
  width?:          number;
  height?:         number;
  /** Number of denoising steps — provider adapters set sensible defaults */
  steps?:          number;
}

export interface GenerateResult {
  /** base64 data URL: "data:image/jpeg;base64,..." */
  dataUrl:    string;
  provider:   string;
  model:      string;
  durationMs: number;
  bytes:      number;
}

export type ProviderErrorKind =
  | "no_key"
  | "invalid_token"
  | "rate_limit"
  | "model_loading"   // 503 cold start — retryable
  | "bad_response"
  | "timeout"         // fetch timeout — retryable
  | "network"         // connection error — retryable
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public readonly kind:     ProviderErrorKind,
    message:                  string,
    public readonly detail?:  string,
    public readonly provider: string = "unknown",
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable(): boolean {
    return (
      this.kind === "model_loading" ||
      this.kind === "timeout"       ||
      this.kind === "network"
    );
  }
}

export interface ImageProvider {
  readonly name:    string;
  readonly isReady: boolean; // returns false if required env vars are missing

  generate(options: GenerateOptions): Promise<GenerateResult>;
}
