"use client";

/**
 * CloudSyncIndicator — always-visible Supabase sync status pill.
 *
 * Shows a red/green dot in the toolbar. Clicking it opens a modal with
 * the schema SQL and a Copy button so you can paste it into Supabase.
 *
 * Fetches /api/db-status on mount — no interaction required to see status.
 */

import { useState, useEffect, useCallback } from "react";

interface DbStatus {
  configured: boolean;
  ready:      boolean;
  table:      string;
  count?:     number;
  error?:     string;
  hint?:      string;
}

export default function CloudSyncIndicator({ projectId }: { projectId?: string }) {
  const [status,    setStatus]    = useState<DbStatus | null>(null);
  const [open,      setOpen]      = useState(false);
  const [sql,       setSql]       = useState<string | null>(null);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);

  // Fetch status immediately on mount
  useEffect(() => {
    let active = true;
    fetch("/api/db-status")
      .then(r => r.json())
      .then(d => { if (active) setStatus(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Fetch schema SQL when modal opens
  useEffect(() => {
    if (!open || sql !== null) return;
    fetch("/api/db-schema")
      .then(r => r.json())
      .then(j => {
        if (j.sql)          setSql(j.sql);
        if (j.sqlEditorUrl) setEditorUrl(j.sqlEditorUrl);
      })
      .catch(() => {});
  }, [open, sql]);

  const handleCopy = useCallback(async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }, [sql]);

  // Dot colour
  const dotColor =
    status?.ready              ? "#50c878"              // green — connected
    : status?.table === "auth" ? "#ff6655"              // red — bad key
    : status?.configured       ? "#fbbf24"              // amber — configured but table missing / error
    : "rgba(255,255,255,0.25)";                         // grey — not configured

  const label =
    status === null            ? "Cloud sync…"
    : status.ready             ? `Cloud sync · ${status.count ?? 0} rows`
    : status.table === "auth"  ? "Cloud sync · key error"
    : status.table === "missing" ? "Cloud sync · setup needed"
    : status.configured        ? "Cloud sync · error"
    : "Cloud sync · offline";

  return (
    <>
      {/* ── Pill button ── */}
      <button
        onClick={() => setOpen(true)}
        title={status?.hint ?? status?.error ?? label}
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           5,
          padding:       "4px 9px",
          borderRadius:  16,
          border:        `1px solid ${status?.ready ? "rgba(80,200,120,0.25)" : "rgba(255,255,255,0.10)"}`,
          background:    status?.ready ? "rgba(80,200,120,0.07)" : "rgba(255,255,255,0.04)",
          color:         "rgba(255,255,255,0.45)",
          fontSize:      8,
          fontFamily:    "monospace",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor:        "pointer",
          whiteSpace:    "nowrap",
        }}
      >
        {/* Status dot */}
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   dotColor,
          flexShrink:   0,
          boxShadow:    status?.ready ? `0 0 6px ${dotColor}` : "none",
        }} />
        {label}
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position:   "fixed",
            inset:      0,
            zIndex:     9000,
            background: "rgba(0,0,0,0.75)",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            padding:    16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width:        "100%",
              maxWidth:     560,
              maxHeight:    "90vh",
              overflowY:    "auto",
              background:   "rgba(8,8,18,0.98)",
              border:       "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              boxShadow:    "0 24px 64px rgba(0,0,0,0.7)",
              padding:      20,
              display:      "flex",
              flexDirection: "column",
              gap:          14,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(251,191,36,0.45)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 4 }}>
                  Supabase · Cloud Sync
                </p>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", margin: 0 }}>
                  Database Setup
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Status row */}
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              padding:      "8px 12px",
              borderRadius: 6,
              background:   status?.ready ? "rgba(80,200,120,0.07)" : "rgba(255,100,80,0.07)",
              border:       `1px solid ${status?.ready ? "rgba(80,200,120,0.20)" : "rgba(255,100,80,0.20)"}`,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: dotColor, flexShrink: 0,
                boxShadow: status?.ready ? `0 0 8px ${dotColor}` : "none",
              }} />
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.65)", letterSpacing: "0.1em" }}>
                {label}
              </span>
              {status?.ready && (
                <span style={{ marginLeft: "auto", fontSize: 8, fontFamily: "monospace", color: "rgba(80,200,120,0.6)" }}>
                  ✓ Images sync across devices
                </span>
              )}
            </div>

            {/* Error / hint */}
            {status && !status.ready && (status.hint ?? status.error) && (
              <p style={{ fontSize: 9, color: "rgba(255,200,170,0.70)", lineHeight: 1.6, margin: 0 }}>
                {status.hint ?? status.error}
              </p>
            )}

            {/* Instructions */}
            {!status?.ready && (
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
                <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>
                  To enable cloud sync:
                </p>
                <ol style={{ margin: 0, paddingLeft: 16 }}>
                  <li>Copy the SQL below</li>
                  <li>
                    {editorUrl
                      ? <><a href={editorUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(147,150,255,0.85)", textDecoration: "underline" }}>Open Supabase SQL Editor ↗</a> (opens in new tab)</>
                      : "Open your Supabase project → SQL Editor"
                    }
                  </li>
                  <li>Paste and click <strong style={{ color: "rgba(255,255,255,0.7)" }}>Run</strong></li>
                  <li>Refresh this page — the dot turns green</li>
                </ol>
              </div>
            )}

            {/* SQL block */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.30)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                  schema.sql — run once in Supabase
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {editorUrl && (
                    <a
                      href={editorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 8, fontFamily: "monospace",
                        padding: "4px 10px", borderRadius: 4,
                        border: "1px solid rgba(99,102,241,0.35)",
                        background: "rgba(99,102,241,0.10)",
                        color: "rgba(147,150,255,0.85)",
                        letterSpacing: "0.12em", textTransform: "uppercase",
                        textDecoration: "none",
                      }}
                    >
                      Open SQL Editor ↗
                    </a>
                  )}
                  <button
                    onClick={handleCopy}
                    disabled={!sql}
                    style={{
                      fontSize: 8, fontFamily: "monospace",
                      padding: "4px 10px", borderRadius: 4,
                      border: `1px solid ${copied ? "rgba(80,200,120,0.40)" : "rgba(251,191,36,0.35)"}`,
                      background: copied ? "rgba(80,200,120,0.10)" : "rgba(251,191,36,0.10)",
                      color: copied ? "rgba(80,200,120,0.90)" : "rgba(251,191,36,0.90)",
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      cursor: sql ? "pointer" : "default",
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy SQL"}
                  </button>
                </div>
              </div>

              {sql ? (
                <pre style={{
                  fontSize: 7.5, fontFamily: "monospace",
                  padding: "10px 12px", borderRadius: 5,
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(180,220,180,0.80)",
                  maxHeight: 280, overflowY: "auto",
                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                  lineHeight: 1.5, margin: 0,
                }}>
                  {sql}
                </pre>
              ) : (
                <div style={{
                  padding: "20px 12px", borderRadius: 5,
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  textAlign: "center",
                  fontSize: 8, fontFamily: "monospace",
                  color: "rgba(255,255,255,0.25)",
                }}>
                  Loading schema…
                </div>
              )}
            </div>

            {/* Project ID debug */}
            {projectId && (
              <p style={{ fontSize: 6.5, color: "rgba(255,255,255,0.15)", fontFamily: "monospace", margin: 0 }}>
                project: {projectId.slice(0, 14)}…
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
