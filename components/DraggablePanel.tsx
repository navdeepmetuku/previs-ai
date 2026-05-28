"use client";

/**
 * DraggablePanel — Chrome / Figma / Blender-style free-form draggable wrapper.
 *
 * Phase 16 v2 — built on useFreeDrag for true 60fps free movement, inertia,
 * and z-index focus.
 *
 * Usage:
 *   <DraggablePanel
 *     panelId="vish-director"
 *     title="VISH Director"
 *     defaultPosition={{ x: 24, y: 80, anchor: "top-right" }}
 *     width={300}
 *     height={500}
 *     portal
 *   >
 *     <YourPanelContent />
 *   </DraggablePanel>
 */

import { useEffect, useState, type ReactNode, type CSSProperties, useCallback } from "react";
import { createPortal } from "react-dom";
import { useFreeDrag, onPanelsReset, resetAllPanelPositions } from "@/hooks/useFreeDrag";

type Anchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface Props {
  panelId:         string;
  title?:          string;
  defaultPosition: { x: number; y: number; anchor?: Anchor; minimized?: boolean };
  width?:          number;
  height?:         number | "auto";
  portal?:         boolean;
  noChrome?:       boolean;
  minimizable?:    boolean;
  className?:      string;
  style?:          CSSProperties;
  onClose?:        () => void;
  children:        ReactNode;
}

export default function DraggablePanel({
  panelId,
  title,
  defaultPosition,
  width = 300,
  height = "auto",
  portal = false,
  noChrome = false,
  minimizable = true,
  className = "",
  style = {},
  onClose,
  children,
}: Props) {
  const drag = useFreeDrag({
    panelId,
    defaultX: defaultPosition.x,
    defaultY: defaultPosition.y,
    anchor:   defaultPosition.anchor,
    width,
    height: typeof height === "number" ? height : 100,
    safetyPx: 32,
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Reset Layout listener — fires when ResetLayoutButton clicked anywhere
  useEffect(() => onPanelsReset(drag.reset), [drag.reset]);

  const onDoubleClick = useCallback(() => {
    if (minimizable) drag.toggleMinimized();
  }, [minimizable, drag]);

  if (portal && !mounted) return null;

  const panelEl = (
    <div
      ref={drag.panelRef}
      className={`dpanel ${className}`}
      data-dragging={drag.isDragging || undefined}
      data-minimized={drag.minimized || undefined}
      onClick={drag.focus}
      style={{
        position: "fixed",
        left:     drag.initialX,
        top:      drag.initialY,
        width,
        height:   drag.minimized ? 28 : height,
        zIndex:   drag.zIndex,
        ...style,
      }}
    >
      {!noChrome && (
        <div
          {...drag.handleProps}
          onDoubleClick={onDoubleClick}
          className="dpanel-handle"
          title={minimizable ? "Drag to move · Double-click to minimize" : "Drag to move"}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "5px 10px",
            background:     "rgba(20, 20, 30, 0.92)",
            borderBottom:   drag.minimized ? "none" : "1px solid rgba(255,255,255,0.06)",
            borderTopLeftRadius:  6,
            borderTopRightRadius: 6,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            ...drag.handleProps.style,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{
              color: "rgba(255,255,255,0.25)", fontSize: 10, letterSpacing: "1px",
              fontFamily: "monospace", flexShrink: 0,
            }}>
              ⋮⋮
            </span>
            {title && (
              <span style={{
                fontSize:    8,
                color:       "rgba(251,191,36,0.65)",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontFamily:    "monospace",
                whiteSpace:    "nowrap",
                overflow:      "hidden",
                textOverflow:  "ellipsis",
              }}>
                {title}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} data-no-drag>
            {minimizable && (
              <button
                onClick={(e) => { e.stopPropagation(); drag.toggleMinimized(); }}
                title={drag.minimized ? "Restore" : "Minimize"}
                style={{
                  width: 16, height: 16, borderRadius: 3, border: "none",
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)",
                  fontSize: 10, cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", lineHeight: 1,
                }}
              >
                {drag.minimized ? "▢" : "—"}
              </button>
            )}
            {onClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                title="Close"
                style={{
                  width: 16, height: 16, borderRadius: 3, border: "none",
                  background: "rgba(255,80,80,0.08)", color: "rgba(255,150,140,0.65)",
                  fontSize: 10, cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{
        display:  drag.minimized ? "none" : "block",
        height:   drag.minimized ? 0 : (typeof height === "number" ? height - (noChrome ? 0 : 28) : "auto"),
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );

  if (portal) return createPortal(panelEl, document.body);
  return panelEl;
}

/**
 * ResetLayoutButton — drop into any toolbar to reset all draggable panels.
 */
export function ResetLayoutButton({ className = "", style = {} }: { className?: string; style?: CSSProperties }) {
  const onClick = useCallback(() => {
    resetAllPanelPositions();
  }, []);

  return (
    <button
      onClick={onClick}
      className={`dpanel-reset-btn ${className}`}
      title="Reset all panel positions to default"
      style={{
        padding:       "4px 10px",
        borderRadius:  4,
        border:        "1px solid rgba(255,255,255,0.10)",
        background:    "rgba(255,255,255,0.03)",
        color:         "rgba(255,255,255,0.45)",
        fontSize:      9,
        fontFamily:    "monospace",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        cursor:        "pointer",
        ...style,
      }}
    >
      ⟲ Reset Layout
    </button>
  );
}
