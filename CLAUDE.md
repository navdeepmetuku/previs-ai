# PREVIS-AI — Project State & Handoff Document

Last updated: Phase 12 complete. Production build clean. All systems stable.

---

## Quick Start

```bash
npm install
npm run dev   # → http://localhost:3000
```

Requires `.env.local` (see Environment Variables section below).

---

## Architecture Overview

```
app/
  page.tsx              → Landing page
  studio/page.tsx       → Main Studio (project dashboard + storyboard editor)
  previs-space/page.tsx → 3D Spatial Workspace (R3F)
  final-storyboard/     → Legacy storyboard view
  api/
    extract-scenes/     → Gemini scene extraction + prompt building
    generate-image/     → Image generation (Pollinations → fal.ai → Replicate cascade)
    ai-director/        → VISH AI director (scene/sequence analysis + chat)
    debug-env/          → Environment variable diagnostic endpoint

components/
  StoryboardView.tsx    → Studio storyboard grid + timeline
  SceneCard.tsx         → 2D storyboard card with image loading
  SceneDetail.tsx       → Scene editing panel (right sidebar)
  ScriptInput.tsx       → Script input + extraction + background generation
  AiDirectorPanel.tsx   → VISH chat panel in Studio
  PrevisSpace/
    Workspace.tsx       → Main R3F canvas + camera + scene management
    SceneCard3D.tsx     → 3D storyboard card with texture system
    CinematicEnvironment.tsx → Blender-style 3D environment
    VishOrb.tsx         → Animated VISH AI presence in 3D
    MiniTimeline.tsx    → Filmstrip sequence rail (drag-to-reorder)
    ShotDetailPanel.tsx → Selected shot metadata + director notes
    VishDirectorPanel.tsx → VISH AI panel with generation controls
    StoryEngine.tsx     → Narrative intelligence (arc, cast, continuity)
    ReviewMode.tsx      → Fullscreen cinematic presentation mode

lib/
  image-prompts.ts      → Cinematic prompt engine (CENTRAL — all prompts go here)
  story-memory.ts       → Project-level visual DNA (genre/style/grade)
  director-memory.ts    → Director tendency tracking + localStorage
  ai-director.ts        → Gemini AI director functions
  gemini.ts             → Scene extraction via Gemini
  image-providers/
    manager.ts          → Provider cascade: Replicate → fal.ai → Pollinations
    replicate.ts        → Replicate FLUX.1-schnell (presentation quality)
    fal.ts              → fal.ai FLUX.1-schnell
    pollinations.ts     → Pollinations FLUX (always free, no key)
  continuity/
    visual-context.ts   → Character + environment continuity orchestration
    character-memory.ts → Character visual descriptors
    environment-memory.ts → Location visual descriptors
    screenplay-parser.ts → Screenplay text analysis

hooks/
  useGenerationQueue.ts → Background sequential image generation queue

types/index.ts          → All TypeScript types (Scene, Project, etc.)
```

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
# Required for scene extraction + VISH AI
GEMINI_API_KEY=AIzaSy...

# Optional — HuggingFace (currently blocked on some networks)
HUGGINGFACE_API_KEY=hf_...

# Optional — fal.ai FLUX generation (requires billing top-up at fal.ai/dashboard/billing)
FAL_KEY=uuid:secret

# Optional — Replicate FLUX generation (presentation quality, free trial credits)
# Get token at: https://replicate.com/account/api-tokens
# REPLICATE_API_TOKEN=r8_...
```

### Provider selection logic
The system auto-selects the best available provider in priority order:
1. **Replicate** — if `REPLICATE_API_TOKEN` is set → best quality FLUX
2. **fal.ai** — if `FAL_KEY` is set AND account has credits
3. **Pollinations** — always available, no key needed, free forever (dev default)

**To switch from dev → presentation:** uncomment `REPLICATE_API_TOKEN` in `.env.local`, restart server.

---

## System Status

### ✅ Fully Working
- **Studio** — project dashboard, scene extraction, storyboard editor, shot detail panel
- **PREVIS SPACE** — 3D viewport (R3F), card rendering, orbit camera, all UI panels
- **Image generation** — Pollinations provider working reliably (37KB base64 images)
- **SceneCard texture system** — canvas-based WebGL texture upload, no infinite loops
- **VISH Director Panel** — sequence analysis, shot analysis, AI chat (all 3 tabs)
- **Story Engine** — emotional arc, cast tracking, location heatmap, continuity issues
- **Shot Detail Panel** — metadata grid + 6-category director notes
- **Cinematic prompt engine** — 12-layer prompts with DOP references, continuity injection
- **Review Mode** — fullscreen presentation, auto-play, A/B compare, scrubber
- **Sequence Timeline** — drag-to-reorder, duration-proportional widths, mood colors
- **Project persistence** — localStorage save/load, project dashboard with pipeline stages
- **Error boundaries** — broken cards never crash the Canvas

### ⚠️ Partially Working
- **fal.ai provider** — code correct, auth works, but current account has $0 balance
- **Character continuity** — descriptors built from screenplay parsing (heuristic, not AI-assisted). Works well when screenplay has explicit character descriptions.
- **PREVIS SPACE image sync** — images appear when navigating from Studio to PREVIS SPACE; same-tab live sync requires hard refresh for immediate update (cross-tab storage events work automatically)

### 🔲 Placeholder / Future
- **Export system** — PDF export button shows placeholder alert. Architecture ready.
- **Replicate provider** — fully implemented, just needs a token with credits
- **Collaboration** — data structure prepared (no multiplayer yet)
- **Camera movement in generation** — `cinematicMeta.cameraMovement` injected into prompt but scene editor doesn't yet expose a UI control for it
- **IPAdapter/ControlNet character consistency** — text-descriptor approach now; reference-image conditioning planned for Phase 4

---

## Known Limitations

1. **Image persistence** — images stored as base64 in localStorage. For projects with many generated images (6+ scenes), localStorage can approach limits (~5MB). Future: move to IndexedDB or server-side storage.

2. **PREVIS SPACE live sync** — PREVIS SPACE reads localStorage once on mount. If you generate in Studio and immediately open PREVIS SPACE in the same tab, you may need one refresh. Cross-tab works automatically via storage events.

3. **Pollinations quality** — Pollinations uses FLUX Schnell (same model as fal.ai) but without fine-tuned prompting control. Output is good but varies more than fal.ai/Replicate.

4. **VISH AI chat** — requires Gemini API key. Without it, falls back to pre-written cinematic responses from `lib/ai/vish-fallbacks.ts`.

---

## Recommended Next Steps

1. **Add REPLICATE_API_TOKEN** → instant quality upgrade, ~$5 of free credits
2. **IndexedDB image storage** → removes localStorage size limit
3. **Camera movement UI** → expose `cinematicMeta.cameraMovement` in SceneDetail
4. **Shot comparison in Review Mode** → A/B compare already built, needs keyboard shortcut polish
5. **PDF export** → html2canvas + jsPDF or server-side Puppeteer
6. **IPAdapter character consistency** → when a reference image exists per character

---

## Key Files to Read First (new developer)

1. `types/index.ts` — all data types
2. `lib/image-prompts.ts` — prompt engine (most important lib file)
3. `components/PrevisSpace/Workspace.tsx` — 3D workspace architecture
4. `app/api/generate-image/route.ts` — generation pipeline entry point
5. `lib/image-providers/manager.ts` — provider cascade logic
