"use client";

/**
 * StoryEngine — VISH narrative intelligence panel.
 *
 * Surfaces story-level understanding of the storyboard sequence.
 * All analysis is instant local computation — no API calls needed for
 * the structural layer. AI-enhanced insights use the existing
 * /api/ai-director endpoint when triggered explicitly.
 *
 * Tabs:
 *   Arc      → emotional intensity curve + pacing graph
 *   Cast     → character screen-time distribution + scene appearances
 *   Lenses   → location/environment heatmap + scene connections
 *   Issues   → continuity flags, pattern problems, smart suggestions
 *   Memory   → director memory — dominant tendencies, VISH observations
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Scene, Project, DirectorMemory } from "@/types";
import { deriveMemory } from "@/lib/director-memory";
import { useFreeDrag, onPanelsReset } from "@/hooks/useFreeDrag";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  project:  Project;
  scenes:   Scene[];
  memory?:  DirectorMemory | null;
}

type Tab = "arc" | "cast" | "lenses" | "issues" | "memory";

// ── Mood colours ──────────────────────────────────────────────────────────────

const MOOD_COLOR: Record<string, string> = {
  Tense:"#cc3320",Dramatic:"#8822cc",Romantic:"#cc3066",Action:"#cc6610",
  Mysterious:"#2244cc",Melancholic:"#2266bb",Triumphant:"#ccaa10",
  Horror:"#00cc44",Comedic:"#22cc66",Serene:"#11aaaa",
};

const MOOD_INTENSITY: Record<string, number> = {
  Horror:9,Tense:8,Action:8,Dramatic:7,Triumphant:7,
  Mysterious:6,Romantic:5,Melancholic:4,Comedic:4,Serene:2,
};

// ── Analysis engine ───────────────────────────────────────────────────────────

interface StoryAnalysis {
  // Arc
  intensityPoints:  number[];       // 0–10 per scene
  pacePoints:       number[];       // 0–10 per scene (shorter = faster)
  moodRuns:         { mood:string; start:number; end:number }[];

  // Cast
  castDistribution: { name:string; scenes:number[]; screenTime:number }[];

  // Locations
  locationGroups:   { location:string; sceneIdxs:number[]; timeOfDay:string }[];

  // Continuity issues
  issues: {
    type:     "warning" | "info" | "error";
    text:     string;
    sceneIdx?: number;
  }[];

  // Shot stats
  shotTypeCounts:   Record<string, number>;
  avgDuration:      number;
  totalRuntime:     number;
}

function analyseStory(scenes: Scene[]): StoryAnalysis {
  // ── Intensity arc ──────────────────────────────────────────────────────────
  const intensityPoints = scenes.map(s => MOOD_INTENSITY[s.mood] ?? 5);

  // ── Pacing (normalised scene duration → speed 0-10) ───────────────────────
  const durations   = scenes.map(s => s.timelineMeta?.durationSeconds ?? 3);
  const maxDur      = Math.max(...durations, 1);
  const minDur      = Math.min(...durations, 1);
  const pacePoints  = durations.map(d =>
    maxDur === minDur ? 5 : Math.round(10 - ((d - minDur) / (maxDur - minDur)) * 10)
  );

  // ── Mood runs (consecutive same-mood stretches) ───────────────────────────
  const moodRuns: StoryAnalysis["moodRuns"] = [];
  if (scenes.length > 0) {
    let run = { mood: scenes[0].mood, start: 0, end: 0 };
    for (let i = 1; i < scenes.length; i++) {
      if (scenes[i].mood === run.mood) { run.end = i; }
      else { moodRuns.push({ ...run }); run = { mood: scenes[i].mood, start: i, end: i }; }
    }
    moodRuns.push(run);
  }

  // ── Cast distribution ─────────────────────────────────────────────────────
  const castMap: Record<string, number[]> = {};
  scenes.forEach((s, i) => {
    if (!s.characters?.trim()) return;
    s.characters.split(",").map(c => c.trim().toUpperCase()).filter(Boolean).forEach(name => {
      castMap[name] = castMap[name] ?? [];
      castMap[name].push(i);
    });
  });
  const castDistribution = Object.entries(castMap)
    .map(([name, sceneIdxs]) => ({
      name,
      scenes:     sceneIdxs,
      screenTime: sceneIdxs.reduce((s, i) => s + (durations[i] ?? 3), 0),
    }))
    .sort((a, b) => b.screenTime - a.screenTime)
    .slice(0, 10);

  // ── Location groups ───────────────────────────────────────────────────────
  const locMap: Record<string, number[]> = {};
  scenes.forEach((s, i) => {
    const key = s.location.toLowerCase().trim();
    locMap[key] = locMap[key] ?? [];
    locMap[key].push(i);
  });
  const locationGroups = Object.entries(locMap)
    .map(([loc, idxs]) => ({
      location:   loc,
      sceneIdxs:  idxs,
      timeOfDay:  "UNKNOWN",
    }))
    .sort((a, b) => b.sceneIdxs.length - a.sceneIdxs.length);

  // ── Continuity issues ─────────────────────────────────────────────────────
  const issues: StoryAnalysis["issues"] = [];

  // No establishing shot
  const wideCount = scenes.filter(s =>
    ["Wide Shot","Extreme Wide Shot","Aerial Shot"].includes(s.shotType)
  ).length;
  if (wideCount === 0 && scenes.length >= 3) {
    issues.push({ type:"warning", text:"No establishing shot — sequence lacks spatial orientation. Add a Wide or Aerial Shot early." });
  }

  // Close-up overuse
  const cuCount = scenes.filter(s => ["Close-Up","Extreme Close-Up"].includes(s.shotType)).length;
  if (cuCount / Math.max(scenes.length, 1) > 0.55) {
    issues.push({ type:"warning", text:`${cuCount}/${scenes.length} shots are close-ups. High repetition risks emotional fatigue.` });
  }

  // Mood run > 3 identical consecutive moods
  moodRuns.forEach(run => {
    const len = run.end - run.start + 1;
    if (len >= 4) {
      issues.push({
        type: "info",
        text: `${len} consecutive ${run.mood} shots (shots ${run.start+1}–${run.end+1}). Consider a tonal contrast beat.`,
        sceneIdx: run.start,
      });
    }
  });

  // Pacing: late-sequence slowdown (last third slower than first)
  if (scenes.length >= 6) {
    const third   = Math.floor(scenes.length / 3);
    const avgEarly = pacePoints.slice(0, third).reduce((a,b)=>a+b,0) / third;
    const avgLate  = pacePoints.slice(-third).reduce((a,b)=>a+b,0) / third;
    if (avgLate < avgEarly - 2.5) {
      issues.push({ type:"info", text:"Pacing slows significantly in the final third. May feel anticlimactic unless intentional." });
    }
  }

  // Protagonist disappearance (most-cast character absent 3+ consecutive)
  if (castDistribution.length > 0) {
    const lead = castDistribution[0];
    const leadSet = new Set(lead.scenes);
    let absent = 0; let maxAbsent = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (!leadSet.has(i)) { absent++; maxAbsent = Math.max(maxAbsent, absent); }
      else absent = 0;
    }
    if (maxAbsent >= 4) {
      issues.push({ type:"warning", text:`Lead character "${lead.name}" absent for ${maxAbsent} consecutive shots. Audience may lose identification.` });
    }
  }

  // Missing coverage: only one shot type present
  const shotTypes = new Set(scenes.map(s => s.shotType));
  if (shotTypes.size <= 1 && scenes.length > 2) {
    issues.push({ type:"error", text:`Every shot is a ${[...shotTypes][0]}. No coverage variation — sequence will feel visually monotone.` });
  }

  // ── Shot stats ────────────────────────────────────────────────────────────
  const shotTypeCounts: Record<string, number> = {};
  scenes.forEach(s => { shotTypeCounts[s.shotType] = (shotTypeCounts[s.shotType] ?? 0) + 1; });
  const totalRuntime = durations.reduce((a,b) => a+b, 0);
  const avgDuration  = scenes.length > 0 ? totalRuntime / scenes.length : 0;

  return {
    intensityPoints, pacePoints, moodRuns, castDistribution,
    locationGroups, issues, shotTypeCounts, avgDuration, totalRuntime,
  };
}

// ── Mini sparkline component ──────────────────────────────────────────────────

function Sparkline({
  points,
  color,
  label,
  height = 32,
}: {
  points: number[];
  color:  string;
  label:  string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const max  = 10;
  const w    = 220;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * step;
    const y = height - (p / max) * height;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:3 }}>
        {label}
      </p>
      <svg width={w} height={height} style={{ overflow:"visible" }}>
        {/* Grid lines */}
        {[2.5, 5, 7.5].map(v => (
          <line key={v}
            x1={0} y1={(1 - v/max) * height}
            x2={w} y2={(1 - v/max) * height}
            stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
        ))}
        {/* Area fill */}
        <path
          d={`${path} L${w},${height} L0,${height} Z`}
          fill={color} fillOpacity={0.08}
        />
        {/* Line */}
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i}
            cx={i * step} cy={height - (p / max) * height}
            r={2} fill={color} opacity={0.85} />
        ))}
      </svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StoryEngine({ project, scenes, memory: memoryProp }: Props) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [tab,         setTab]         = useState<Tab>("arc");
  const [aiInsight,   setAiInsight]   = useState<string | null>(null);
  const [aiLoading,   setAiLoading]   = useState(false);

  const analysis = useMemo(() => analyseStory(scenes), [scenes]);
  const memory   = useMemo(
    () => memoryProp ?? deriveMemory(scenes, project.id),
    [scenes, project.id, memoryProp]
  );

  // ── Free drag ──────────────────────────────────────────────────────────────
  const drag = useFreeDrag({
    panelId:  "story-engine-panel",
    defaultX: 12,
    defaultY: 10,
    anchor:   "top-left",
    width:    260,
    height:   480,
    safetyPx: 24,
  });

  // Reset Layout support
  useEffect(() => onPanelsReset(drag.reset), [drag.reset]);

  // AI narrative insight (sequence-level chat, story framing)
  const getAiNarrative = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-director", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          action:  "chat",
          project: { title:project.title, genre:project.genre, storyMemory:project.storyMemory, scenes },
          messages: [{
            id:"story-q", role:"user", content:
              `In 3–4 sentences, give me a narrative-level assessment of this ${scenes.length}-shot sequence for "${project.title}". ` +
              `Address: story structure, character arc visibility, emotional progression, and the single biggest narrative risk. ` +
              `Speak like a script editor, not a camera operator.`,
            time: Date.now(),
          }],
        }),
      });
      const data = await res.json();
      setAiInsight(data.reply ?? null);
    } catch { setAiInsight("VISH offline — check connection."); }
    finally   { setAiLoading(false); }
  }, [scenes, project]);

  const totalRT = analysis.totalRuntime >= 60
    ? `${Math.floor(analysis.totalRuntime/60)}m ${analysis.totalRuntime%60}s`
    : `${analysis.totalRuntime}s`;

  return (
    <div
      ref={drag.panelRef}
      onClick={drag.focus}
      style={{
        position:       "fixed",
        left:           drag.initialX,
        top:            drag.initialY,
        width:          collapsed ? 36 : 260,
        zIndex:         drag.zIndex,
        background:     collapsed ? "transparent" : "rgba(10,10,18,0.97)",
        border:         collapsed ? "none" : "1px solid rgba(255,255,255,0.09)",
        borderRadius:   6,
        backdropFilter: "blur(16px)",
        boxShadow:      collapsed ? "none" : "0 4px 32px rgba(0,0,0,0.50)",
        transition:     "width 0.2s ease",
        overflow:       "hidden",
        fontFamily:     "monospace",
        maxHeight:      collapsed ? "auto" : 480,
        display:        "flex",
        flexDirection:  "column",
      }}>

      {/* ── Collapse toggle (drag handle when collapsed) ── */}
      <button
        {...(collapsed ? drag.handleProps : {})}
        onClick={() => setCollapsed(p => !p)}
        style={{
          position:       collapsed ? "static" : "absolute",
          top:            collapsed ? 0 : 8,
          left:           collapsed ? 0 : 8,
          width:          collapsed ? 36 : 22,
          height:         collapsed ? 36 : 22,
          borderRadius:   collapsed ? 6 : "50%",
          background:     "rgba(99,102,241,0.14)",
          border:         "1px solid rgba(99,102,241,0.28)",
          cursor:         collapsed ? drag.handleProps.style.cursor : "pointer",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       collapsed ? 12 : 9,
          color:          "rgba(147,150,255,0.75)",
          flexShrink:     0,
          zIndex:         10,
          touchAction:    "none",
        }}
      >
        {collapsed ? "◈" : "▶"}
      </button>

      {collapsed && (
        <div style={{
          writingMode:"vertical-rl", textOrientation:"mixed",
          fontSize:7, color:"rgba(147,150,255,0.40)",
          letterSpacing:"0.2em", textTransform:"uppercase",
          padding:"8px 0", textAlign:"center",
        }}>
          Story Engine
        </div>
      )}

      {!collapsed && (
        <>
          {/* ── Header (drag handle) ── */}
          <div
            {...drag.handleProps}
            style={{
              padding:"10px 12px 0 34px",
              ...drag.handleProps.style,
              cursor: drag.isDragging ? "grabbing" : "grab",
            }}
          >
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
              <span style={{ fontSize:8, color:"rgba(147,150,255,0.75)", letterSpacing:"0.22em", textTransform:"uppercase" }}>
                Story Engine
              </span>
              <span style={{ fontSize:7, color:"rgba(255,255,255,0.18)" }}>
                {scenes.length} shots · {totalRT}
              </span>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:1.5, marginBottom:0 }}>
              {(["arc","cast","lenses","issues","memory"] as Tab[]).map(t => {
                const labels: Record<Tab,string> = { arc:"Arc", cast:"Cast", lenses:"Locs", issues:`Issues${analysis.issues.length > 0 ? ` ${analysis.issues.length}` : ""}`, memory:"Memory" };
                return (
                  <button key={t} data-no-drag onClick={() => setTab(t)} style={{
                    flex:1, fontSize:6.5, padding:"3.5px 0",
                    borderRadius:"3px 3px 0 0",
                    border:`1px solid ${tab === t ? "rgba(99,102,241,0.40)" : "rgba(255,255,255,0.06)"}`,
                    borderBottom:"none",
                    background: tab === t ? "rgba(99,102,241,0.14)" : "rgba(255,255,255,0.02)",
                    color:      tab === t ? "rgba(147,150,255,0.90)" : "rgba(255,255,255,0.28)",
                    cursor:"pointer", textTransform:"uppercase" as const, letterSpacing:"0.12em",
                    fontWeight: t === "issues" && analysis.issues.filter(i=>i.type==="warning"||i.type==="error").length > 0 ? 700 : 400,
                  }}>
                    {labels[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div style={{
            flex:1, overflowY:"auto", padding:"10px 12px",
            borderTop:"1px solid rgba(99,102,241,0.18)",
          }}>

            {/* ── ARC TAB ── */}
            {tab === "arc" && (
              <div>
                <Sparkline
                  points={analysis.intensityPoints}
                  color="#cc4444"
                  label="Emotional intensity"
                />
                <Sparkline
                  points={analysis.pacePoints}
                  color="#4488cc"
                  label="Pace (high = fast)"
                />

                {/* Mood run bands */}
                <div style={{ marginTop:8, marginBottom:4 }}>
                  <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:4 }}>
                    Mood flow
                  </p>
                  <div style={{ display:"flex", height:12, borderRadius:3, overflow:"hidden", gap:1 }}>
                    {analysis.moodRuns.map((run, i) => {
                      const pct = ((run.end - run.start + 1) / scenes.length) * 100;
                      return (
                        <div key={i} title={`${run.mood} (shots ${run.start+1}–${run.end+1})`}
                          style={{
                            width:`${pct}%`, background: MOOD_COLOR[run.mood] ?? "#555",
                            opacity:0.7, borderRadius:2,
                          }} />
                      );
                    })}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 8px", marginTop:5 }}>
                    {Array.from(new Set(analysis.moodRuns.map(r => r.mood))).map(mood => (
                      <div key={mood} style={{ display:"flex", alignItems:"center", gap:3 }}>
                        <div style={{ width:6, height:6, borderRadius:1, background: MOOD_COLOR[mood] ?? "#555" }} />
                        <span style={{ fontSize:6.5, color:"rgba(255,255,255,0.35)" }}>{mood}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shot type donut-style bar */}
                <div style={{ marginTop:8 }}>
                  <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:4 }}>
                    Shot types
                  </p>
                  {Object.entries(analysis.shotTypeCounts)
                    .sort((a,b) => b[1]-a[1])
                    .map(([type, count]) => {
                      const pct = Math.round((count / scenes.length) * 100);
                      const ab  = type.split(" ").map(w=>w[0]).join("");
                      return (
                        <div key={type} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
                          <span style={{ fontSize:6.5, color:"rgba(255,255,255,0.35)", width:32, flexShrink:0 }}>{ab}</span>
                          <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:"rgba(147,150,255,0.55)", borderRadius:2 }} />
                          </div>
                          <span style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", width:20, textAlign:"right" }}>{pct}%</span>
                        </div>
                      );
                    })}
                </div>

                {/* AI narrative button */}
                <button onClick={getAiNarrative} disabled={aiLoading} style={{
                  width:"100%", marginTop:10, padding:"6px 0",
                  borderRadius:4, cursor:aiLoading?"not-allowed":"pointer",
                  border:"1px solid rgba(99,102,241,0.30)",
                  background:"rgba(99,102,241,0.08)",
                  color:"rgba(147,150,255,0.75)", fontSize:7.5,
                  letterSpacing:"0.15em", textTransform:"uppercase",
                }}>
                  {aiLoading ? "Thinking…" : "◈ VISH Story Read"}
                </button>
                {aiInsight && (
                  <div style={{ marginTop:8, padding:"8px 10px", borderRadius:4, background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.15)" }}>
                    <p style={{ fontSize:8.5, color:"rgba(200,200,240,0.80)", lineHeight:1.6 }}>{aiInsight}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── CAST TAB ── */}
            {tab === "cast" && (
              <div>
                {analysis.castDistribution.length === 0 ? (
                  <p style={{ fontSize:8, color:"rgba(255,255,255,0.20)", lineHeight:1.6 }}>
                    No character data yet. Add characters in Scene Detail panels to track cast distribution.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:8 }}>
                      Screen time distribution
                    </p>
                    {analysis.castDistribution.map(char => {
                      const pct = Math.round((char.screenTime / analysis.totalRuntime) * 100);
                      return (
                        <div key={char.name} style={{ marginBottom:9 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                            <span style={{ fontSize:8, color:"rgba(220,220,240,0.75)", fontWeight:600 }}>{char.name}</span>
                            <span style={{ fontSize:7, color:"rgba(255,255,255,0.28)" }}>
                              {char.scenes.length} shots · {char.screenTime}s · {pct}%
                            </span>
                          </div>
                          <div style={{ display:"flex", gap:1.5, alignItems:"center" }}>
                            {/* Scene presence strip */}
                            {scenes.map((_, i) => {
                              const present = char.scenes.includes(i);
                              return (
                                <div key={i} style={{
                                  flex:1, height:5, borderRadius:1,
                                  background: present
                                    ? "rgba(147,150,255,0.65)"
                                    : "rgba(255,255,255,0.06)",
                                }} title={present ? `Shot ${i+1}` : ""} />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Protagonist continuity check */}
                    {analysis.castDistribution.length > 0 && (() => {
                      const lead = analysis.castDistribution[0];
                      const leadSet = new Set(lead.scenes);
                      let maxGap = 0; let gap = 0;
                      for (let i = 0; i < scenes.length; i++) {
                        if (!leadSet.has(i)) { gap++; maxGap = Math.max(maxGap, gap); } else gap = 0;
                      }
                      if (maxGap >= 3) return (
                        <div style={{ marginTop:8, padding:"6px 8px", borderRadius:3, background:"rgba(255,140,40,0.08)", border:"1px solid rgba(255,140,40,0.20)" }}>
                          <p style={{ fontSize:7.5, color:"rgba(255,180,100,0.80)", lineHeight:1.5 }}>
                            ⚠ Lead "{lead.name}" absent for {maxGap} consecutive shots — audience identification risk.
                          </p>
                        </div>
                      );
                      return null;
                    })()}
                  </>
                )}
              </div>
            )}

            {/* ── LOCATIONS TAB ── */}
            {tab === "lenses" && (
              <div>
                <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:8 }}>
                  Location heatmap
                </p>
                {analysis.locationGroups.slice(0, 10).map((loc, gi) => {
                  const pct = (loc.sceneIdxs.length / scenes.length) * 100;
                  return (
                    <div key={gi} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                        <span style={{ fontSize:7.5, color:"rgba(220,220,240,0.65)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {loc.location}
                        </span>
                        <span style={{ fontSize:7, color:"rgba(255,255,255,0.25)" }}>
                          {loc.sceneIdxs.length}×
                        </span>
                      </div>
                      {/* Scene presence */}
                      <div style={{ display:"flex", gap:1.5 }}>
                        {scenes.map((_, i) => (
                          <div key={i} style={{
                            flex:1, height:4, borderRadius:1,
                            background: loc.sceneIdxs.includes(i)
                              ? `rgba(99,102,241,${0.3 + (pct/100)*0.5})`
                              : "rgba(255,255,255,0.05)",
                          }} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Location variety insight */}
                <div style={{ marginTop:8, padding:"6px 8px", borderRadius:3, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize:7.5, color:"rgba(200,200,240,0.50)", lineHeight:1.5 }}>
                    {analysis.locationGroups.length} unique locations · {Math.round(memory.locationVariety * 100)}% variety
                    {memory.locationVariety < 0.4
                      ? " — consider adding a new environment for visual freshness."
                      : " — good spatial variety."}
                  </p>
                </div>
              </div>
            )}

            {/* ── ISSUES TAB ── */}
            {tab === "issues" && (
              <div>
                {analysis.issues.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"16px 0" }}>
                    <p style={{ fontSize:18, marginBottom:6 }}>✓</p>
                    <p style={{ fontSize:8, color:"rgba(100,220,130,0.70)" }}>No structural issues detected.</p>
                    <p style={{ fontSize:7, color:"rgba(255,255,255,0.20)", marginTop:4, lineHeight:1.5 }}>
                      Keep monitoring as the sequence grows.
                    </p>
                  </div>
                ) : (
                  analysis.issues.map((issue, i) => {
                    const bg    = issue.type === "error"   ? "rgba(200,40,40,0.10)"
                                : issue.type === "warning" ? "rgba(200,120,30,0.10)"
                                :                            "rgba(99,102,241,0.08)";
                    const border = issue.type === "error"   ? "rgba(200,40,40,0.28)"
                                 : issue.type === "warning" ? "rgba(200,120,30,0.28)"
                                 :                            "rgba(99,102,241,0.20)";
                    const color  = issue.type === "error"   ? "rgba(255,140,120,0.85)"
                                 : issue.type === "warning" ? "rgba(255,185,100,0.85)"
                                 :                            "rgba(160,165,255,0.80)";
                    const icon   = issue.type === "error" ? "✖" : issue.type === "warning" ? "⚠" : "→";
                    return (
                      <div key={i} style={{ marginBottom:7, padding:"7px 9px", borderRadius:4, background:bg, border:`1px solid ${border}` }}>
                        <p style={{ fontSize:8.5, color, lineHeight:1.55 }}>
                          <span style={{ marginRight:5 }}>{icon}</span>
                          {issue.text}
                          {issue.sceneIdx != null && (
                            <span style={{ fontSize:7, opacity:0.55, marginLeft:4 }}>
                              (shot {issue.sceneIdx+1})
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── MEMORY TAB ── */}
            {tab === "memory" && (
              <div>
                {/* Director tendencies */}
                <MemRow label="Lighting"   value={memory.dominantLighting} />
                <MemRow label="Moods"      value={memory.dominantMoods.join(", ") || "—"} />
                <MemRow label="Shots"      value={memory.dominantShotTypes.join(", ") || "—"} />
                <MemRow label="Lens"       value={memory.dominantLens ?? "—"} />
                <MemRow label="Movement"   value={memory.dominantMovement ?? "—"} />
                <MemRow label="Loc variety" value={`${Math.round(memory.locationVariety*100)}%`} />
                <MemRow label="Mood variety" value={`${Math.round(memory.moodVariety*100)}%`} />

                {memory.creativeTendencies.length > 0 && (
                  <div style={{ marginTop:10, marginBottom:4 }}>
                    <p style={{ fontSize:6.5, color:"rgba(147,150,255,0.50)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:5 }}>
                      VISH Observations
                    </p>
                    {memory.creativeTendencies.map((t, i) => (
                      <p key={i} style={{ fontSize:8, color:"rgba(200,200,240,0.65)", lineHeight:1.55, marginBottom:4 }}>
                        — {t}
                      </p>
                    ))}
                  </div>
                )}

                {memory.continuityFlags.length > 0 && (
                  <div style={{ marginTop:6 }}>
                    <p style={{ fontSize:6.5, color:"rgba(255,160,80,0.55)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:5 }}>
                      Continuity Flags
                    </p>
                    {memory.continuityFlags.map((f, i) => (
                      <p key={i} style={{ fontSize:8, color:"rgba(255,185,110,0.70)", lineHeight:1.55, marginBottom:4 }}>
                        ⚠ {f}
                      </p>
                    ))}
                  </div>
                )}

                {!memory.creativeTendencies.length && !memory.continuityFlags.length && (
                  <p style={{ fontSize:8, color:"rgba(255,255,255,0.20)", marginTop:8, lineHeight:1.6 }}>
                    No VISH observations yet. Open the VISH Director panel and run a Deep Analysis to populate creative memory.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MemRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
      <span style={{ fontSize:7, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.12em" }}>
        {label}
      </span>
      <span style={{ fontSize:7.5, color:"rgba(220,220,240,0.60)", maxWidth:"58%", textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {value}
      </span>
    </div>
  );
}
