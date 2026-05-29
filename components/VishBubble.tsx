"use client";

/**
 * VishBubble — Notion / Discord style floating mascot.
 *
 * Phase 15 (silhouette refresh) + Phase 16 (true free drag with inertia).
 *
 * - Transparent snowman silhouette — drop-shadow glow follows the shape itself
 * - Free-form X+Y drag, 60fps via direct-DOM transforms (useFreeDrag)
 * - Click (no drag) → expand into chat panel
 * - Slide-up panel with three tabs: Chat, Insights, Memory
 * - Persists across navigation, follows last-opened project from Studio
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import type { Project, DirectorMessage } from "@/types";
import { getProjects, getLastOpenedId } from "@/lib/storage";
import { useFreeDrag } from "@/hooks/useFreeDrag";
import { getVishTier, bumpQuota, onTierChanged, type VishTier } from "@/lib/model-tiers";

const STORAGE_KEY_MSGS = "previslab_vish_bubble_msgs";
const STORAGE_KEY_OPEN = "previslab_vish_bubble_open";

const VISH_AVATAR_PRIMARY  = "/vish-snowman.png";
const VISH_AVATAR_FALLBACK = "/vish-snowman.svg";

// ── Avatar component — transparent silhouette with drop-shadow glow ──────────
function VishAvatar({ size = 44, alt = "VISH", glow = false }: { size?: number; alt?: string; glow?: boolean }) {
  const [src, setSrc] = useState(VISH_AVATAR_PRIMARY);
  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt={alt}
      onError={() => setSrc(VISH_AVATAR_FALLBACK)}
      style={{
        width:         size,
        height:        size,
        objectFit:     "contain",
        display:       "block",
        background:    "transparent",
        userSelect:    "none",
        pointerEvents: "none",
        filter:        glow
          ? "drop-shadow(0 6px 14px rgba(12,16,39,0.55)) drop-shadow(0 0 16px rgba(212,168,67,0.30))"
          : "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
      }}
      draggable={false}
      priority
    />
  );
}

type Tab = "chat" | "insights" | "memory";

function newMsg(role: "user" | "director", content: string): DirectorMessage {
  return { id: `${Date.now()}-${Math.random()}`, role, content, time: Date.now() };
}

function loadActiveProject(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const all = getProjects();
    if (!all.length) return null;
    const id = getLastOpenedId();
    return id ? (all.find(p => p.id === id) ?? all[0]) : all[0];
  } catch { return null; }
}

// ── Main component ──────────────────────────────────────────────────────────
export default function VishBubble() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen]       = useState(false);
  const [unread, setUnread]   = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    setMounted(true);
    setProject(loadActiveProject());
    if (typeof window !== "undefined") {
      try { setOpen(localStorage.getItem(STORAGE_KEY_OPEN) === "1"); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(STORAGE_KEY_OPEN, open ? "1" : "0"); } catch {}
    if (open) setUnread(false);
  }, [open, mounted]);

  // Sync project across tabs / when user opens different project in Studio
  useEffect(() => {
    if (!mounted) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "previslab_projects" || e.key === "previslab_last_opened") {
        setProject(loadActiveProject());
      }
    };
    window.addEventListener("storage", onStorage);
    const t = setInterval(() => setProject(loadActiveProject()), 10_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <>
      {!open && (
        <BubbleAvatar
          unread={unread}
          onOpen={() => setOpen(true)}
        />
      )}
      {open && (
        <VishPanel
          project={project}
          onClose={() => setOpen(false)}
          onUnread={() => setUnread(true)}
        />
      )}
    </>,
    document.body,
  );
}

// ── Bubble avatar ────────────────────────────────────────────────────────────
function BubbleAvatar({
  unread, onOpen,
}: {
  unread: boolean;
  onOpen: () => void;
}) {
  // Track click vs drag — short, low-distance press = click
  const downRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const drag = useFreeDrag({
    panelId:   "vish-bubble",
    defaultX:  24, defaultY: 24,
    anchor:    "bottom-right",
    width:     72, height: 72,
    safetyPx:  16,
  });

  const onPointerDownClickShim = useCallback((e: React.PointerEvent) => {
    downRef.current = { t: Date.now(), x: e.clientX, y: e.clientY };
  }, []);

  const onClickIfNotDragged = useCallback((e: React.PointerEvent) => {
    if (!downRef.current) return;
    const dt = Date.now() - downRef.current.t;
    const dist = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
    downRef.current = null;
    if (dt < 350 && dist < 6) onOpen();
  }, [onOpen]);

  return (
    <div
      ref={drag.panelRef}
      title="Open VISH (drag to move)"
      role="button"
      onPointerDownCapture={onPointerDownClickShim}
      onPointerUpCapture={onClickIfNotDragged}
      {...drag.handleProps}
      className="vish-bubble-float"
      data-dragging={drag.isDragging || undefined}
      style={{
        position:       "fixed",
        left:           drag.initialX,
        top:            drag.initialY,
        width:          72,
        height:         72,
        background:     "transparent",
        zIndex:         drag.zIndex,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        ...drag.handleProps.style,
      }}
    >
      <VishAvatar size={68} glow />
      {unread && (
        <span
          style={{
            position:     "absolute",
            top:          6,
            right:        4,
            width:        12,
            height:       12,
            borderRadius: "50%",
            background:   "#fbbf24",
            boxShadow:    "0 0 0 2px rgba(8,10,22,0.95), 0 0 10px rgba(251,191,36,0.5)",
          }}
          className="vish-bubble-unread"
        />
      )}
    </div>
  );
}

// ── Slide-up Panel ───────────────────────────────────────────────────────────
function VishPanel({
  project, onClose,
}: {
  project:  Project | null;
  onClose:  () => void;
  onUnread: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [tier, setTier] = useState<VishTier>(() => getVishTier(project?.id));

  useEffect(() => onTierChanged(({ kind, tier: t }) => {
    if (kind === "vish") setTier(t as VishTier);
  }), []);

  const [messages, setMessages] = useState<DirectorMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_MSGS);
      if (raw) return JSON.parse(raw) as DirectorMessage[];
    } catch {}
    return [];
  });

  useEffect(() => {
    if (messages.length === 0) {
      const greeting = project
        ? `VISH online. I see ${project.scenes.length} shots loaded on "${project.title}". What do you want to shape?`
        : "VISH online. Open a project in Studio and I'll bring full cinematic context.";
      setMessages([newMsg("director", greeting)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(STORAGE_KEY_MSGS, JSON.stringify(messages.slice(-50))); } catch {}
  }, [messages]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!project) {
      setMessages(m => [...m, newMsg("user", text), newMsg("director", "I need an active project to give grounded answers. Open one in Studio first.")]);
      setInput("");
      return;
    }
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
          action: "chat",
          tier,
          messages: next,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes: project.scenes },
          selectedScene: null,
        }),
      });
      const data = await res.json() as { reply?: string; notice?: string };
      const reply = data.reply ?? "VISH is recalibrating.";
      setMessages(m => [...m, newMsg("director", reply)]);
      bumpQuota("vish", tier);
    } catch {
      setMessages(m => [...m, newMsg("director", "Connection dropped — retry in a moment.")]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, project, tier]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  }, [sendChat]);

  const W = 360;
  const H = 540;

  // Free drag for the panel via header
  const drag = useFreeDrag({
    panelId:  "vish-panel",
    defaultX: 24, defaultY: 24,
    anchor:   "bottom-right",
    width:    W, height: H,
    safetyPx: 32,
  });

  return (
    <div
      ref={drag.panelRef}
      className="vish-panel-slide-up"
      data-dragging={drag.isDragging || undefined}
      style={{
        position:      "fixed",
        left:          drag.initialX,
        top:           drag.initialY,
        width:         W,
        height:        H,
        zIndex:        drag.zIndex,
        background:    "rgba(8, 10, 22, 0.97)",
        borderRadius:  14,
        border:        "1px solid rgba(212, 168, 67, 0.18)",
        boxShadow:     "0 24px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(212, 168, 67, 0.05)",
        backdropFilter: "blur(20px)",
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
      }}
    >
      <PanelHeader
        project={project}
        tier={tier}
        onClose={onClose}
        dragHandleProps={drag.handleProps}
        isDragging={drag.isDragging}
      />

      <div style={{
        display:     "flex",
        gap:         0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background:   "rgba(0,0,0,0.25)",
      }}>
        <TabBtn label="Chat"     active={tab === "chat"}     onClick={() => setTab("chat")} />
        <TabBtn label="Insights" active={tab === "insights"} onClick={() => setTab("insights")} />
        <TabBtn label="Memory"   active={tab === "memory"}   onClick={() => setTab("memory")} />
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "chat" && (
          <>
            <div className="vish-chat-bg" style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map(m => <MessageBubble key={m.id} message={m} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <VishAvatar size={22} />
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {[0,1,2].map(i => (
                      <span key={i} style={{
                        width: 4, height: 4, borderRadius: "50%",
                        background: "rgba(212,168,67,0.7)",
                        animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite`,
                      }} />
                    ))}
                  </span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{
              padding:    10,
              borderTop:  "1px solid rgba(255,255,255,0.06)",
              background: "rgba(0,0,0,0.2)",
            }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={project ? `Talk to VISH about "${project.title}"…` : "Type to talk to VISH…"}
                rows={2}
                data-no-drag
                style={{
                  width:        "100%",
                  background:   "rgba(255,255,255,0.04)",
                  border:       "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  padding:      "7px 9px",
                  fontSize:     11,
                  color:        "rgba(255,255,255,0.85)",
                  fontFamily:   "monospace",
                  outline:      "none",
                  resize:       "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                  Enter to send · Shift+Enter for newline · {tier === "pro" ? "Pro" : "Flash"} tier
                </span>
                <button
                  data-no-drag
                  onClick={sendChat}
                  disabled={loading || !input.trim()}
                  style={{
                    padding:       "5px 12px",
                    borderRadius:  4,
                    border:        "1px solid rgba(212,168,67,0.30)",
                    background:    "rgba(212,168,67,0.10)",
                    color:         "rgba(251,191,36,0.85)",
                    fontSize:      9,
                    fontFamily:    "monospace",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    cursor:        loading || !input.trim() ? "not-allowed" : "pointer",
                    opacity:       loading || !input.trim() ? 0.4 : 1,
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "insights" && <InsightsPanel project={project} tier={tier} />}
        {tab === "memory"   && <MemoryPanel  project={project} />}
      </div>
    </div>
  );
}

function PanelHeader({
  project, tier, onClose, dragHandleProps, isDragging,
}: {
  project: Project | null;
  tier:    VishTier;
  onClose: () => void;
  dragHandleProps: ReturnType<typeof useFreeDrag>["handleProps"];
  isDragging: boolean;
}) {
  return (
    <div
      {...dragHandleProps}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           10,
        padding:       "10px 12px",
        background:    "linear-gradient(180deg, rgba(20,24,52,0.85), rgba(8,10,22,0.85))",
        borderBottom:  "1px solid rgba(255,255,255,0.06)",
        flexShrink:    0,
        ...dragHandleProps.style,
        cursor:        isDragging ? "grabbing" : "grab",
      }}
    >
      <VishAvatar size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "0.04em" }}>
            VISH
          </span>
          <span style={{
            fontSize: 7,
            padding: "1px 5px",
            borderRadius: 2,
            background: tier === "pro" ? "rgba(170,68,255,0.10)" : "rgba(80,200,120,0.10)",
            color:      tier === "pro" ? "rgba(200,150,255,0.8)" : "rgba(120,220,150,0.8)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily: "monospace",
          }}>
            {tier === "pro" ? "✦ Pro" : "⚡ Flash"}
          </span>
        </div>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.30)", fontFamily: "monospace" }}>
          {project ? project.title : "no project loaded"}
        </span>
      </div>
      <div data-no-drag style={{ display: "flex", gap: 4 }}>
        <button
          onClick={onClose}
          title="Close"
          style={{
            width:     22, height: 22, borderRadius: 4,
            border:    "none", background: "rgba(255,255,255,0.05)",
            color:     "rgba(255,255,255,0.55)", fontSize: 11, cursor: "pointer",
            display:   "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ─
        </button>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      data-no-drag
      onClick={onClick}
      style={{
        flex:           1,
        padding:        "8px 0",
        background:     active ? "rgba(212,168,67,0.10)" : "transparent",
        border:         "none",
        borderBottom:   active ? "2px solid rgba(212,168,67,0.7)" : "2px solid transparent",
        color:          active ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.32)",
        fontSize:       8.5,
        fontFamily:     "monospace",
        letterSpacing:  "0.22em",
        textTransform:  "uppercase",
        cursor:         "pointer",
        transition:     "all 150ms ease",
      }}
    >
      {label}
    </button>
  );
}

function MessageBubble({ message }: { message: DirectorMessage }) {
  const isUser = message.role === "user";
  return (
    <div style={{
      display:       "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap:           8,
      alignItems:    "flex-start",
    }}>
      {!isUser && <VishAvatar size={22} />}
      <div style={{
        maxWidth:     "78%",
        padding:      "7px 10px",
        borderRadius: isUser ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
        background:   isUser ? "rgba(212,168,67,0.10)" : "rgba(255,255,255,0.04)",
        border:       isUser ? "1px solid rgba(212,168,67,0.18)" : "1px solid rgba(255,255,255,0.06)",
        color:        isUser ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.82)",
        fontSize:     10.5,
        lineHeight:   1.55,
        whiteSpace:   "pre-wrap",
        wordBreak:    "break-word",
      }}>
        {message.content}
      </div>
    </div>
  );
}

function InsightsPanel({ project, tier }: { project: Project | null; tier: VishTier }) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<{ overallRhythm: string; directorNote: string; suggestions: string[] } | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!project || project.scenes.length === 0) {
      setError("No project loaded — open one in Studio first.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/ai-director", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          action:  "analyze-sequence",
          tier,
          scenes:  project.scenes,
          project: { title: project.title, genre: project.genre, storyMemory: project.storyMemory, scenes: project.scenes },
        }),
      });
      const data = await res.json();
      if (data.insight) {
        setInsight(data.insight);
        bumpQuota("vish", tier);
      } else {
        setError(data.error ?? "VISH could not analyze");
      }
    } catch {
      setError("Network error");
    } finally { setLoading(false); }
  }, [project, tier]);

  return (
    <div data-no-drag style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
      <p style={{ fontSize: 7, color: "rgba(251,191,36,0.45)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 6 }}>
        Sequence Insights
      </p>
      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 12 }}>
        Run a {tier === "pro" ? "deep" : "fast"} VISH analysis on the active sequence.
        {project ? ` ${project.scenes.length} shots loaded.` : " No project loaded."}
      </p>
      <button
        onClick={run}
        disabled={loading || !project}
        style={{
          width:         "100%",
          padding:       "8px 0",
          borderRadius:  4,
          border:        "1px solid rgba(212,168,67,0.30)",
          background:    "rgba(212,168,67,0.08)",
          color:         "rgba(251,191,36,0.85)",
          fontSize:      9,
          fontFamily:    "monospace",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          cursor:        loading || !project ? "not-allowed" : "pointer",
          opacity:       loading || !project ? 0.4 : 1,
        }}
      >
        {loading ? "Analyzing…" : "⬡ Run sequence scan"}
      </button>

      {error && <p style={{ fontSize: 9, color: "rgba(255,150,120,0.7)", marginTop: 12 }}>{error}</p>}

      {insight && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <Section label="Rhythm" accent="#fbbf24">
            <p style={{ fontSize: 11, color: "rgba(251,191,36,0.85)", textTransform: "capitalize" }}>{insight.overallRhythm}</p>
          </Section>
          <Section label="Director Note" accent="#aa44ff">
            <p style={{ fontSize: 10, color: "rgba(220,200,255,0.85)", lineHeight: 1.6 }}>{insight.directorNote}</p>
          </Section>
          {insight.suggestions?.length > 0 && (
            <Section label="Suggestions" accent="#fbbf24">
              {insight.suggestions.map((s, i) => (
                <p key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, marginBottom: 5 }}>
                  → {s}
                </p>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function MemoryPanel({ project }: { project: Project | null }) {
  if (!project) {
    return (
      <div data-no-drag style={{ flex: 1, padding: "14px 16px" }}>
        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
          No project loaded. Open one in Studio and VISH will surface its visual memory here — film style, dominant moods, recurring lenses, continuity flags.
        </p>
      </div>
    );
  }

  const m = project.storyMemory;
  const shotCounts: Record<string, number> = {};
  project.scenes.forEach(s => { shotCounts[s.shotType] = (shotCounts[s.shotType] ?? 0) + 1; });
  const topShots = Object.entries(shotCounts).sort((a,b) => b[1]-a[1]).slice(0,3);

  const moodCounts: Record<string, number> = {};
  project.scenes.forEach(s => { moodCounts[s.mood] = (moodCounts[s.mood] ?? 0) + 1; });
  const topMoods = Object.entries(moodCounts).sort((a,b) => b[1]-a[1]).slice(0,3);

  return (
    <div data-no-drag style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
      <p style={{ fontSize: 7, color: "rgba(251,191,36,0.45)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8 }}>
        Project Memory
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Title"  value={project.title} />
        <Field label="Genre"  value={project.genre} />
        <Field label="Shots"  value={`${project.scenes.length} shots`} />
        {m && <Field label="Style" value={m.filmStyle} />}
        {m && <Field label="Color grade" value={m.colorGrade} />}

        {topShots.length > 0 && (
          <div>
            <p style={{ fontSize: 7, color: "rgba(255,255,255,0.30)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
              Top shot types
            </p>
            {topShots.map(([k, v]) => (
              <p key={k} style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
                · {k} <span style={{ color: "rgba(255,255,255,0.30)" }}>×{v}</span>
              </p>
            ))}
          </div>
        )}

        {topMoods.length > 0 && (
          <div>
            <p style={{ fontSize: 7, color: "rgba(255,255,255,0.30)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
              Dominant moods
            </p>
            {topMoods.map(([k, v]) => (
              <p key={k} style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
                · {k} <span style={{ color: "rgba(255,255,255,0.30)" }}>×{v}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 7, color: accent, letterSpacing: "0.25em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
      <span style={{
        fontSize: 7, color: "rgba(255,255,255,0.30)",
        letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "monospace",
      }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", textAlign: "right", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </span>
    </div>
  );
}
