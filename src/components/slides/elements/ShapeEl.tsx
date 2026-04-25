"use client";

import type { ShapeElement, Rect } from "@/types/slides";

interface Props {
  el: ShapeElement;
  toPx: (rect: Rect) => { left: number; top: number; width: number; height: number };
  isSelected: boolean;
  onClick?: () => void;
}

function ShapeSVG({
  shape,
  fill,
  stroke,
  strokeWidth,
  cornerRadius,
}: {
  shape: ShapeElement["shape"];
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
}) {
  const sw = strokeWidth ?? 0;
  const half = sw / 2;

  const sharedProps = {
    fill: fill === "transparent" ? "none" : fill,
    stroke: stroke ?? "none",
    strokeWidth: sw,
  };

  switch (shape) {
    case "rectangle":
      return (
        <rect
          x={half} y={half}
          width={`calc(100% - ${sw}px)`} height={`calc(100% - ${sw}px)`}
          rx={cornerRadius ?? 0}
          {...sharedProps}
        />
      );

    case "circle":
      return (
        <ellipse
          cx="50%" cy="50%"
          rx={`calc(50% - ${half}px)`} ry={`calc(50% - ${half}px)`}
          {...sharedProps}
        />
      );

    case "oval":
      return (
        <ellipse
          cx="50%" cy="50%"
          rx={`calc(50% - ${half}px)`} ry={`calc(35% - ${half}px)`}
          {...sharedProps}
        />
      );

    case "triangle":
      return (
        <polygon
          points={`50,${half} ${100 - half},${100 - half} ${half},${100 - half}`}
          {...sharedProps}
          // Use relative-ish viewBox; actual coords handled by viewBox
        />
      );

    case "diamond":
      return (
        <polygon
          points="50,5 95,50 50,95 5,50"
          {...sharedProps}
        />
      );

    case "line":
      return (
        <line
          x1="0%" y1="50%"
          x2="100%" y2="50%"
          stroke={stroke ?? fill}
          strokeWidth={sw || 2}
        />
      );

    case "arrow":
      return (
        <polygon
          points="5,35 75,35 75,15 95,50 75,85 75,65 5,65"
          {...sharedProps}
        />
      );

    case "star":
      return (
        <polygon
          points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"
          {...sharedProps}
        />
      );

    case "hexagon":
      return (
        <polygon
          points="50,5 93,27.5 93,72.5 50,95 7,72.5 7,27.5"
          {...sharedProps}
        />
      );

    case "parallelogram":
      return (
        <polygon
          points="20,5 95,5 80,95 5,95"
          {...sharedProps}
        />
      );

    case "speechBubble":
      return (
        <path
          d="M10,10 Q10,5 15,5 L85,5 Q90,5 90,10 L90,65 Q90,70 85,70 L55,70 L45,85 L40,70 L15,70 Q10,70 10,65 Z"
          {...sharedProps}
        />
      );

    default:
      return <rect width="100%" height="100%" {...sharedProps} />;
  }
}

export default function ShapeEl({ el, toPx, isSelected, onClick }: Props) {
  const pos = toPx(el.position);
  const s = el.style;

  // viewBox depends on shape — use 100x100 normalized space for polygon/path shapes
  const needsViewBox = ["triangle","diamond","arrow","star","hexagon","parallelogram","speechBubble"].includes(el.shape);

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        opacity: s.opacity ?? 1,
        transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
        cursor: onClick ? "pointer" : "default",
        outline: isSelected ? "2px solid #ef4444" : "none",
        outlineOffset: 2,
        boxSizing: "border-box",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={needsViewBox ? "0 0 100 100" : undefined}
        preserveAspectRatio="none"
        overflow="visible"
      >
        <ShapeSVG
          shape={el.shape}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
          cornerRadius={s.cornerRadius}
        />
      </svg>
    </div>
  );
}
