/** Runtime image generation status — tracked in component state, never persisted */
export type ImageStatus = "idle" | "generating" | "loaded" | "failed";

// ── 3D Previs architecture prep ─────────────────────────────────────────────

export interface CinematicMeta {
  focalLengthMm:    number | null;
  lensType:         "spherical" | "anamorphic" | "macro" | null;
  cameraHeight:     "eye-level" | "low" | "high" | "overhead" | null;
  cameraMovement:   "static" | "dolly" | "handheld" | "crane" | "drone" | null;
  depthLayers:      string[];
  environmentTags:  string[];
  characterBlocking: string | null;
  blenderSceneId:      string | null;
  blenderCameraPreset: string | null;
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineMeta {
  durationSeconds: number | null;
  transitionType:  "cut" | "dissolve" | "fade" | "wipe" | "smash-cut" | "match-cut" | null;
  beatMarker:      "action" | "dialogue" | "silence" | "climax" | "setup" | null;
  paceLabel:       "slow" | "normal" | "fast" | "staccato" | null;
  directorNotes:   string | null;
}

// ── Review annotations ───────────────────────────────────────────────────────

export interface ReviewMeta {
  isFavorite:    boolean;
  priorityLevel: "high" | "medium" | "low" | null;
  productionTag: "approved" | "revision" | "hold" | "ready" | null;
  revisionNote:  string | null;
}

// ── AI Director intelligence ─────────────────────────────────────────────────

/** Per-scene AI analysis — returned by /api/ai-director analyze-scene */
export interface SceneInsight {
  sceneId:            string;
  cameraAdvice:       string;
  lensRecommendation: string;
  lightingNote:       string;
  cinematicReference: string;
  cinematographerRef: string;
  improvementTip:     string;
  emotionalIntensity: number;
  references:         string[];
}

/** Full-sequence analysis — returned by /api/ai-director analyze-sequence */
export interface SequenceInsight {
  overallRhythm:  "tight" | "balanced" | "sluggish" | "uneven";
  directorNote:   string;
  pacingIssues:   string[];
  emotionalArc:   { sceneId: string; intensity: number }[];
  suggestions:    string[];
}

/** Single message in the director chat thread */
export interface DirectorMessage {
  id:      string;
  role:    "user" | "director";
  content: string;
  time:    number;
}

// ── Director Memory — VISH creative profile ──────────────────────────────────
//
// Derived locally from scene data + stored in localStorage per project.
// Injected into every VISH call so responses reference accumulated context.

export interface DirectorMemory {
  projectId: string;
  updatedAt: number;

  // ── Computed patterns (derived from scene metadata, no AI needed) ──────────
  dominantLighting:  string;    // most-used lighting value
  dominantMoods:     string[];  // top 3 moods
  dominantShotTypes: string[];  // top 3 shot types
  dominantLens:      string | null; // from cinematicMeta, if set on any scene
  dominantMovement:  string | null; // from cinematicMeta, if set on any scene
  locationVariety:   number;    // unique locations / total (0–1)
  moodVariety:       number;    // unique moods / total (0–1)

  // ── VISH-generated creative tendency observations ─────────────────────────
  // Written by Gemini after analyzing the full pattern set.
  // Array of short sentences like "Prefers intimate close-ups for emotional beats."
  creativeTendencies: string[];

  // ── VISH-generated continuity flags ───────────────────────────────────────
  // Patterns VISH considers worth flagging: repetition, gaps, inconsistencies.
  continuityFlags: string[];

  // ── Director-written creative intent ─────────────────────────────────────
  directorIntent: string; // free text, editable in Memory tab
}

// ── Production Notes ─────────────────────────────────────────────────────────
//
// Lightweight per-scene and per-project notes.
// Stored in localStorage; injected into VISH context so every response
// can reference stated intentions and revisions.

export interface ProductionNote {
  id:        string;
  projectId: string;
  sceneId:   string | null;     // null = project-level note
  content:   string;
  category:  "intention" | "revision" | "camera" | "lighting" | "general";
  createdAt: number;
}

// ── Production pipeline ──────────────────────────────────────────────────────

/**
 * Per-shot production status — maps to a real previs pipeline stage.
 * Stored on Scene.reviewMeta.productionTag but also tracked via
 * the dedicated ProductionStatus type for filtering/searching.
 */
export type ProductionStatus =
  | "draft"      // first pass, image not yet reviewed
  | "blocking"   // camera blocking planned
  | "previs"     // previs image generated
  | "approved"   // director approved
  | "ready";     // production-ready, cleared for shoot

/** A saved version of a shot's image — supports shot iteration workflow */
export interface ShotVersion {
  id:         string;
  imageUrl:   string;
  imagePrompt: string;
  createdAt:  number;
  label:      string;   // e.g. "Version 1", "Handheld take", "Fincher rework"
}

/** An act/sequence marker on the project timeline */
export interface ActMarker {
  id:        string;
  label:     string;   // "Act I", "Inciting Incident", "Climax"
  afterSceneId: string; // marker sits after this scene
  color:     string;   // hex or tailwind color name
}

export interface Scene {
  id:          string;
  order:       number;
  title:       string;
  description: string;
  shotType:    string;
  lighting:    string;
  mood:        string;
  characters:  string;
  location:    string;
  imageUrl:    string | null;
  imagePrompt: string | null;

  cinematicMeta?: Partial<CinematicMeta>;
  timelineMeta?:  Partial<TimelineMeta>;
  reviewMeta?:    Partial<ReviewMeta>;

  /** Saved shot iterations — supports version compare/restore */
  versions?: ShotVersion[];
}

// ── Story visual memory ──────────────────────────────────────────────────────

export interface StoryVisualMemory {
  genre:           string;
  filmStyle:       string;
  colorGrade:      string;
  atmosphericBase: string;
  /** Dominant mood across all scenes — drives grade consistency */
  dominantMood:    string;
  /** Most-used shot type — defines the film's visual rhythm */
  dominantShotType: string;
  /** Most-used camera movement — defines the film's kinetic feel */
  dominantMovement: string | null;
  /** Contrast profile derived from dominant mood */
  contrastProfile:  "high" | "medium" | "low" | "flat";
}

// ── Continuity context ───────────────────────────────────────────────────────
// Stored on Project after screenplay parsing.
// Imported as type only here — full implementation in lib/continuity/.

export interface CharacterVisual {
  name:       string;
  descriptor: string;
  prominence: number;
  rawTokens:  string[];
}

export interface EnvironmentVisual {
  key:        string;
  location:   string;
  descriptor: string;
  timeOfDay:  "DAY" | "NIGHT" | "DUSK" | "DAWN" | "CONTINUOUS" | "UNKNOWN";
  atmosphere: string[];
}

/** Full continuity context built once from the screenplay, stored on Project */
export interface ProjectVisualContext {
  characters:   CharacterVisual[];
  environments: EnvironmentVisual[];
  atmosphere:   string[];
  propWords:    string[];
}

// ── Project ─────────────────────────────────────────────────────────────────

export interface Project {
  id:        string;
  title:     string;
  genre:     string;
  createdAt: string;
  updatedAt: string;
  scenes:    Scene[];
  storyMemory?:    StoryVisualMemory;
  /** Full continuity context — built once from screenplay, stored for re-use */
  visualContext?:  ProjectVisualContext;
  fps?:            number;
  aspectRatio?:    string;
  totalDuration?:  number;
  actMarkers?:     ActMarker[];
}

