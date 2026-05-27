"use client";

/**
 * VishDirectorPanel — VISH AI Director sidebar for PREVIS SPACE.
 *
 * Three modes, selectable via tab:
 *
 *   Sequence   → calls /api/ai-director?action=analyze-sequence
 *                Shows pacing rhythm, director note, issues, suggestions
 *                Emotional arc visualised as intensity bars per shot
 *
 *   Shot       → calls /api/ai-director?action=analyze-scene on selectedScene
 *                Shows camera advice, lens, lighting note, references
 *
 *   Chat       → calls /api/ai-director?action=chat
 *                Full conversational VISH director chat
 *
 * The panel is collapsible, draggable-height, and lives on the right side
 * of the workspace so it does not cover the 3D viewport or timeline.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { Scene, Project, SceneInsight, SequenceInsight, DirectorMessage } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  project:       Project;
  scenes:        Scene[];
  selectedScene: Scene | null;
  onGenerateSelected?: () => void;
  onGenerateAll?:      () => void;
  genStatuses?:        Record<string, { status: string; provider?: string; ms?: number; error?: string }>;
  genRunning?:         boolean;
  onCancelGen?:        () => void;
  genPending?:         number;
}

type Tab = "sequence" | "shot" | "chat";

// ── Mood accent (mirrors workspace) ──────────────────────────────────────────

const MOOD_ACCENT: Record<string, string> = {
  Tense:"#ff3311",Dramatic:"#aa44ff",Romantic:"#ff5588",Action:"#ff8800",
  Mysterious:"#3366ff",Melancholic:"#4488cc",Triumphant:"#ffcc00",
  Horror:"#00cc44",Comedic:"#44ee88",Serene:"#00cccc",
};

// ── Local cinematic analysis (no API needed for pure pattern detection) ───────

interface PatternAnalysis {
  dominantShot:    string;
  shotVariety:     number;         // 0–1
  paceScore:       number;         // 0–1 (higher = faster)
  moodShifts:      number;
  issues:          string[];
  strengths:       string[];
  suggestions:     string[];
  intensitySpike:  number | null;  // scene index of highest emotional spike
}

function runLocalAnalysis(scenes: Scene[]): PatternAnalysis {
  if (scenes.length === 0) return {
    dominantShot: "—", shotVariety: 0, paceScore: 0.5,
    moodShifts: 0, issues: [], strengths: [], suggestions: [], intensitySpike: null,
  };

  // Shot type frequency
  const shotCount: Record<string, number> = {};
  scenes.forEach(s => { shotCount[s.shotType] = (shotCount[s.shotType] ?? 0) + 1; });
  const dominantShot = Object.entries(shotCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const shotVariety  = Object.keys(shotCount).length / Math.max(scenes.length, 1);

  // Pacing (shorter duration = faster pace)
  const avgDur = scenes.reduce((s, sc) => s + (sc.timelineMeta?.durationSeconds ?? 3), 0) / scenes.length;
  const paceScore = Math.max(0, Math.min(1, 1 - (avgDur - 1) / 9));

  // Mood shifts
  let moodShifts = 0;
  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i].mood !== scenes[i-1].mood) moodShifts++;
  }

  // Detect issues
  const issues: string[] = [];
  const strengths: string[] = [];
  const suggestions: string[] = [];

  // Close-up overuse
  const cuCount = (shotCount["Close-Up"] ?? 0) + (shotCount["Extreme Close-Up"] ?? 0);
  if (cuCount / scenes.length > 0.5) {
    issues.push(`Close-up overuse: ${cuCount}/${scenes.length} shots are tight frames.`);
    suggestions.push("Introduce a Wide or Extreme Wide Shot for spatial context.");
  }

  // No establishing shot
  const hasWide = (shotCount["Wide Shot"] ?? 0) + (shotCount["Extreme Wide Shot"] ?? 0) + (shotCount["Aerial Shot"] ?? 0);
  if (!hasWide && scenes.length > 3) {
    issues.push("No establishing shot in sequence. Audience lacks spatial orientation.");
    suggestions.push("Open with a Wide Shot to anchor the environment before cutting tight.");
  }

  // Low shot variety
  if (shotVariety < 0.35 && scenes.length > 3) {
    issues.push(`Low shot variety — ${Object.keys(shotCount).length} shot types across ${scenes.length} shots.`);
    suggestions.push("Vary framing to create visual rhythm: wide → medium → close → insert.");
  }

  // Mood consistency
  if (moodShifts === 0 && scenes.length > 4) {
    issues.push("Flat tonal arc — mood is identical across all shots.");
    suggestions.push("Introduce tonal contrast: a brief lighter moment before the next dramatic beat.");
  }

  if (moodShifts > scenes.length * 0.7) {
    issues.push("Mood shifts on almost every cut — sequence may feel incoherent.");
    suggestions.push("Group tonally similar shots. Build toward a mood peak rather than alternating.");
  }

  // Strengths
  if (shotVariety > 0.6) strengths.push("Good shot variety — visual rhythm is diverse.");
  if (hasWide > 0)       strengths.push("Establishing coverage present — spatial storytelling is grounded.");
  if (moodShifts > 1 && moodShifts <= scenes.length * 0.5) {
    strengths.push("Healthy tonal variation — sequence has emotional movement.");
  }

  // Generic suggestions always shown
  if (suggestions.length === 0) {
    suggestions.push("Review transition types — a mix of cuts, dissolves and match cuts adds rhythm.");
    suggestions.push("Check emotional arc: does the sequence build toward a clear peak?");
  }

  // Intensity spike — find scene with most intense mood
  const MOOD_INTENSITY: Record<string, number> = {
    Horror:9,Tense:8,Dramatic:7,Action:8,Triumphant:7,
    Romantic:5,Mysterious:6,Melancholic:4,Comedic:4,Serene:2,
  };
  let maxI = 0; let intensitySpike: number | null = null;
  scenes.forEach((s, i) => {
    const v = MOOD_INTENSITY[s.mood] ?? 5;
    if (v > maxI) { maxI = v; intensitySpike = i; }
  });

  return { dominantShot, shotVariety, paceScore, moodShifts, issues, strengths, suggestions, intensitySpike };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newMsg(role: "user" | "director", content: string): DirectorMessage {
  return { id: `${Date.now()}-${Math.random()}`, role, content, time: Date.now() };
}

function Spinner() {
  return (
    <span style={{ display:"inline-flex", gap:3, alignItems:"center" }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width:4, height:4, borderRadius:"50%",
          background:"rgba(251,191,36,0.6)",
          animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VishDirectorPanel({ project, scenes, selectedScene, onGenerateSelected, onGenerateAll, genStatuses = {}, genRunning = false, onCancelGen, genPending = 0 }: Props) {
  const [collapsed,  setCollapsed]  = useState(false);
  const [tab,        setTab]        = useState<Tab>("sequence");
  const [loading,    setLoading]    = useState(false);
  const [notice,     setNotice]     = useState<string | null>(null);

  // Sequence analysis state
  const [seqInsight, setSeqInsight] = useState<SequenceInsight | null>(null);

  // Shot analysis state
  const [shotInsight, setShotInsight] = useState<SceneInsight | null>(null);
  const [lastAnalyzedId, setLastAnalyzedId] = useState<string | null>(null);

  // Chat state
  const [messages,  setMessages]  = useState<DirectorMessage[]>([
    newMsg("director", `VISH online. ${scenes.length} shots loaded on "${project.title}". What do you want to shape?`),
  ]);
  const [input,     setInput]     = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Local pattern analysis (instant, no API)
  const localAnalysis = runLocalAnalysis(scenes);

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── API helpers ─────────────────────────────────────────────────────────────

  const analyzeSequence = useCallback(async () => {
    setLoading(true); setNotice(null);
    try {
      const res = await fetch("/api/ai-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:  "analyze-sequence",
          scenes,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes },
        }),
      });
      const data = await res.json();
      if (data.insight) setSeqInsight(data.insight);
      if (data.notice)  setNotice(data.notice);
    } catch { setNotice("VISH offline — using local analysis."); }
    finally  { setLoading(false); }
  }, [scenes, project]);

  const analyzeShot = useCallback(async () => {
    if (!selectedScene) return;
    setLoading(true); setNotice(null);
    try {
      const res = await fetch("/api/ai-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:  "analyze-scene",
          scene:   selectedScene,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes },
        }),
      });
      const data = await res.json();
      if (data.insight) { setShotInsight(data.insight); setLastAnalyzedId(selectedScene.id); }
      if (data.notice)  setNotice(data.notice);
    } catch { setNotice("VISH offline."); }
    finally  { setLoading(false); }
  }, [selectedScene, scenes, project]);

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = newMsg("user", text);
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:        "chat",
          messages:      next,
          project:       { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes },
          selectedScene,
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? "VISH is recalibrating…";
      setMessages(m => [...m, newMsg("director", reply)]);
      if (data.notice) setNotice(data.notice);
    } catch {
      setMessages(m => [...m, newMsg("director", "VISH offline — check connection.")]);
    } finally { setLoading(false); }
  }, [input, loading, messages, project, scenes, selectedScene]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position:       "absolute",
      top:            10,
      right:          10,
      bottom:         106,
      width:          collapsed ? 36 : 270,
      zIndex:         30,
      display:        "flex",
      flexDirection:  "column",
      background:     collapsed ? "transparent" : "rgba(12,12,20,0.97)",
      border:         collapsed ? "none" : "1px solid rgba(255,255,255,0.09)",
      borderRadius:   6,
      backdropFilter: "blur(16px)",
      boxShadow:      collapsed ? "none" : "0 4px 32px rgba(0,0,0,0.50)",
      transition:     "width 0.2s ease",
      overflow:       "hidden",
      fontFamily:     "monospace",
    }}>

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setCollapsed(p => !p)}
        title={collapsed ? "Open VISH" : "Collapse VISH"}
        style={{
          position:       collapsed ? "static" : "absolute",
          top:            collapsed ? 0 : 8,
          right:          collapsed ? 0 : 8,
          width:          collapsed ? 36 : 22,
          height:         collapsed ? 36 : 22,
          borderRadius:   collapsed ? 6 : "50%",
          background:     "rgba(251,191,36,0.12)",
          border:         "1px solid rgba(251,191,36,0.25)",
          cursor:         "pointer",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       collapsed ? 14 : 9,
          color:          "rgba(251,191,36,0.80)",
          flexShrink:     0,
          zIndex:         10,
        }}
      >
        {collapsed ? "⬡" : "◀"}
      </button>

      {collapsed && (
        <div style={{
          writingMode: "vertical-rl", textOrientation: "mixed",
          fontSize: 7, color: "rgba(251,191,36,0.45)",
          letterSpacing: "0.2em", textTransform: "uppercase",
          padding: "8px 0", textAlign: "center",
        }}>
          VISH Director
        </div>
      )}

      {!collapsed && (
        <>
          {/* ── Header ── */}
          <div style={{
            padding:      "10px 12px 0 12px",
            paddingRight: 36, // room for collapse btn
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
              <div style={{
                width:8, height:8, borderRadius:"50%",
                background:"#fbbf24",
                boxShadow:"0 0 8px rgba(251,191,36,0.8)",
                animation:"pulse 2s ease-in-out infinite",
              }} />
              <span style={{ fontSize:9, color:"rgba(251,191,36,0.80)", letterSpacing:"0.25em", textTransform:"uppercase" }}>
                VISH Director
              </span>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:2, marginBottom:0 }}>
              {(["sequence","shot","chat"] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex:          1,
                    fontSize:      7,
                    padding:       "4px 0",
                    borderRadius:  "3px 3px 0 0",
                    border:        `1px solid ${tab === t ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.06)"}`,
                    borderBottom:  "none",
                    background:    tab === t ? "rgba(251,191,36,0.10)" : "rgba(255,255,255,0.02)",
                    color:         tab === t ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.30)",
                    cursor:        "pointer",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.15em",
                  }}
                >
                  {t === "sequence" ? "⬡ Sequence" : t === "shot" ? "◉ Shot" : "◈ Chat"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div style={{
            flex:       1,
            overflow:   "hidden",
            display:    "flex",
            flexDirection: "column",
            borderTop:  "1px solid rgba(251,191,36,0.15)",
          }}>

            {/* ── SEQUENCE TAB ── */}
            {tab === "sequence" && (
              <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>

                {/* Local instant analysis — always shown */}
                <Section label="Pattern Scan" accent="#fbbf24">
                  <Row label="Dominant shot"  value={localAnalysis.dominantShot} />
                  <Row label="Shot variety"   value={`${Math.round(localAnalysis.shotVariety * 100)}%`} />
                  <Row label="Mood shifts"    value={String(localAnalysis.moodShifts)} />
                  <Row label="Pace"           value={localAnalysis.paceScore > 0.65 ? "Fast" : localAnalysis.paceScore > 0.4 ? "Balanced" : "Slow"} />
                </Section>

                {/* Emotional intensity bar chart */}
                <Section label="Emotional Arc" accent="#fbbf24">
                  <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:32, marginTop:4 }}>
                    {scenes.map((s, i) => {
                      const MOOD_I: Record<string,number> = {
                        Horror:9,Tense:8,Action:8,Dramatic:7,Triumphant:7,
                        Mysterious:6,Romantic:5,Melancholic:4,Comedic:4,Serene:2,
                      };
                      const intensity = MOOD_I[s.mood] ?? 5;
                      const isSpike   = localAnalysis.intensitySpike === i;
                      const acc       = MOOD_ACCENT[s.mood] ?? "#888";
                      return (
                        <div key={s.id} title={`${s.order}. ${s.title} (${s.mood})`}
                          style={{
                            flex:         1,
                            height:       `${Math.max(12, (intensity / 9) * 32)}px`,
                            background:   acc,
                            opacity:      isSpike ? 1.0 : 0.45,
                            borderRadius: "2px 2px 0 0",
                            transition:   "all 0.3s",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
                    <span style={{ fontSize:6, color:"rgba(255,255,255,0.18)" }}>Shot 1</span>
                    <span style={{ fontSize:6, color:"rgba(255,255,255,0.18)" }}>Shot {scenes.length}</span>
                  </div>
                </Section>

                {/* Issues */}
                {localAnalysis.issues.length > 0 && (
                  <Section label="⚠ Issues Detected" accent="#ff6644">
                    {localAnalysis.issues.map((issue, i) => (
                      <p key={i} style={{ fontSize:8, color:"rgba(255,150,120,0.80)", lineHeight:1.5, marginBottom:4 }}>
                        · {issue}
                      </p>
                    ))}
                  </Section>
                )}

                {/* Strengths */}
                {localAnalysis.strengths.length > 0 && (
                  <Section label="✓ Strengths" accent="#44cc88">
                    {localAnalysis.strengths.map((s, i) => (
                      <p key={i} style={{ fontSize:8, color:"rgba(120,220,150,0.80)", lineHeight:1.5, marginBottom:4 }}>
                        · {s}
                      </p>
                    ))}
                  </Section>
                )}

                {/* Suggestions */}
                <Section label="Suggestions" accent="#fbbf24">
                  {localAnalysis.suggestions.map((s, i) => (
                    <p key={i} style={{ fontSize:8, color:"rgba(255,255,255,0.55)", lineHeight:1.5, marginBottom:4 }}>
                      → {s}
                    </p>
                  ))}
                </Section>

                {/* AI deep analysis button */}
                <button
                  onClick={analyzeSequence}
                  disabled={loading}
                  style={{
                    width:"100%", marginTop:8, padding:"7px 0",
                    borderRadius:4, cursor: loading ? "not-allowed" : "pointer",
                    border:"1px solid rgba(251,191,36,0.30)",
                    background:"rgba(251,191,36,0.08)",
                    color:"rgba(251,191,36,0.80)", fontSize:8,
                    letterSpacing:"0.15em", textTransform:"uppercase",
                    transition:"all 0.15s",
                  }}
                >
                  {loading ? <Spinner /> : "⬡ Deep AI Analysis"}
                </button>

                {/* ── Generation controls ── */}
                <div style={{ marginTop:10, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:10 }}>
                  <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:6 }}>
                    Cinematic Frame Generation
                  </p>

                  {genRunning ? (
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <div style={{ flex:1, padding:"6px 0", borderRadius:4, background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.20)" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                          <Spinner />
                          <span style={{ fontSize:7.5, color:"rgba(251,191,36,0.65)" }}>
                            Generating {genPending} frame{genPending !== 1 ? "s" : ""}…
                          </span>
                        </div>
                      </div>
                      {onCancelGen && (
                        <button onClick={onCancelGen} style={{
                          padding:"5px 8px", borderRadius:4,
                          border:"1px solid rgba(255,100,80,0.30)",
                          background:"rgba(255,100,80,0.08)",
                          color:"rgba(255,130,110,0.75)", fontSize:7.5,
                          cursor:"pointer", letterSpacing:"0.1em",
                        }}>
                          Stop
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display:"flex", gap:5 }}>
                      <button
                        onClick={onGenerateAll}
                        disabled={scenes.every(s => s.imageUrl)}
                        title="Generate frames for all shots without images"
                        style={{
                          flex:1, padding:"6px 0", borderRadius:4,
                          border:"1px solid rgba(99,102,241,0.30)",
                          background:"rgba(99,102,241,0.08)",
                          color: scenes.every(s => s.imageUrl) ? "rgba(255,255,255,0.15)" : "rgba(147,150,255,0.80)",
                          fontSize:7.5, cursor: scenes.every(s => s.imageUrl) ? "not-allowed" : "pointer",
                          letterSpacing:"0.12em", textTransform:"uppercase" as const,
                        }}
                      >
                        ▶ Generate All
                      </button>
                      <button
                        onClick={onGenerateSelected}
                        disabled={!selectedScene || !!selectedScene?.imageUrl}
                        title="Generate frame for selected shot"
                        style={{
                          flex:1, padding:"6px 0", borderRadius:4,
                          border:"1px solid rgba(251,191,36,0.22)",
                          background:"rgba(251,191,36,0.06)",
                          color: (!selectedScene || selectedScene?.imageUrl) ? "rgba(255,255,255,0.15)" : "rgba(251,191,36,0.75)",
                          fontSize:7.5, cursor: (!selectedScene || selectedScene?.imageUrl) ? "not-allowed" : "pointer",
                          letterSpacing:"0.12em", textTransform:"uppercase" as const,
                        }}
                      >
                        ◉ This Shot
                      </button>
                    </div>
                  )}

                  {/* Per-scene generation status strip */}
                  {Object.keys(genStatuses).length > 0 && (
                    <div style={{ marginTop:6, display:"flex", gap:1.5, flexWrap:"wrap" }}>
                      {scenes.map(s => {
                        const st = genStatuses[s.id];
                        const col = !st             ? "rgba(255,255,255,0.08)"
                                  : st.status === "done"       ? "rgba(80,200,100,0.60)"
                                  : st.status === "generating" ? "rgba(251,191,36,0.70)"
                                  : st.status === "queued"     ? "rgba(99,102,241,0.50)"
                                  : st.status === "failed"     ? "rgba(220,80,60,0.60)"
                                  : "rgba(255,255,255,0.08)";
                        return (
                          <div key={s.id} title={`Shot ${s.order}: ${st?.status ?? "idle"}`}
                            style={{ width:8, height:8, borderRadius:1.5, background:col }} />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* AI sequence insight */}
                {seqInsight && (
                  <>
                    <Section label="VISH Director Note" accent="#aa44ff">
                      <p style={{ fontSize:8.5, color:"rgba(220,200,255,0.80)", lineHeight:1.6 }}>
                        {seqInsight.directorNote}
                      </p>
                      <div style={{ marginTop:6 }}>
                        <span style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.15em" }}>
                          Rhythm: </span>
                        <span style={{ fontSize:7, color:"rgba(251,191,36,0.70)" }}>{seqInsight.overallRhythm}</span>
                      </div>
                    </Section>

                    {seqInsight.pacingIssues?.length > 0 && (
                      <Section label="Pacing Notes" accent="#ff6644">
                        {seqInsight.pacingIssues.map((p, i) => (
                          <p key={i} style={{ fontSize:8, color:"rgba(255,150,120,0.75)", lineHeight:1.5, marginBottom:3 }}>· {p}</p>
                        ))}
                      </Section>
                    )}

                    {seqInsight.suggestions?.length > 0 && (
                      <Section label="VISH Suggestions" accent="#fbbf24">
                        {seqInsight.suggestions.map((s, i) => (
                          <p key={i} style={{ fontSize:8, color:"rgba(255,255,255,0.55)", lineHeight:1.5, marginBottom:4 }}>→ {s}</p>
                        ))}
                      </Section>
                    )}
                  </>
                )}

                {notice && (
                  <p style={{ fontSize:7, color:"rgba(255,255,255,0.22)", marginTop:6, lineHeight:1.4 }}>{notice}</p>
                )}
              </div>
            )}

            {/* ── SHOT TAB ── */}
            {tab === "shot" && (
              <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
                {!selectedScene ? (
                  <p style={{ fontSize:8, color:"rgba(255,255,255,0.25)", lineHeight:1.6 }}>
                    Select a storyboard card to analyse this shot.
                  </p>
                ) : (
                  <>
                    <Section label={`Shot ${selectedScene.order}`} accent={MOOD_ACCENT[selectedScene.mood] ?? "#fbbf24"}>
                      <Row label="Type"     value={selectedScene.shotType} />
                      <Row label="Mood"     value={selectedScene.mood} />
                      <Row label="Lighting" value={selectedScene.lighting} />
                      <Row label="Location" value={selectedScene.location} />
                    </Section>

                    <button
                      onClick={analyzeShot}
                      disabled={loading}
                      style={{
                        width:"100%", marginTop:4, marginBottom:8, padding:"7px 0",
                        borderRadius:4, cursor: loading ? "not-allowed" : "pointer",
                        border:`1px solid ${MOOD_ACCENT[selectedScene.mood] ?? "#fbbf24"}44`,
                        background:`${MOOD_ACCENT[selectedScene.mood] ?? "#fbbf24"}0c`,
                        color:`${MOOD_ACCENT[selectedScene.mood] ?? "#fbbf24"}bb`, fontSize:8,
                        letterSpacing:"0.15em", textTransform:"uppercase",
                        transition:"all 0.15s",
                      }}
                    >
                      {loading ? <Spinner /> : "◉ Analyse with VISH"}
                    </button>

                    {shotInsight && lastAnalyzedId === selectedScene.id && (
                      <>
                        <Section label="Camera" accent="#fbbf24">
                          <p style={{ fontSize:8, color:"rgba(220,220,240,0.75)", lineHeight:1.6 }}>{shotInsight.cameraAdvice}</p>
                        </Section>
                        <Section label="Lens" accent="#fbbf24">
                          <p style={{ fontSize:8, color:"rgba(220,220,240,0.75)", lineHeight:1.6 }}>{shotInsight.lensRecommendation}</p>
                        </Section>
                        <Section label="Lighting" accent="#fbbf24">
                          <p style={{ fontSize:8, color:"rgba(220,220,240,0.75)", lineHeight:1.6 }}>{shotInsight.lightingNote}</p>
                        </Section>
                        <Section label="Director Tip" accent="#aa44ff">
                          <p style={{ fontSize:8, color:"rgba(200,180,255,0.80)", lineHeight:1.6 }}>{shotInsight.improvementTip}</p>
                        </Section>
                        <Section label="References" accent="#fbbf24">
                          <p style={{ fontSize:8, color:"rgba(220,220,240,0.55)", lineHeight:1.6 }}>
                            {shotInsight.cinematicReference}
                          </p>
                          <p style={{ fontSize:7, color:"rgba(255,255,255,0.28)", marginTop:3 }}>
                            DOP: {shotInsight.cinematographerRef}
                          </p>
                          {shotInsight.references?.map((r, i) => (
                            <p key={i} style={{ fontSize:7, color:"rgba(255,255,255,0.22)", lineHeight:1.4 }}>· {r}</p>
                          ))}
                        </Section>
                        <div style={{
                          display:"flex", alignItems:"center", gap:6, marginTop:4,
                          padding:"5px 8px", borderRadius:4,
                          background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                        }}>
                          <span style={{ fontSize:7, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.15em" }}>Intensity</span>
                          <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{
                              height:"100%", borderRadius:2,
                              width:`${((shotInsight.emotionalIntensity ?? 5) / 10) * 100}%`,
                              background: MOOD_ACCENT[selectedScene.mood] ?? "#fbbf24",
                            }} />
                          </div>
                          <span style={{ fontSize:8, color:"rgba(255,255,255,0.45)" }}>{shotInsight.emotionalIntensity}/10</span>
                        </div>
                      </>
                    )}

                    {notice && (
                      <p style={{ fontSize:7, color:"rgba(255,255,255,0.22)", marginTop:6, lineHeight:1.4 }}>{notice}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── CHAT TAB ── */}
            {tab === "chat" && (
              <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
                {/* Message thread */}
                <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
                  {messages.map((msg) => (
                    <div key={msg.id} style={{
                      display:      "flex",
                      flexDirection:"column",
                      alignItems:   msg.role === "user" ? "flex-end" : "flex-start",
                    }}>
                      <div style={{
                        maxWidth:     "85%",
                        padding:      "6px 9px",
                        borderRadius: msg.role === "user" ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                        background:   msg.role === "user"
                          ? "rgba(251,191,36,0.12)"
                          : "rgba(255,255,255,0.05)",
                        border: `1px solid ${msg.role === "user" ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.07)"}`,
                        fontSize:   8.5,
                        lineHeight: 1.55,
                        color:      msg.role === "user" ? "rgba(255,230,160,0.85)" : "rgba(210,210,230,0.82)",
                        whiteSpace: "pre-wrap",
                        wordBreak:  "break-word",
                      }}>
                        {msg.content}
                      </div>
                      <span style={{
                        fontSize:5.5, color:"rgba(255,255,255,0.15)",
                        marginTop:2, paddingLeft:2, paddingRight:2,
                      }}>
                        {msg.role === "director" ? "VISH" : "You"}
                      </span>
                    </div>
                  ))}
                  {loading && (
                    <div style={{ alignSelf:"flex-start", padding:"6px 10px",
                      background:"rgba(255,255,255,0.04)", borderRadius:"8px 8px 8px 2px",
                      border:"1px solid rgba(255,255,255,0.06)" }}>
                      <Spinner />
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input row */}
                <div style={{
                  padding:    "8px 10px",
                  borderTop:  "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(0,0,0,0.25)",
                  display:    "flex",
                  gap:        6,
                  alignItems: "flex-end",
                }}>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    placeholder="Ask VISH anything about the sequence…"
                    rows={2}
                    style={{
                      flex:         1,
                      background:   "rgba(255,255,255,0.04)",
                      border:       "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 4,
                      color:        "rgba(220,220,240,0.80)",
                      fontSize:     8.5,
                      fontFamily:   "monospace",
                      lineHeight:   1.5,
                      padding:      "5px 7px",
                      resize:       "none",
                      outline:      "none",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(251,191,36,0.40)")}
                    onBlur={e  => (e.target.style.borderColor = "rgba(255,255,255,0.10)")}
                  />
                  <button
                    onClick={sendChat}
                    disabled={loading || !input.trim()}
                    style={{
                      width:        30,
                      height:       30,
                      borderRadius: "50%",
                      background:   input.trim() ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.04)",
                      border:       `1px solid ${input.trim() ? "rgba(251,191,36,0.40)" : "rgba(255,255,255,0.08)"}`,
                      color:        input.trim() ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.20)",
                      cursor:       input.trim() ? "pointer" : "not-allowed",
                      fontSize:     12,
                      display:      "flex",
                      alignItems:   "center",
                      justifyContent: "center",
                      flexShrink:   0,
                      transition:   "all 0.15s",
                    }}
                  >
                    ▲
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pulse animation style */}
          <style>{`
            @keyframes pulse {
              0%,100% { opacity:0.4; transform:scale(1); }
              50%      { opacity:1.0; transform:scale(1.2); }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, accent, children }: { label:string; accent:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{
        fontSize:7, color:accent, opacity:0.65,
        letterSpacing:"0.22em", textTransform:"uppercase",
        marginBottom:5, paddingBottom:3,
        borderBottom:`1px solid ${accent}18`,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label:string; value:string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
      <span style={{ fontSize:7, color:"rgba(255,255,255,0.28)", textTransform:"uppercase", letterSpacing:"0.12em" }}>
        {label}
      </span>
      <span style={{ fontSize:7.5, color:"rgba(220,220,240,0.70)", maxWidth:"55%", textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {value}
      </span>
    </div>
  );
}
