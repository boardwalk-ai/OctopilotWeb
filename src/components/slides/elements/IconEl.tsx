"use client";

import * as LucideIcons from "lucide-react";
import type { IconElement, Rect } from "@/types/slides";

interface Props {
  el: IconElement;
  toPx: (rect: Rect) => { left: number; top: number; width: number; height: number };
  isSelected: boolean;
  onClick?: () => void;
}

type LucideComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export default function IconEl({ el, toPx, isSelected, onClick }: Props) {
  const pos = toPx(el.position);
  const s = el.style;

  // Dynamically resolve the Lucide icon by name
  const Icon = (LucideIcons as Record<string, unknown>)[el.name] as LucideComponent | undefined;

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: s.opacity ?? 1,
        cursor: onClick ? "pointer" : "default",
        outline: isSelected ? "2px solid #ef4444" : "none",
        outlineOffset: 2,
        boxSizing: "border-box",
      }}
    >
      {Icon ? (
        <Icon size={Math.min(pos.width, pos.height) * 0.7} color={s.color} strokeWidth={1.5} />
      ) : (
        // Fallback: show a placeholder box if icon name is unknown
        <div
          style={{
            width: "60%",
            height: "60%",
            borderRadius: 4,
            border: `2px solid ${s.color}`,
            opacity: 0.5,
          }}
        />
      )}
    </div>
  );
}
