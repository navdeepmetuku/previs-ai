"use client";

/**
 * ModelSettingsPanel — tier picker for image + VISH AI generation.
 *
 * Phase 14. Higgsfield/Gemini/Kiro-style tier toggle with quota indicator
 * and provider availability status.
 *
 * Usage:
 *   <ModelSettingsPanel projectId={project.id} onClose={...} />
 *
 * Two flavours:
 *   - Inline pill (compact toolbar variant)
 *   - Full panel (settings drawer)
 *
 * Reads/writes via lib/model-tiers, dispatches "previslab:tier-changed" event.
 */

import { useState, useEffect, useCallback } from "react";
import {
  IMAGE_TIERS, VISH_TIERS,
  getImageTier, setImageTier,
  getVishTier,  setVishTier,
  getQuota,     onTierChanged,
  type ImageTier, type VishTier,
} from "@/lib/model-tiers";

interface Props {
  projectId?:  string;
  onClose?:    () => void;
  /** Compact inline mode — single pill */
  compact?:    boolean;
}

interface DbStatus { configured: boolean; ready: boolean; table: string; count?: number; error?: string; hint?: string }
interface ProviderStatus {
  draft:    boolean;
  standard: boolean;
  premium:  boolean;
  hf:       boolean;
}

export default function ModelSettingsPanel({ projectId, onClose, compact = false }: Props) {
  const [imgTier,  setImgTier]  = useState<ImageTier>(() => getImageTier(projectId));
  const [vishTier, setVishTier_] = useState<VishTier>(() => getVishTier(projectId));
  const [open,     setOpen]     = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [provStat, setProvStat] = useState<ProviderStatus>({ draft: true, standard: false, premium: false, hf: false });

  // Sync to global tier changes (e.g. updated from the bubble or another panel)
  useEffect(() => {
    return onTierChanged(({ kind, tier }) => {
      if (kind === "image") setImgTier(tier as ImageTier);
      if (kind === "vish")  setVishTier_(tier as VishTier);
    });
  }, []);

  // Fetch DB + provider status when the panel opens
  useEffect(() => {
    if (!open && !compact) return;
    let active = true;
    fetch("/api/db-status").then(r => r.json()).then(d => { if (active) setDbStatus(d); }).catch(() => {});
    fetch("/api/debug-env").then(r => r.json()).then(d => {
      if (!active) return;
      setProvStat({
        draft:    true,
        standard: !!d.fal,
        premium:  !!d.replicate,
        hf:       !!d.huggingface,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [open, compact]);

  const onPickImg = useCallback((t: ImageTier) => {
    setImgTier(t);
    setImageTier(t, projectId);
  }, [projectId]);

  const onPickVish = useCallback((t: VishTier) => {
    setVishTier_(t);
    setVishTier(t, projectId);
  }, [projectId]);

  const imgSpec  = IMAGE_TIERS.find(t => t.id === imgTier)!;
  const vishSpec = VISH_TIERS.find(t => t.id === vishTier)!;

  // ── Compact pill ──────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Model tiers"
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           6,
            padding:       "4px 10px",
            borderRadius:  16,
            border:        "1px solid rgba(251,191,36,0.25)",
            background:    "rgba(251,191,36,0.08)",
            color:         "rgba(251,191,36,0.85)",
            fontSize:      9,
            fontFamily:    "monospace",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor:        "pointer",
          }}
        >
          <span style={{ fontSize: 10 }}>{imgSpec.badge}</span>
          <span>{imgSpec.label}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ fontSize: 9 }}>{vishSpec.badge}</span>
          <span>{vishSpec.label}</span>
        </button>

        {open && (
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 100 }}
            />
            <div style={{
              position:      "absolute",
              top:           "calc(100% + 6px)",
              right:         0,
              minWidth:      280,
              maxWidth:      320,
              zIndex:        101,
              background:    "rgba(8,8,16,0.97)",
              border:        "1px solid rgba(255,255,255,0.10)",
              borderRadius:  8,
              backdropFilter: "blur(20px)",
              boxShadow:     "0 16px 48px rgba(0,0,0,0.6)",
              padding:       12,
            }}>
              <ModelSettingsBody
                imgTier={imgTier}  onPickImg={onPickImg}
                vishTier={vishTier} onPickVish={onPickVish}
                dbStatus={dbStatus} provStat={provStat}
                projectId={projectId}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Full panel ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16, color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 7, color: "rgba(251,191,36,0.45)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 4 }}>
            Phase 14 · Model Tiers
          </p>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
            Generation Quality
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            color: "rgba(255,255,255,0.4)", background: "transparent", border: "none",
            fontSize: 14, cursor: "pointer", padding: 4,
          }}>✕</button>
        )}
      </div>
      <ModelSettingsBody
        imgTier={imgTier}   onPickImg={onPickImg}
        vishTier={vishTier} onPickVish={onPickVish}
        dbStatus={dbStatus} provStat={provStat}
        projectId={projectId}
      />
    </div>
  );
}

