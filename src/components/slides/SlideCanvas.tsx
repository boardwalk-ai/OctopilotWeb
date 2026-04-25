"use client";

import type { SlideSpec, DeckTheme, Rect, SlideElement } from "@/types/slides";
import TextEl from "./elements/TextEl";
import ShapeEl from "./elements/ShapeEl";
import ImageEl from "./elements/ImageEl";
import IconEl from "./elements/IconEl";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SLIDE_ASPECT = 9 / 16;

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function slideBackground(spec: SlideSpec): React.CSSProperties {
  const bg = spec.background;

  if (bg.type === "solid") {
    return { background: bg.color };
  }

  if (bg.type === "gradient") {
    return {
      background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`,
    };
  }

  if (bg.type === "image") {
    const overlay = bg.overlay
      ? `, linear-gradient(rgba(0,0,0,0), ${bg.overlay})`
      : "";
    return {
      backgroundImage: `url(${bg.src})${overlay}`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return { background: "#000" };
}

// ---------------------------------------------------------------------------
// Selection Handles
// ---------------------------------------------------------------------------

function SelectionHandles({ width, height }: { width: number; height: number }) {
  const d = 7; // handle dot size px
  const offset = -d / 2 - 2;

  const corners = [
    { top: offset, left: offset },
    { top: offset, left: width - d + Math.abs(offset) },
    { top: height - d + Math.abs(offset), left: offset },
    { top: height - d + Math.abs(offset), left: width - d + Math.abs(offset) },
  ];

  return (
    <>
      {/* Border ring */}
      <div
        style={{
          position: "absolute",
          inset: -2,
          border: "2px solid #ef4444",
          borderRadius: 2,
          pointerEvents: "none",
        }}
      />
      {/* Corner handles */}
      {corners.map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            width: d,
            height: d,
            borderRadius: 1,
            background: "#ef4444",
            border: "1.5px solid #fff",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Element Wrapper — adds selection handles
// ---------------------------------------------------------------------------

function ElementWrapper({
  el,
  toPx,
  scale,
  isSelected,
  onSelect,
  mode,
  editingTextElementId,
  onTextDoubleClick,
  onTextEditCommit,
  onTextEditCancel,
}: {
  el: SlideElement;
  toPx: (rect: Rect) => { left: number; top: number; width: number; height: number };
  scale: number;
  isSelected: boolean;
  onSelect?: (id: string) => void;
  mode: "h" | "v";
  editingTextElementId?: string | null;
  onTextDoubleClick?: (elementId: string) => void;
  onTextEditCommit?: (elementId: string, content: string) => void;
  onTextEditCancel?: () => void;
}) {
  const pos = toPx(el.position);
  const clickable = mode === "v";

  const handleClick = clickable
    ? () => { onSelect?.(el.id); }
    : undefined;

  const textEl = el.type === "text" ? (el as Parameters<typeof TextEl>[0]["el"]) : null;
  const isTextEditing = el.type === "text" && editingTextElementId === el.id;

  const renderers = {
    text: () =>
      textEl ? (
        <TextEl
          el={textEl}
          toPx={toPx}
          scale={scale}
          isSelected={false}
          isEditing={isTextEditing}
          onClick={handleClick}
          onDoubleClick={
            clickable
              ? (e) => {
                  e.stopPropagation();
                  onTextDoubleClick?.(el.id);
                }
              : undefined
          }
          onEditCommit={(content) => onTextEditCommit?.(el.id, content)}
          onEditCancel={onTextEditCancel}
        />
      ) : null,
    shape: () => (
      <ShapeEl el={el as Parameters<typeof ShapeEl>[0]["el"]} toPx={toPx} isSelected={false} onClick={handleClick} />
    ),
    image: () => (
      <ImageEl el={el as Parameters<typeof ImageEl>[0]["el"]} toPx={toPx} isSelected={false} onClick={handleClick} />
    ),
    icon: () => (
      <IconEl el={el as Parameters<typeof IconEl>[0]["el"]} toPx={toPx} isSelected={false} onClick={handleClick} />
    ),
  };

  const render = renderers[el.type];
  if (!render) return null;

  return (
    <div style={{ position: "absolute", left: pos.left, top: pos.top, width: pos.width, height: pos.height, boxSizing: "border-box" }}>
      {render()}
      {isSelected && <SelectionHandles width={pos.width} height={pos.height} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlideCanvas — main export
// ---------------------------------------------------------------------------

export interface SlideCanvasProps {
  spec: SlideSpec;
  theme: DeckTheme;
  /** Rendered pixel width. Height is auto-calculated (16:9). */
  width: number;
  /** Canvas interaction mode. H = navigate, V = select/edit. Default: "h" */
  mode?: "h" | "v";
  selectedElementId?: string | null;
  onElementSelect?: (id: string) => void;
  /** Called when clicking the slide background (deselects in V mode). */
  onBackgroundClick?: () => void;
  editingTextElementId?: string | null;
  onTextDoubleClick?: (elementId: string) => void;
  onTextEditCommit?: (elementId: string, content: string) => void;
  onTextEditCancel?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function SlideCanvas({
  spec,
  theme: _theme,
  width,
  mode = "h",
  selectedElementId,
  onElementSelect,
  onBackgroundClick,
  editingTextElementId,
  onTextDoubleClick,
  onTextEditCommit,
  onTextEditCancel,
  className,
  style,
}: SlideCanvasProps) {
  const height = Math.round(width * SLIDE_ASPECT);
  /** Font sizes in SlideSpec are authored at 880px reference width */
  const scale = width / 880;

  /** Convert % Rect → absolute px positions within this slide */
  const toPx = (rect: Rect) => ({
    left: (rect.x / 100) * width,
    top: (rect.y / 100) * height,
    width: (rect.w / 100) * width,
    height: (rect.h / 100) * height,
  });

  const handleBgClick = () => {
    if (mode !== "v") return;
    if (editingTextElementId) {
      onTextEditCancel?.();
      return;
    }
    onBackgroundClick?.();
  };

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        flexShrink: 0,
        ...slideBackground(spec),
        ...style,
      }}
      onClick={handleBgClick}
      data-slide-canvas="true"
    >
      {spec.elements.map((el) => (
        <ElementWrapper
          key={el.id}
          el={el}
          toPx={toPx}
          scale={scale}
          isSelected={selectedElementId === el.id}
          onSelect={onElementSelect}
          mode={mode}
          editingTextElementId={editingTextElementId}
          onTextDoubleClick={onTextDoubleClick}
          onTextEditCommit={onTextEditCommit}
          onTextEditCancel={onTextEditCancel}
        />
      ))}
    </div>
  );
}
