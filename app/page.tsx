import Link from "next/link";
import type { Metadata } from "next";
import VishMascot from "@/components/VishMascot";

export const metadata: Metadata = {
  title: "PREVIS AI — Cinematic Storyboard Intelligence",
  description:
    "From screenplay to cinematic storyboard. PREVIS AI understands your script, preserves continuity, and generates real film stills — powered by VISH, your AI co-director.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#060608] text-white flex flex-col overflow-x-hidden">

      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(14,10,28,0.9) 0%, #060608 65%)" }} />
        {/* Amber horizon glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[280px]"
          style={{ background: "radial-gradient(ellipse at center top, rgba(251,191,36,0.055) 0%, transparent 70%)" }} />
        {/* Subtle horizontal scanlines */}
        <div className="absolute inset-0 opacity-[0.012]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 3px)", backgroundSize: "100% 4px" }} />
      </div>

      {/* ── Navigation ── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-sm border border-amber-400/25 bg-amber-400/8 flex items-center justify-center">
            <span className="text-amber-400 text-[9px] font-black tracking-widest">P</span>
          </div>
          <span className="text-[13px] font-bold tracking-[0.12em] text-white/88">
            PREVIS<span className="text-amber-400">·</span>AI
          </span>
          <span className="text-[7px] font-mono text-white/18 border border-white/8 rounded-sm px-1.5 py-0.5 uppercase tracking-widest ml-1">
            Beta
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-[9px] font-mono text-white/20 uppercase tracking-widest">
            Screenplay Intelligence
          </span>
          <Link href="/studio"
            className="text-[11px] font-semibold px-4 py-2 rounded-full bg-amber-400 text-black hover:bg-amber-300 transition-all hover:scale-105 active:scale-100">
            Open Studio →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-20 pb-10 text-center">

        {/* VISH introduction */}
        <div className="flex flex-col items-center gap-4 mb-10 stagger-children">
          <VishMascot state="idle" size={72} />
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/18 bg-amber-400/5 px-4 py-1.5">
            <span className="text-[9px] font-mono text-amber-400/60 uppercase tracking-[0.18em]">
              Powered by VISH — Visual Intelligence for Shot Handling
            </span>
          </div>
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-[42px] sm:text-6xl lg:text-7xl font-black leading-[1.04] tracking-tight animate-fade-up">
          Screenplay to{" "}
          <br className="hidden sm:block" />
          <span style={{
            background: "linear-gradient(92deg, #fbbf24 0%, #f97316 45%, #fb923c 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Cinematic Storyboard
          </span>
        </h1>

        <p className="mt-6 max-w-md text-[15px] text-white/35 leading-relaxed font-light animate-fade-up" style={{ animationDelay: "80ms" }}>
          VISH reads your screenplay, understands character continuity, preserves
          environment consistency, and generates real cinematic frames — not concept art.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 items-center animate-fade-up" style={{ animationDelay: "160ms" }}>
          <Link href="/studio"
            className="group flex items-center gap-2 rounded-full bg-amber-400 px-8 py-3.5 text-[13px] font-bold text-black hover:bg-amber-300 transition-all hover:scale-105 active:scale-100"
            style={{ boxShadow: "0 0 48px rgba(251,191,36,0.22)" }}>
            Start Storyboarding
            <svg className="h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <span className="text-[10px] font-mono text-white/18 uppercase tracking-widest">
            Free · No login · No credit card
          </span>
        </div>

        {/* Capability chips */}
        <div className="mt-12 flex flex-wrap justify-center gap-2 max-w-2xl animate-fade-up" style={{ animationDelay: "240ms" }}>
          {CAPABILITIES.map(cap => (
            <span key={cap}
              className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[9px] font-mono text-white/28 uppercase tracking-widest hover:border-white/10 transition-colors">
              {cap}
            </span>
          ))}
        </div>
      </section>

      {/* ── Demo window ── */}
      <section className="relative z-10 px-4 sm:px-10 pb-16 flex justify-center">
        <div className="w-full max-w-5xl">
          {/* Window chrome */}
          <div className="rounded-xl overflow-hidden"
            style={{
              background: "rgba(8,8,16,0.95)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}>

            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] bg-black/20">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
              <span className="ml-3 text-[8px] font-mono text-white/12 uppercase tracking-widest">
                previs-ai · studio · storyboard
              </span>
              <div className="ml-auto flex items-center gap-4">
                {["Storyboard", "Timeline", "VISH"].map(lbl => (
                  <span key={lbl}
                    className={`text-[8px] font-mono uppercase tracking-widest ${lbl === "VISH" ? "text-amber-400/40" : "text-white/12"}`}>
                    {lbl}
                  </span>
                ))}
              </div>
            </div>

            {/* Storyboard grid */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DEMO_FRAMES.map((frame, i) => (
                  <div key={i} className="relative overflow-hidden rounded-sm hover-lift"
                    style={{ aspectRatio: "16/9", border: "1px solid rgba(255,255,255,0.07)" }}>
                    {/* Scene background */}
                    <div className="absolute inset-0" style={{ background: frame.bg }} />
                    {/* Letterbox */}
                    <div className="absolute inset-x-0 top-0 h-[8%] bg-black pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black pointer-events-none" />
                    {/* Vignette */}
                    <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.65) 100%)" }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {/* Corners */}
                    <div className="absolute top-[10%] left-2 w-2 h-2 border-t border-l border-white/18" />
                    <div className="absolute top-[10%] right-2 w-2 h-2 border-t border-r border-white/18" />
                    {/* Number */}
                    <div className="absolute top-[10%] left-2 ml-3">
                      <div className="h-4 w-4 rounded-sm bg-amber-400 flex items-center justify-center">
                        <span className="text-[7px] font-black text-black leading-none">{i + 1}</span>
                      </div>
                    </div>
                    {/* Shot type */}
                    <div className="absolute top-[10%] right-2 mr-1">
                      <span className="text-[7px] font-mono text-white/40 bg-black/60 px-1 py-0.5 rounded-sm">{frame.shot}</span>
                    </div>
                    {/* Mood */}
                    <div className="absolute bottom-[11%] right-2">
                      <span className={`text-[7px] font-bold uppercase tracking-wide rounded-sm px-1.5 py-0.5 ${frame.moodCls}`}>{frame.mood}</span>
                    </div>
                    {/* Title */}
                    <div className="absolute bottom-[11%] left-2">
                      <span className="text-[8px] font-semibold text-white/65">{frame.title}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* VISH insight strip */}
              <div className="mt-3 flex items-start gap-2.5 rounded-md px-3 py-2.5"
                style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.08)" }}>
                <VishMascot state="speaking" size={28} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-[8px] font-mono text-amber-400/50 uppercase tracking-widest mb-0.5">VISH · Shot 3 Analysis</p>
                  <p className="text-[9px] text-white/35 leading-snug">
                    Three consecutive medium shots risk visual monotony. Consider a dutch angle here — the unstable frame would mirror Ram&apos;s emotional state.
                    Reference: Villeneuve, <span className="text-amber-400/40">Sicario</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="relative z-10 border-t border-white/[0.04] px-4 sm:px-10 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[8px] font-mono text-amber-400/40 uppercase tracking-[0.2em] mb-3">Production Platform</p>
            <h2 className="text-2xl font-bold text-white/80">Every tool a director needs</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
            {FEATURES.map(f => (
              <div key={f.title} className="rounded-xl p-5 hover-lift transition-colors group"
                style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="mb-3 text-xl leading-none">{f.icon}</div>
                <h3 className="mb-1.5 text-[10px] font-bold text-white/70 uppercase tracking-wider">{f.title}</h3>
                <p className="text-[10px] text-white/30 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VISH section ── */}
      <section className="relative z-10 border-t border-white/[0.04] px-4 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <VishMascot state="thinking" size={80} className="mx-auto mb-6" />
          <h2 className="text-3xl font-black text-white/88 mb-2">VISH</h2>
          <p className="text-[9px] font-mono text-amber-400/45 uppercase tracking-[0.2em] mb-5">
            Visual Intelligence for Shot Handling
          </p>
          <p className="text-white/35 leading-relaxed text-sm max-w-lg mx-auto">
            VISH is your AI co-director. It reads screenplay structure, builds character continuity,
            preserves environment consistency, analyzes pacing, references real DOPs,
            and evolves with your creative memory across every session.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {VISH_FEATURES.map(f => (
              <div key={f} className="rounded-lg px-3 py-1.5 text-[8px] font-mono text-amber-400/40 uppercase tracking-wider"
                style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.08)" }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 border-t border-white/[0.04] px-4 py-20 text-center">
        <p className="text-[8px] font-mono text-white/15 uppercase tracking-[0.2em] mb-5">
          Start now · Free forever
        </p>
        <Link href="/studio"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-10 py-4 text-[13px] font-bold text-black hover:bg-amber-300 transition-all hover:scale-105 active:scale-100"
          style={{ boxShadow: "0 0 60px rgba(251,191,36,0.18)" }}>
          Open PREVIS AI Studio
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
        <p className="mt-4 text-[9px] font-mono text-white/15">
          Gemini AI · HuggingFace FLUX · Free tier · No account required
        </p>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.04] px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm border border-amber-400/20 bg-amber-400/8 flex items-center justify-center">
            <span className="text-amber-400 text-[7px] font-black">P</span>
          </div>
          <span className="text-[8px] font-mono text-white/18 tracking-widest">PREVIS·AI</span>
        </div>
        <span className="text-[8px] font-mono text-white/12">
          Built with Gemini AI · HuggingFace · FLUX
        </span>
      </footer>
    </div>
  );
}

/* ── Data ── */

const CAPABILITIES = [
  "Screenplay parsing", "Character continuity", "Environment memory",
  "Visual consistency", "Cinematic prompting", "FLUX generation",
  "VISH AI analysis", "Timeline workflow", "Shot list export",
];

const DEMO_FRAMES = [
  { title: "Night Arrival",      shot: "EWS",   mood: "Tense",      moodCls: "bg-red-900/70 text-red-300",    bg: "linear-gradient(135deg,#040208,#1a0a1e,#040208)" },
  { title: "The Confrontation",  shot: "CU",    mood: "Dramatic",   moodCls: "bg-purple-900/70 text-purple-300", bg: "linear-gradient(135deg,#050210,#0d0520,#050210)" },
  { title: "The Decision",       shot: "DUTCH", mood: "Action",     moodCls: "bg-orange-900/70 text-orange-300", bg: "linear-gradient(135deg,#100600,#2a1000,#100600)" },
  { title: "Final Standoff",     shot: "MS",    mood: "Mysterious", moodCls: "bg-indigo-900/70 text-indigo-300", bg: "linear-gradient(135deg,#020208,#0a0818,#020208)" },
];

const FEATURES = [
  { icon: "🎬", title: "AI Scene Extraction",  desc: "Gemini reads your script and extracts scenes with shot types, lighting, mood, characters, and locations." },
  { icon: "🧠", title: "Character Continuity", desc: "VISH tracks character appearances across shots. Same person, same clothing, same visual identity." },
  { icon: "🏠", title: "Environment Memory",   desc: "Locations persist visually. Ram's bedroom looks the same in Scene 1 and Scene 7." },
  { icon: "📽️", title: "Real Cinematic Frames",desc: "HuggingFace FLUX generates actual film stills — not concept art, not illustrations." },
  { icon: "◆",  title: "VISH Co-Director",     desc: "Pacing analysis, lens recommendations, film references, creative memory, director chat." },
  { icon: "📋", title: "Production Exports",   desc: "Professional shot list with camera, lens, lighting, and director notes. PDF-ready." },
];

const VISH_FEATURES = [
  "Screenplay understanding", "Character tracking", "Environment memory",
  "Pacing analysis", "Lens recommendations", "DOP references",
  "Creative memory", "Continuity flags", "Director chat",
];