// ── Body (shared between compact + full) ───────────────────────────────────

function ModelSettingsBody({
  imgTier, onPickImg, vishTier, onPickVish, dbStatus, provStat, projectId,
}: {
  imgTier: ImageTier; onPickImg: (t: ImageTier) => void;
  vishTier: VishTier; onPickVish: (t: VishTier) => void;
  dbStatus: DbStatus | null;
  provStat: ProviderStatus;
  projectId?: string;
}) {
  const imgUsed  = getQuota("image", imgTier);
  const vishUsed = getQuota("vish",  vishTier);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Image Tier */}
      <div>
        <SectionLabel
          title="Image Generation"
          right={`Used today: ${imgUsed}`}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {IMAGE_TIERS.map(t => {
            const available = provStat[t.id];
            const active    = imgTier === t.id;
            return (
              <TierRow
                key={t.id}
                badge={t.badge}
                label={t.label}
                blurb={t.blurb}
                cost={t.cost}
                active={active}
                available={available}
                recommended={t.recommended}
                onClick={() => onPickImg(t.id)}
              />
            );
          })}
        </div>
        <p style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", marginTop: 6, lineHeight: 1.5 }}>
          Falls back to Pollinations if a tier provider is unavailable. Pollinations is always free and never fails.
        </p>
      </div>

      {/* VISH Tier */}
      <div>
        <SectionLabel
          title="VISH AI (text)"
          right={`Used today: ${vishUsed}`}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {VISH_TIERS.map(t => {
            const active = vishTier === t.id;
            return (
              <TierRow
                key={t.id}
                badge={t.badge}
                label={t.label}
                blurb={t.blurb}
                cost={t.cost}
                active={active}
                available={true}
                recommended={t.recommended}
                onClick={() => onPickVish(t.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Cloud sync status */}
      <CloudSyncCard dbStatus={dbStatus} projectId={projectId} onRefresh={async () => {
        try {
          const r = await fetch("/api/db-status");
          const j = await r.json();
          // Note: caller refresh logic not lifted; just a visual nudge
          return j;
        } catch { return null; }
      }} />
    </div>
  );
}

function SectionLabel({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
      <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(251,191,36,0.65)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
        {title}
      </span>
      {right && (
        <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>
          {right}
        </span>
      )}
    </div>
  );
}

function TierRow({
  badge, label, blurb, cost, active, available, recommended, onClick,
}: {
  badge: string; label: string; blurb: string;
  cost: "free" | "free-credits" | "paid";
  active: boolean; available: boolean; recommended?: boolean;
  onClick: () => void;
}) {
  const costColor = cost === "free" ? "#50c878" : cost === "free-credits" ? "#fbbf24" : "#ff9966";
  const costLabel = cost === "free" ? "FREE" : cost === "free-credits" ? "CREDITS" : "PAID";

  return (
    <button
      onClick={onClick}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           10,
        padding:       "8px 10px",
        borderRadius:  5,
        border:        `1px solid ${active ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.07)"}`,
        background:    active ? "rgba(251,191,36,0.10)" : "rgba(255,255,255,0.02)",
        color:         "white",
        cursor:        "pointer",
        opacity:       available ? 1 : 0.55,
        textAlign:     "left",
        width:         "100%",
        transition:    "all 150ms ease",
      }}
      title={!available ? "Provider unavailable — add API key in .env.local" : undefined}
    >
      <span style={{ fontSize: 14, color: active ? "#fbbf24" : "rgba(255,255,255,0.55)" }}>
        {badge}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize:      10,
            fontWeight:    700,
            color:         active ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.85)",
            letterSpacing: "0.05em",
          }}>
            {label}
          </span>
          {recommended && (
            <span style={{
              fontSize: 6.5,
              fontFamily: "monospace",
              padding: "1px 4px",
              borderRadius: 2,
              background: "rgba(80,200,120,0.10)",
              color: "rgba(80,200,120,0.7)",
              letterSpacing: "0.1em",
            }}>
              REC
            </span>
          )}
          {!available && (
            <span style={{
              fontSize: 6.5,
              fontFamily: "monospace",
              padding: "1px 4px",
              borderRadius: 2,
              background: "rgba(255,150,120,0.10)",
              color: "rgba(255,150,120,0.65)",
              letterSpacing: "0.1em",
            }}>
              N/A
            </span>
          )}
        </div>
        <p style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.4 }}>
          {blurb}
        </p>
      </div>
      <span style={{
        fontSize:      6.5,
        fontFamily:    "monospace",
        padding:       "2px 5px",
        borderRadius:  2,
        background:    costColor + "15",
        color:         costColor,
        letterSpacing: "0.15em",
        flexShrink:    0,
      }}>
        {costLabel}
      </span>
    </button>
  );
}


/* ── Cloud sync card with inline SQL helper ─────────────────────────────────── */

