"use client";

/**
 * VISH Panel — cinematic AI co-director with creative memory.
 *
 * Tab 1: Shot    — per-scene insight (camera, lens, lighting, references)
 * Tab 2: Flow    — full-sequence pacing & emotional arc
 * Tab 3: Chat    — conversational session with VISH (memory-aware)
 * Tab 4: Memory  — director memory, creative tendencies, production notes
 *
 * Memory is derived locally from scene patterns, then VISH enriches it
 * with creative tendency observations via Gemini. Memory is injected into
 * every API call so VISH responses reference accumulated creative choices.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type {
  Project, Scene, SceneInsight, SequenceInsight,
  DirectorMessage, DirectorMemory, ProductionNote,
} from "@/types";
import {
  loadMemory, saveMemory, loadNotes, saveNote, deleteNote,
  deriveMemory, memoryToContext,
} from "@/lib/director-memory";

// ── Cinematic presets ─────────────────────────────────────────────────────────
interface CinematicPreset { label: string; icon: string; prompt: string; }

const PRESETS: CinematicPreset[] = [
  { label: "Villeneuve", icon: "🌅", prompt: "Apply Denis Villeneuve's visual language — epic wide frames, meditative pacing, extreme environmental scale, sparse human presence against vast landscapes." },
  { label: "Fincher",    icon: "🔦", prompt: "Fincher mode: clinical symmetry, flat cold LED sources, precise geometric framing, oppressive atmosphere, every cut earned." },
  { label: "Nolan",      icon: "🎞", prompt: "Nolan-style: IMAX-scale practical photography, non-linear emotional architecture, grand intercut with intimate close-ups, Hans Zimmer rhythm." },
  { label: "Handheld",   icon: "📷", prompt: "Go full Greengrass — gritty 16mm-feeling handheld, available light, restless observational camera, documentary intimacy." },
  { label: "Suspense",   icon: "😰", prompt: "Maximize dread: Hitchcock slow-zoom reveals, Dutch tilts, extended silences before punctuating cuts, Herrmann-style tension mounting." },
  { label: "Emotional",  icon: "💛", prompt: "Heighten emotional resonance: tighter close-ups on faces, warmer practical sources, slower cutting rhythm, Wong Kar-wai soft bokeh." },
];

interface Props {
  project:       Project;
  selectedScene: Scene | null;
  onClose:       () => void;
}

type Tab = "insights" | "flow" | "chat" | "memory";

export default function AiDirectorPanel({ project, selectedScene, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("insights");

  // ── Memory state (persisted in localStorage) ──────────────────────────────
  const [memory, setMemory] = useState<DirectorMemory | null>(null);
  const [notes,  setNotes]  = useState<ProductionNote[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);

  // ── Insight tab ────────────────────────────────────────────────────────────
  const [insight,        setInsight]        = useState<SceneInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError,   setInsightError]   = useState<string | null>(null);
  const insightCache = useRef<Map<string, SceneInsight>>(new Map());

  // ── Flow tab ───────────────────────────────────────────────────────────────
  const [seqInsight, setSeqInsight] = useState<SequenceInsight | null>(null);
  const [seqLoading, setSeqLoading] = useState(false);
  const [seqError,   setSeqError]   = useState<string | null>(null);

  // ── Chat tab ───────────────────────────────────────────────────────────────
  const [messages,    setMessages]    = useState<DirectorMessage[]>([]);
  const [chatInput,   setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ── Memory tab UI ─────────────────────────────────────────────────────────
  const [noteInput,    setNoteInput]    = useState("");
  const [noteCategory, setNoteCategory] = useState<ProductionNote["category"]>("general");
  const [intentInput,  setIntentInput]  = useState("");

  // ── Bootstrap: load memory + notes on mount / project change ─────────────
  useEffect(() => {
    const existing = loadMemory(project.id);
    const derived  = deriveMemory(project.scenes, project.id, existing);
    saveMemory(derived);
    setMemory(derived);
    setIntentInput(derived.directorIntent ?? "");

    const savedNotes = loadNotes(project.id);
    setNotes(savedNotes);
  }, [project.id, project.scenes]);

  // Compact context string injected into every VISH API call
  const memoryContext = useMemo(
    () => memory ? memoryToContext(memory, notes) : "",
    [memory, notes],
  );

  // ── Auto-fetch insight when selected scene changes ────────────────────────
  useEffect(() => {
    if (!selectedScene || tab !== "insights") return;
    fetchInsight(selectedScene);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScene?.id, tab]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── API helpers ────────────────────────────────────────────────────────────

  const fetchInsight = useCallback(async (scene: Scene) => {
    const cached = insightCache.current.get(scene.id);
    if (cached) { setInsight(cached); return; }

    setInsightLoading(true);
    setInsightError(null);
    try {
      const res  = await fetch("/api/ai-director", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze-scene", scene, memoryContext,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes: project.scenes },
        }),
      });
      const data = await res.json() as { insight?: SceneInsight; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      insightCache.current.set(scene.id, data.insight!);
      setInsight(data.insight!);
    } catch (e) {
      setInsightError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setInsightLoading(false);
    }
  // project.id is stable; project.scenes can change but cache invalidation
  // is handled by the scene.id key, not the project reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, memoryContext]);

  async function fetchSequence() {
    setSeqLoading(true); setSeqError(null);
    try {
      const res  = await fetch("/api/ai-director", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze-sequence", scenes: project.scenes, memoryContext,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes: project.scenes },
        }),
      });
      const data = await res.json() as { insight?: SequenceInsight; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setSeqInsight(data.insight!);
    } catch (e) { setSeqError(e instanceof Error ? e.message : "Unknown error"); }
    finally     { setSeqLoading(false); }
  }

  async function sendChat(content: string) {
    if (!content.trim()) return;
    const userMsg: DirectorMessage = { id: `u-${Date.now()}`, role: "user", content, time: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next); setChatInput(""); setChatLoading(true);
    try {
      const res  = await fetch("/api/ai-director", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat", messages: next, selectedScene, memoryContext,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes: project.scenes },
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setMessages(m => [...m, { id: `d-${Date.now()}`, role: "director", content: data.reply!, time: Date.now() }]);
    } catch (e) {
      setMessages(m => [...m, {
        id: `e-${Date.now()}`, role: "director",
        content: `VISH encountered an error: ${e instanceof Error ? e.message : "Unknown"}. Try again.`,
        time: Date.now(),
      }]);
    } finally { setChatLoading(false); }
  }

  async function fetchTendencies() {
    if (!memory) return;
    setMemoryLoading(true);
    try {
      const res  = await fetch("/api/ai-director", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-tendencies", memory,
          project: { title: project.title, genre: project.genre, scenes: project.scenes },
        }),
      });
      const data = await res.json() as { tendencies?: string[]; flags?: string[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      const updated: DirectorMemory = { ...memory, creativeTendencies: data.tendencies ?? [], continuityFlags: data.flags ?? [], updatedAt: Date.now() };
      saveMemory(updated);
      setMemory(updated);
    } catch { /* silently fail — memory stays as-is */ }
    finally { setMemoryLoading(false); }
  }

  function applyPreset(preset: CinematicPreset) {
    setTab("chat");
    setTimeout(() => sendChat(preset.prompt), 50);
  }

  function addNote() {
    if (!noteInput.trim()) return;
    const note: ProductionNote = {
      id:        `n-${Date.now()}`,
      projectId: project.id,
      sceneId:   selectedScene?.id ?? null,
      content:   noteInput.trim(),
      category:  noteCategory,
      createdAt: Date.now(),
    };
    saveNote(note);
    const updated = [note, ...notes];
    setNotes(updated);
    setNoteInput("");
  }

  function removeNote(id: string) {
    deleteNote(project.id, id);
    setNotes(n => n.filter(x => x.id !== id));
  }

  function saveIntent() {
    if (!memory) return;
    const updated = { ...memory, directorIntent: intentInput, updatedAt: Date.now() };
    saveMemory(updated);
    setMemory(updated);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#080810] border-l border-white/5 text-white">

      {/* VISH Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0 bg-[#06060f]">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center h-6 w-6">
            <div className="absolute inset-0 rounded-sm bg-amber-400/10 border border-amber-400/25" />
            <span className="relative text-amber-400 text-[9px] font-black tracking-widest">V</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-white/90 tracking-wider leading-none">VISH</span>
            <span className="text-[7px] font-mono text-white/20 uppercase tracking-widest">
              {project.genre} · {project.scenes.length} shots
              {memory?.creativeTendencies.length ? ` · ${memory.creativeTendencies.length} observations` : ""}
            </span>
          </div>
        </div>
        <button onClick={onClose}
          className="h-6 w-6 rounded-full flex items-center justify-center text-white/25 hover:text-white hover:bg-white/8 transition-all text-xs">
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0 bg-[#06060f]">
        {(["insights","flow","chat","memory"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={[
              "flex-1 py-2 text-[8px] font-mono uppercase tracking-widest transition-all",
              tab === t ? "text-amber-400 border-b-2 border-amber-400 bg-amber-400/5" : "text-white/25 hover:text-white/50",
            ].join(" ")}>
            {t === "insights" ? "Shot" : t === "flow" ? "Flow" : t === "chat" ? "Chat" : "Memory"}
          </button>
        ))}
      </div>

      {/* ── SHOT TAB ── */}
      {tab === "insights" && (
        <div className="flex-1 overflow-y-auto">
          {!selectedScene ? (
            <EmptyState text="Select a shot and VISH will read the scene — camera placement, lens, light, and cinematic references." />
          ) : insightLoading ? (
            <LoadingState label={`VISH is reading Shot ${String(selectedScene.order).padStart(2,"0")}…`} />
          ) : insightError ? (
            <ErrorState message={insightError} onRetry={() => fetchInsight(selectedScene)} />
          ) : insight && insight.sceneId === selectedScene.id ? (
            <InsightDisplay insight={insight} scene={selectedScene} />
          ) : (
            <div className="p-4">
              <button onClick={() => fetchInsight(selectedScene)}
                className="w-full rounded-lg border border-white/8 py-3 text-[10px] font-mono text-white/40 hover:border-amber-400/30 hover:text-amber-400/60 transition-all">
                Ask VISH to read Shot {String(selectedScene.order).padStart(2,"0")}
              </button>
            </div>
          )}

          {/* Memory continuity note for this scene */}
          {selectedScene && memory?.continuityFlags.length ? (
            <div className="mx-4 mb-2 rounded-md bg-yellow-400/4 border border-yellow-400/10 p-2">
              <p className="text-[7px] font-mono text-yellow-400/40 uppercase tracking-widest mb-1">VISH continuity</p>
              {memory.continuityFlags.slice(0, 2).map((f, i) => (
                <p key={i} className="text-[9px] text-white/35 leading-snug">⚠ {f}</p>
              ))}
            </div>
          ) : null}

          {/* Style Presets */}
          <div className="border-t border-white/5 p-3">
            <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-2">VISH Presets</p>
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map(preset => (
                <button key={preset.label} onClick={() => applyPreset(preset)}
                  className="rounded-md border border-white/6 bg-white/[0.02] px-2 py-1.5 text-center hover:border-amber-400/25 hover:bg-amber-400/5 transition-all group">
                  <span className="block text-sm leading-tight">{preset.icon}</span>
                  <span className="text-[7px] font-mono text-white/30 group-hover:text-amber-400/60 uppercase tracking-wide">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FLOW TAB ── */}
      {tab === "flow" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!seqInsight && !seqLoading && (
            <button onClick={fetchSequence}
              className="w-full rounded-lg border border-white/8 py-3 text-[10px] font-mono text-white/40 hover:border-amber-400/30 hover:text-amber-400/60 transition-all">
              Ask VISH to read the full sequence ({project.scenes.length} shots)
            </button>
          )}
          {seqLoading && <LoadingState label="VISH is reading the sequence…" />}
          {seqError   && <ErrorState message={seqError} onRetry={fetchSequence} />}
          {seqInsight && (
            <>
              <div className="flex items-center gap-2">
                <span className={`rounded-sm px-2 py-0.5 text-[9px] font-mono font-bold uppercase border ${rhythmStyle(seqInsight.overallRhythm)}`}>
                  {seqInsight.overallRhythm}
                </span>
                <span className="text-[9px] text-white/30 font-mono">overall rhythm</span>
              </div>
              <div className="rounded-md bg-white/[0.03] border border-white/5 p-3">
                <p className="text-[7px] font-mono text-amber-400/50 uppercase tracking-widest mb-1.5">VISH reads</p>
                <p className="text-[10px] text-white/70 leading-relaxed">{seqInsight.directorNote}</p>
              </div>
              {/* Emotional arc bars */}
              <div>
                <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-2">Emotional Arc</p>
                <div className="flex items-end gap-1 h-12">
                  {seqInsight.emotionalArc.map((pt, i) => {
                    const sc  = project.scenes.find(s => s.id === pt.sceneId);
                    const pct = (pt.intensity / 10) * 100;
                    return (
                      <div key={pt.sceneId} className="flex flex-col items-center gap-1 flex-1">
                        <div className="w-full rounded-t-sm"
                          style={{ height: `${pct}%`, minHeight: 2, background: `hsl(${30 + pt.intensity * 6},80%,55%)` }}
                          title={sc ? `${sc.title}: ${pt.intensity}/10` : ""} />
                        <span className="text-[6px] font-mono text-white/20">{i + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {seqInsight.pacingIssues.length > 0 && (
                <div>
                  <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Issues</p>
                  {seqInsight.pacingIssues.map((issue, i) => (
                    <div key={i} className="flex gap-2 items-start mb-1.5">
                      <span className="text-yellow-400/60 text-[9px] mt-0.5 shrink-0">⚠</span>
                      <p className="text-[9px] text-white/55 leading-snug">{issue}</p>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Suggestions</p>
                {seqInsight.suggestions.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start mb-1.5">
                    <span className="text-amber-400/60 text-[9px] mt-0.5 shrink-0">→</span>
                    <p className="text-[9px] text-white/65 leading-snug">{s}</p>
                  </div>
                ))}
              </div>
              <button onClick={fetchSequence} className="text-[8px] font-mono text-white/20 hover:text-white/40 transition-colors">
                ↺ Ask VISH again
              </button>
            </>
          )}
        </div>
      )}

      {/* ── CHAT TAB ── */}
      {tab === "chat" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="pt-4 px-1">
                <div className="flex items-start gap-2 mb-4">
                  <VishBadge />
                  <p className="text-[10px] text-white/50 leading-relaxed">
                    {selectedScene
                      ? `Shot ${selectedScene.order} — "${selectedScene.title}". ${selectedScene.shotType}, ${selectedScene.mood.toLowerCase()} mood. What do you want to shape?`
                      : `I've read all ${project.scenes.length} shots. Ask me anything about this ${project.genre.toLowerCase()} sequence.`
                    }
                  </p>
                </div>
                <div className="space-y-1.5">
                  {(selectedScene ? [
                    `How can I make Shot ${selectedScene.order} more ${selectedScene.mood.toLowerCase()}?`,
                    `What lens would you use for this ${selectedScene.shotType}?`,
                    `Suggest a stronger transition into this shot.`,
                    `What film would you reference for this framing?`,
                  ] : [
                    "Where is the sequence weakest?",
                    "How can I improve the pacing?",
                    `Make this feel more like a ${project.genre} film.`,
                    "Which shot needs the most attention?",
                  ]).map(q => (
                    <button key={q} onClick={() => sendChat(q)}
                      className="w-full text-left rounded-md border border-white/6 bg-white/[0.015] px-3 py-2 text-[9px] text-white/40 hover:border-amber-400/20 hover:text-white/65 hover:bg-amber-400/[0.03] transition-all leading-snug">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "director" && <VishBadge />}
                <div className={[
                  "max-w-[82%] rounded-lg px-3 py-2 text-[10px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-white/6 text-white/65"
                    : "bg-[#0e0e1a] border border-amber-400/8 text-white/78",
                ].join(" ")}>
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="flex items-center gap-2">
                <div className="shrink-0 h-5 w-5 rounded-sm bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                  <span className="text-amber-400 text-[8px] font-black animate-pulse">V</span>
                </div>
                <span className="text-[10px] text-white/25 font-mono typewriter-cursor">VISH is thinking</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Preset row */}
          <div className="flex gap-1 overflow-x-auto px-3 py-1.5 border-t border-white/5 timeline-scroll shrink-0">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="shrink-0 flex items-center gap-1 rounded-full border border-white/8 px-2 py-0.5 text-[7px] font-mono text-white/30 hover:border-amber-400/30 hover:text-amber-400/60 transition-all whitespace-nowrap">
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 px-3 py-2 border-t border-white/5 shrink-0">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(chatInput); } }}
              placeholder={selectedScene ? `Ask VISH about "${selectedScene.title}"…` : "Ask VISH about this sequence…"}
              disabled={chatLoading}
              className="flex-1 bg-white/[0.04] border border-white/8 rounded-lg px-3 py-2 text-[10px] text-white/80 placeholder-white/18 outline-none focus:border-amber-400/30 disabled:opacity-40"
            />
            <button onClick={() => sendChat(chatInput)} disabled={chatLoading || !chatInput.trim()}
              className="rounded-lg bg-amber-400 px-3 text-[10px] font-bold text-black hover:bg-amber-300 transition-colors disabled:opacity-30"
              aria-label="Send to VISH">
              →
            </button>
          </div>
        </div>
      )}

      {/* ── MEMORY TAB ── */}
      {tab === "memory" && (
        <div className="flex-1 overflow-y-auto">
          {/* Pattern summary */}
          {memory && (
            <div className="p-4 space-y-4">
              {/* Computed patterns */}
              <div className="rounded-md bg-white/[0.02] border border-white/5 p-3 space-y-1.5">
                <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-2">Detected Patterns</p>
                <PatternRow label="Lighting"   value={memory.dominantLighting} />
                <PatternRow label="Moods"      value={memory.dominantMoods.join(" · ") || "—"} />
                <PatternRow label="Shot types" value={memory.dominantShotTypes.join(" · ") || "—"} />
                <PatternRow label="Lens"       value={memory.dominantLens ?? "not set"} />
                <PatternRow label="Movement"   value={memory.dominantMovement ?? "not set"} />
                <PatternRow label="Location variety" value={`${Math.round(memory.locationVariety * 100)}%`} />
                <PatternRow label="Mood variety"     value={`${Math.round(memory.moodVariety * 100)}%`} />
              </div>

              {/* VISH creative tendencies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest">VISH Observations</p>
                  <button onClick={fetchTendencies} disabled={memoryLoading}
                    className="text-[7px] font-mono text-amber-400/40 hover:text-amber-400/70 transition-colors disabled:opacity-30">
                    {memoryLoading ? "reading…" : "↺ Ask VISH"}
                  </button>
                </div>
                {memory.creativeTendencies.length > 0 ? (
                  memory.creativeTendencies.map((t, i) => (
                    <div key={i} className="flex gap-2 items-start mb-1.5">
                      <span className="text-amber-400/50 text-[9px] mt-0.5 shrink-0">◆</span>
                      <p className="text-[9px] text-white/60 leading-snug">{t}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[9px] text-white/20">Click "Ask VISH" to generate observations from your patterns.</p>
                )}
              </div>

              {/* Continuity flags */}
              {memory.continuityFlags.length > 0 && (
                <div>
                  <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-2">Continuity Flags</p>
                  {memory.continuityFlags.map((f, i) => (
                    <div key={i} className="flex gap-2 items-start mb-1.5">
                      <span className="text-yellow-400/60 text-[9px] mt-0.5 shrink-0">⚠</span>
                      <p className="text-[9px] text-white/50 leading-snug">{f}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Director intent */}
              <div>
                <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Director&apos;s Intent</p>
                <textarea
                  rows={3}
                  value={intentInput}
                  onChange={e => setIntentInput(e.target.value)}
                  onBlur={saveIntent}
                  placeholder="Describe your visual intent, tone, or directorial philosophy for this project…"
                  className="w-full bg-white/[0.03] border border-white/8 rounded-md px-2.5 py-2 text-[9px] text-white/65 placeholder-white/15 outline-none focus:border-amber-400/30 resize-none leading-relaxed font-mono"
                />
                <p className="text-[7px] font-mono text-white/15 mt-0.5">Saved on blur · VISH reads this on every call</p>
              </div>
            </div>
          )}

          {/* Production Notes */}
          <div className="border-t border-white/5 p-4 space-y-3">
            <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest">Production Notes</p>

            {/* Add note */}
            <div className="space-y-1.5">
              <div className="flex gap-1 flex-wrap">
                {(["intention","revision","camera","lighting","general"] as const).map(cat => (
                  <button key={cat} onClick={() => setNoteCategory(cat)}
                    className={["rounded-sm px-2 py-0.5 text-[7px] font-mono border transition-all capitalize",
                      noteCategory === cat
                        ? "border-amber-400/40 bg-amber-400/8 text-amber-400"
                        : "border-white/8 text-white/30 hover:border-white/20"].join(" ")}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
                  placeholder={selectedScene ? `Note for "${selectedScene.title}"…` : "Project note…"}
                  className="flex-1 bg-white/[0.03] border border-white/8 rounded-md px-2.5 py-1.5 text-[9px] text-white/65 placeholder-white/15 outline-none focus:border-amber-400/30 font-mono"
                />
                <button onClick={addNote} disabled={!noteInput.trim()}
                  className="rounded-md bg-amber-400/15 border border-amber-400/20 px-2 text-amber-400/70 hover:bg-amber-400/25 transition-all disabled:opacity-30 text-[10px]">
                  +
                </button>
              </div>
              {selectedScene && (
                <p className="text-[7px] font-mono text-white/15">
                  Attaching to Shot {selectedScene.order} · "{selectedScene.title}"
                </p>
              )}
            </div>

            {/* Notes list */}
            <div className="space-y-1.5">
              {notes.length === 0 && (
                <p className="text-[9px] text-white/15">No notes yet. Notes are injected into VISH context.</p>
              )}
              {notes.map(note => (
                <div key={note.id}
                  className="flex items-start gap-2 rounded-md bg-white/[0.02] border border-white/5 px-2.5 py-2 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[7px] font-mono text-white/20 uppercase tracking-wide">{note.category}</span>
                      {note.sceneId && (
                        <span className="text-[7px] font-mono text-amber-400/30">
                          Shot {project.scenes.find(s => s.id === note.sceneId)?.order ?? "?"}
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-white/55 leading-snug">{note.content}</p>
                  </div>
                  <button onClick={() => removeNote(note.id)}
                    className="text-white/15 hover:text-red-400/60 transition-colors text-[9px] shrink-0 opacity-0 group-hover:opacity-100 mt-0.5">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function VishBadge() {
  return (
    <div className="shrink-0 h-5 w-5 rounded-sm bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mt-0.5">
      <span className="text-amber-400 text-[8px] font-black">V</span>
    </div>
  );
}

function PatternRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[8px] font-mono text-white/20">{label}</span>
      <span className="text-[9px] font-mono text-white/50">{value}</span>
    </div>
  );
}

function InsightDisplay({ insight, scene: _scene }: { insight: SceneInsight; scene: Scene }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-white/5">
          <div className="h-1 rounded-full bg-amber-400 transition-all" style={{ width: `${insight.emotionalIntensity * 10}%` }} />
        </div>
        <span className="text-[9px] font-mono text-amber-400/70">intensity {insight.emotionalIntensity}/10</span>
      </div>
      <InsightCard icon="🎥" label="VISH on Camera" value={insight.cameraAdvice} />
      <InsightCard icon="🔍" label="VISH on Lens"   value={insight.lensRecommendation} />
      <InsightCard icon="💡" label="VISH on Light"  value={insight.lightingNote} />
      <div className="rounded-md bg-amber-400/5 border border-amber-400/10 p-2.5">
        <p className="text-[7px] font-mono text-amber-400/50 uppercase tracking-widest mb-1">VISH references</p>
        <p className="text-[10px] font-semibold text-amber-400/80">{insight.cinematicReference}</p>
        <p className="text-[9px] text-white/35 mt-0.5">DOP: {insight.cinematographerRef}</p>
      </div>
      <div>
        <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-1.5">Visual references</p>
        <div className="flex flex-wrap gap-1">
          {insight.references.map(r => (
            <span key={r} className="rounded-full border border-white/8 px-2 py-0.5 text-[8px] text-white/40">{r}</span>
          ))}
        </div>
      </div>
      <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
        <p className="text-[7px] font-mono text-amber-400/30 uppercase tracking-widest mb-1">VISH suggests</p>
        <p className="text-[10px] text-white/60 leading-relaxed">{insight.improvementTip}</p>
      </div>
    </div>
  );
}

function InsightCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-2.5 items-start rounded-md bg-white/[0.02] border border-white/5 p-2.5">
      <span className="text-sm leading-tight shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-[10px] text-white/65 leading-snug">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
      <div className="h-8 w-8 rounded-sm bg-amber-400/5 border border-amber-400/10 flex items-center justify-center mb-3">
        <span className="text-amber-400/30 text-sm font-black">V</span>
      </div>
      <p className="text-[9px] font-mono text-white/20 leading-relaxed">{text}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="h-8 w-8 rounded-sm bg-amber-400/10 border border-amber-400/20 flex items-center justify-center animate-pulse">
        <span className="text-amber-400 text-sm font-black">V</span>
      </div>
      <p className="text-[9px] font-mono text-amber-400/40 typewriter-cursor">{label}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-[10px] text-red-400/60 leading-snug">VISH encountered an error: {message}</p>
      <button onClick={onRetry} className="text-[9px] font-mono text-white/30 hover:text-white/60 transition-colors">
        ↺ Ask VISH again
      </button>
    </div>
  );
}

function rhythmStyle(r: SequenceInsight["overallRhythm"]): string {
  return {
    tight:    "border-green-500/30 bg-green-500/5 text-green-400",
    balanced: "border-cyan-500/30 bg-cyan-500/5 text-cyan-400",
    sluggish: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400",
    uneven:   "border-red-500/30 bg-red-500/5 text-red-400",
  }[r] ?? "border-white/10 text-white/40";
}
