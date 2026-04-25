"use client";

import SlideCanvas from "./SlideCanvas";
import type { SlideSpec, DeckTheme } from "@/types/slides";

interface SlideThumbnailProps {
  spec: SlideSpec;
  theme: DeckTheme;
  /** Thumbnail width in px. Default 160. Height auto-calculated (16:9). */
  width?: number;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function SlideThumbnail({
  spec,
  theme,
  width = 160,
  isActive = false,
  onClick,
  className,
}: SlideThumbnailProps) {
  const height = Math.round(width * (9 / 16));

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        position: "relative",
        width,
        height,
        flexShrink: 0,
        cursor: onClick ? "pointer" : "default",
        borderRadius: 4,
        overflow: "hidden",
        outline: isActive ? "2px solid #ef4444" : "2px solid transparent",
        outlineOffset: 2,
        transition: "outline-color 150ms",
        boxShadow: isActive
          ? "0 0 0 1px rgba(239,68,68,0.3)"
          : "0 1px 4px rgba(0,0,0,0.4)",
      }}
    >
      {/* Render the full slide then scale it down to thumbnail size */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 880,        // full slide reference width
          height: 495,       // full slide reference height (16:9)
          transformOrigin: "top left",
          transform: `scale(${width / 880})`,
          pointerEvents: "none",
        }}
      >
        <SlideCanvas
          spec={spec}
          theme={theme}
          width={880}
          mode="h"
        />
      </div>

      {/* Slide number badge */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          right: 6,
          fontSize: 9,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          fontFamily: "monospace",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {spec.position}
      </div>
    </div>
  );
}
