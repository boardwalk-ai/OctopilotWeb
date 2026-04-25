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
  boxW,
  boxH,
}: {
  shape: ShapeElement["shape"];
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  /** Pixel width/height of the SVG viewport (no viewBox for rect/circle/oval/line). */
  boxW: number;
  boxH: number;
}) {
  const sw = strokeWidth ?? 0;
  const half = sw / 2;

  const sharedProps = {
    fill: fill === "transparent" ? "none" : fill,
    stroke: stroke ?? "none",
    strokeWidth: sw,
  };

  switch (shape) {
    case "rectangle": {
      const iw = Math.max(0, boxW - sw);
      const ih = Math.max(0, boxH - sw);
      const rx = Math.min(cornerRadius ?? 0, iw / 2, ih / 2);
      return (
        <rect
          x={half}
          y={half}
          width={iw}
          height={ih}
          rx={rx}
          {...sharedProps}
        />
      );
    }

    case "circle": {
      const r = Math.max(0, Math.min(boxW, boxH) / 2 - half);
      return (
        <ellipse
          cx={boxW / 2}
          cy={boxH / 2}
          rx={r}
          ry={r}
          {...sharedProps}
        />
      );
    }

    case "oval": {
      const rx = Math.max(0, boxW / 2 - half);
      const ry = Math.max(0, boxH * 0.35 - half);
      return (
        <ellipse
          cx={boxW / 2}
          cy={boxH / 2}
          rx={rx}
          ry={ry}
          {...sharedProps}
        />
      );
    }

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
          x1={0}
          y1={boxH / 2}
          x2={boxW}
          y2={boxH / 2}
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
      return <rect x={0} y={0} width={boxW} height={boxH} {...sharedProps} />;
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
          boxW={Math.max(1, pos.width)}
          boxH={Math.max(1, pos.height)}
        />
      </svg>
    </div>
  );
}
