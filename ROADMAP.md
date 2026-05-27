# PREVIS-LAB Development Roadmap

## Current Honest State (as of this build)

### What works and is production-quality
- Next.js + React 19 + Tailwind v4 frontend
- Gemini scene extraction with quota resilience (mock fallback)
- VISH AI director (analysis, chat, memory) with offline fallback library
- `lib/ai/provider-manager.ts` — retry, quota classification, model priority
- Image provider abstraction (`lib/providers/`) — swap with one line
- **NEW: `app/api/generate-image`** — server-side HF FLUX.1-schnell + Pollinations fallback
- **NEW: `lib/ai/image-providers/huggingface.ts`** — FLUX.1-schnell via HF Inference API
- SceneCard explicit failed state (no stickmen, always retryable)
- Timeline, presentation mode, shot list PDF export
- Project persistence, auto-save, versioning
- Rich cinematic prompts (shot + lens + lighting + colour grade + film stock)

### What still needs improvement
- Image generation consistency across scenes (no IPAdapter/InstantID yet)
- No true screenplay object extraction (entities, props, blocking)
- No vector-based continuity memory (planned for Phase 3)
- No 3D/spatial system (planned for Phase 6)

---

## Phase 1 — Foundation: DONE ✓
All generation, AI, and persistence layers are modular and separated.

## Phase 2 — Real Image Generation: IN PROGRESS

### Currently active
- `HuggingFace FLUX.1-schnell` — server-side, returns data URL, photorealistic
  - Requires: `HUGGINGFACE_API_KEY` in `.env.local`
  - Get free token: https://huggingface.co/settings/tokens
- `Pollinations sana` — free fallback, URL-based, slower

### Next steps (manual infrastructure required)
To get ComfyUI/FLUX locally running:
```
1. Install Python 3.11 + CUDA drivers
2. git clone https://github.com/comfyanonymous/ComfyUI
3. pip install -r requirements.txt
4. Download flux1-schnell.safetensors → models/checkpoints/
5. Run: python main.py --port 8188
6. Add COMFYUI_URL=http://localhost:8188 to .env.local
7. Implement lib/ai/image-providers/comfyui.ts
```

For cloud GPU (RunPod, Vast.ai):
```
1. Deploy ComfyUI Docker image
2. Set COMFYUI_URL=https://your-pod-url
3. Same lib/ai/image-providers/comfyui.ts adapter
```

For Replicate (serverless, pay-per-use):
```
1. REPLICATE_API_TOKEN=r8_...
2. Implement lib/ai/image-providers/replicate.ts
3. Model: black-forest-labs/flux-schnell
```

### Swapping providers
Edit ONE line in `lib/providers/index.ts`:
```ts
export { pollinationsProvider as activeProvider } from "./pollinations";
// Change to:
export { replicateProvider as activeProvider } from "./replicate";
```

For the server-side route, edit `app/api/generate-image/route.ts` — provider priority is explicit there.

## Phase 3 — Multimodal Brain
Requires: local Ollama + Qwen2.5-VL
```
brew install ollama
ollama pull qwen2.5-vl
```
Then implement `lib/ai/screenplay-parser.ts` using the vision model.

## Phase 4 — UX Rebuild: DONE ✓
Design system, motion language, cinematic colour tokens all in `globals.css`.

## Phase 5 — VISH Character: Partially done
Identity is in place (V badge, voice, cinematic knowledge base).
Snowman mascot and animation require a separate design pass.

## Phase 6 — Spatial/3D
Requires: `npm install three @react-three/fiber @react-three/drei`
Separate page: `app/studio/3d/page.tsx`

## Phase 7 — 2D→3D Conversion
Requires: depth estimation model (MiDaS, ZoeDepth)
Start with: `huggingface.co/Intel/dpt-large` via HF Inference API

## Phase 8 — Video
Requires: Wan2.1 or CogVideo on GPU
```
pip install torch diffusers
```
Or via Replicate: `lucataco/animate-diff`

## Phase 9 — Storyboard Delivery: DONE ✓
Shot list with PDF export, presentation mode.

## Phase 10 — Performance
Current bottleneck: sequential image generation in `ScriptInput`
Next: parallel generation with concurrency limit:
```ts
const CONCURRENT = 2;
// Use Promise pool pattern
```

## Phase 11 — Deployment
Frontend: `vercel deploy` — works today
Inference: RunPod / Modal / Lambda Labs for GPU workloads
Database: Supabase (when multi-user is needed)
Storage: Cloudflare R2 (when images need persistence beyond localStorage)

---

## Getting Better Images Today (no GPU required)

### Option A — HuggingFace Free (recommended)
1. Go to https://huggingface.co/settings/tokens
2. Create a token with READ scope (free)
3. Add to `.env.local`: `HUGGINGFACE_API_KEY=hf_xxxx`
4. Restart dev server
5. Images will be generated via FLUX.1-schnell — photorealistic, 3–8s

### Option B — Replicate ($0.003/image)
1. Create account at replicate.com
2. Add `REPLICATE_API_TOKEN=r8_xxxx` to `.env.local`
3. Implement `lib/ai/image-providers/replicate.ts` (30 lines)
4. Update `app/api/generate-image/route.ts` to try Replicate first

### Option C — Local ComfyUI (best quality, free after setup)
Requires NVIDIA GPU with 8GB+ VRAM. See Phase 2 instructions above.
