"use client";

import type { TextElement, Rect } from "@/types/slides";

interface Props {
  el: TextElement;
  toPx: (rect: Rect) => { left: number; top: number; width: number; height: number };
  /** slideWidth / 880 — scales fontSize proportionally to slide size */
  scale: number;
  isSelected: boolean;
  onClick?: () => void;
}

export default function TextEl({ el, toPx, scale, isSelected, onClick }: Props) {
  const pos = toPx(el.position);
  const s = el.style;

  const alignMap: Record<string, string> = {
    left: "left",
    center: "center",
    right: "right",
    justify: "justify",
  };

  return (
    <div
      onClick={onClick}
      style={{
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
        textDecoration: [
          s.underline ? "underline" : "",
          s.strikethrough ? "line-through" : "",
        ]
          .filter(Boolean)
          .join(" ") || "none",
        lineHeight: s.lineHeight ?? 1.3,
        letterSpacing: s.letterSpacing ? `${s.letterSpacing}em` : undefined,
        opacity: s.opacity ?? 1,
        overflow: "hidden",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        cursor: onClick ? "pointer" : "default",
        boxSizing: "border-box",
        outline: isSelected ? "2px solid #ef4444" : "none",
        outlineOffset: 2,
      }}
    >
      {el.content}
    </div>
  );
}
