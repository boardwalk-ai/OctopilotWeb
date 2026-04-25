"use client";

import Image from "next/image";
import type { ImageElement, Rect } from "@/types/slides";

interface Props {
  el: ImageElement;
  toPx: (rect: Rect) => { left: number; top: number; width: number; height: number };
  isSelected: boolean;
  onClick?: () => void;
}

export default function ImageEl({ el, toPx, isSelected, onClick }: Props) {
  const pos = toPx(el.position);
  const s = el.style;

  const objectFitMap: Record<string, string> = {
    cover: "cover",
    contain: "contain",
    fill: "fill",
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
        borderRadius: s.borderRadius ?? 0,
        opacity: s.opacity ?? 1,
        transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        outline: isSelected ? "2px solid #ef4444" : "none",
        outlineOffset: 2,
        boxSizing: "border-box",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={el.src}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: objectFitMap[s.objectFit] as React.CSSProperties["objectFit"],
          display: "block",
        }}
        draggable={false}
      />
    </div>
  );
}
