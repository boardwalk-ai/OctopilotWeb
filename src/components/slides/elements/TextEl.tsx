"use client";

import { useEffect, useRef } from "react";
import type { TextElement, Rect } from "@/types/slides";

interface Props {
  el: TextElement;
  toPx: (rect: Rect) => { left: number; top: number; width: number; height: number };
  /** slideWidth / 880 — scales fontSize proportionally to slide size */
  scale: number;
  isSelected: boolean;
  isEditing?: boolean;
  onClick?: () => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onEditCommit?: (text: string) => void;
  onEditCancel?: () => void;
}

export default function TextEl({
  el,
  toPx,
  scale,
  isSelected,
  isEditing,
  onClick,
  onDoubleClick,
  onEditCommit,
  onEditCancel,
}: Props) {
  const pos = toPx(el.position);
  const s = el.style;
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing || !editRef.current) return;
    const node = editRef.current;
    node.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [isEditing]);

  const alignMap: Record<string, string> = {
    left: "left",
    center: "center",
    right: "right",
    justify: "justify",
  };

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: pos.left,
    top: pos.top,
    width: pos.width,
    height: pos.height,
    fontFamily: `"${s.fontFamily}", sans-serif`,
    fontSize: `${s.fontSize * scale}px`,
    fontWeight: s.fontWeight,
    color: s.color,
    textAlign: alignMap[s.align] as React.CSSProperties["textAlign"],
    fontStyle: s.italic ? "italic" : "normal",
    textDecoration: [s.underline ? "underline" : "", s.strikethrough ? "line-through" : ""]
      .filter(Boolean)
      .join(" ") || "none",
    lineHeight: s.lineHeight ?? 1.3,
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}em` : undefined,
    opacity: s.opacity ?? 1,
    overflow: "hidden",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    boxSizing: "border-box",
  };

  if (isEditing) {
    return (
      <div
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onBlur={() => onEditCommit?.(editRef.current?.innerText ?? "")}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onEditCancel?.();
          }
        }}
        style={{
          ...baseStyle,
          cursor: "text",
          outline: "2px solid #ef4444",
          outlineOffset: 2,
        }}
      >
        {el.content}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        ...baseStyle,
        cursor: onClick ? "pointer" : "default",
        outline: isSelected ? "2px solid #ef4444" : "none",
        outlineOffset: 2,
      }}
    >
      {el.content}
    </div>
  );
}