function CloudSyncCard({
  dbStatus, projectId,
}: {
  dbStatus: DbStatus | null;
  projectId?: string;
  onRefresh: () => Promise<DbStatus | null>;
}) {
  const [showSql, setShowSql]   = useState(false);
  const [schemaSql, setSchemaSql] = useState<string | null>(null);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [copied,   setCopied]   = useState(false);

  // Lazy-load schema only when user opens the SQL helper
  useEffect(() => {
    if (!showSql || schemaSql !== null) return;
    fetch("/api/db-schema")
      .then(r => r.json())
      .then(j => {
        if (j.sql) setSchemaSql(j.sql);
        if (j.sqlEditorUrl) setEditorUrl(j.sqlEditorUrl);
      })
      .catch(() => {});
  }, [showSql, schemaSql]);

  const onCopy = useCallback(async () => {
    if (!schemaSql) return;
    try {
      await navigator.clipboard.writeText(schemaSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [schemaSql]);

  return (
    <div style={{
      padding:       "8px 10px",
      borderRadius:  6,
      background:    dbStatus?.ready ? "rgba(80,200,120,0.06)" : "rgba(255,255,255,0.03)",
      border:        `1px solid ${dbStatus?.ready ? "rgba(80,200,120,0.18)" : "rgba(255,255,255,0.06)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   dbStatus?.ready ? "#50c878"
                       : dbStatus?.table === "auth" ? "#ff6655"
                       : dbStatus?.configured ? "#fbbf24"
                       : "rgba(255,255,255,0.2)",
          animation:    dbStatus?.ready ? "pulse 2s ease-in-out infinite" : undefined,
        }} />
        <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.55)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          {dbStatus?.ready              ? `Cloud sync · ready · ${dbStatus.count ?? 0} rows`
           : dbStatus?.table === "auth" ? "Cloud sync · key rejected"
           : dbStatus?.table === "missing" ? "Cloud sync · table missing"
           : dbStatus?.configured       ? "Cloud sync · error"
           : "Cloud sync · offline"}
        </span>
      </div>

      {/* Hint */}
      {dbStatus && !dbStatus.ready && (
        <p style={{ fontSize: 7.5, color: "rgba(255,200,170,0.65)", marginTop: 4, lineHeight: 1.5 }}>
          {dbStatus.hint ?? dbStatus.error ?? "Supabase unreachable — using localStorage cache only."}
        </p>
      )}

      {/* Inline SQL helper for missing-table case */}
      {dbStatus?.table === "missing" && (
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => setShowSql(s => !s)}
            style={{
              fontSize: 7.5, fontFamily: "monospace",
              padding: "4px 8px", borderRadius: 3,
              border: "1px solid rgba(80,200,120,0.30)",
              background: "rgba(80,200,120,0.08)",
              color: "rgba(120,220,150,0.85)",
              letterSpacing: "0.15em", textTransform: "uppercase",
              cursor: "pointer", marginRight: 6,
            }}
          >
            {showSql ? "Hide SQL" : "▸ Setup SQL"}
          </button>
          {editorUrl && (
            <a href={editorUrl} target="_blank" rel="noopener noreferrer"
               style={{
                 fontSize: 7.5, fontFamily: "monospace",
                 padding: "4px 8px", borderRadius: 3,
                 border: "1px solid rgba(99,102,241,0.30)",
                 background: "rgba(99,102,241,0.08)",
                 color: "rgba(147,150,255,0.85)",
                 letterSpacing: "0.15em", textTransform: "uppercase",
                 textDecoration: "none", display: "inline-block",
               }}>
              Open SQL Editor ↗
            </a>
          )}
        </div>
      )}

      {showSql && schemaSql && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <span style={{ fontSize: 6.5, fontFamily: "monospace", color: "rgba(255,255,255,0.30)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Run once in Supabase → SQL Editor
            </span>
            <button
              onClick={onCopy}
              style={{
                fontSize: 7, fontFamily: "monospace",
                padding: "2px 6px", borderRadius: 3,
                border: "1px solid rgba(251,191,36,0.30)",
                background: "rgba(251,191,36,0.08)",
                color: copied ? "rgba(80,200,120,0.85)" : "rgba(251,191,36,0.85)",
                cursor: "pointer", letterSpacing: "0.1em",
              }}
            >
              {copied ? "✓ Copied" : "Copy SQL"}
            </button>
          </div>
          <pre style={{
            fontSize: 6.5, fontFamily: "monospace",
            padding: 6, borderRadius: 3,
            background: "rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(180,220,180,0.75)",
            maxHeight: 180, overflow: "auto",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
            lineHeight: 1.4,
          }}>
            {schemaSql}
          </pre>
        </div>
      )}

      {projectId && (
        <p style={{ fontSize: 6.5, color: "rgba(255,255,255,0.18)", marginTop: 3, fontFamily: "monospace" }}>
          project: {projectId.slice(0, 14)}…
        </p>
      )}
    </div>
  );
}
