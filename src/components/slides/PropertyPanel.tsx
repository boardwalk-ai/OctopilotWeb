"use client";

import { useMemo } from "react";
import type { Rect, SlideElement, TextStyle, ShapeStyle, ImageStyle, IconStyle } from "@/types/slides";

const FONT_CHOICES = ["Inter", "Source Sans Pro", "Playfair Display", "JetBrains Mono", "Cormorant", "Nunito"] as const;

type Props = {
  element: SlideElement;
  slideId: string;
  onClose: () => void;
  onStyleChange: (changes: Partial<TextStyle | ShapeStyle | ImageStyle | IconStyle>) => void;
  onPositionChange: (changes: Partial<Rect>) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseNumber(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12.5px] text-white/80 outline-none",
        "focus:border-red-500/30 focus:bg-white/[0.05]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12.5px] text-white/80 outline-none",
        "focus:border-red-500/30 focus:bg-white/[0.05]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default function PropertyPanel({
  element,
  slideId,
  onClose,
  onStyleChange,
  onPositionChange,
}: Props) {
  const typeLabel = useMemo(() => {
    if (element.type === "text") return `Text · ${element.variant}`;
    if (element.type === "shape") return `Shape · ${element.shape}`;
    if (element.type === "image") return "Image";
    if (element.type === "icon") return `Icon · ${element.name}`;
    return "Element";
  }, [element]);

  return (
    <aside className="w-[280px] shrink-0 border-l border-white/[0.06] bg-[#0f0f0f]">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-white truncate">{element.id}</div>
          <div className="text-[11px] text-white/30 truncate">
            {typeLabel} · {slideId}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Close properties"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[calc(100vh-64px-56px)] overflow-y-auto px-4 py-4 space-y-6">
        {/* POSITION */}
        <section className="space-y-3">
          <div className="text-[11px] font-semibold text-white/70">Position</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="X (%)">
              <Input
                type="number"
                step="0.1"
                value={String(element.position.x)}
                onChange={(e) => onPositionChange({ x: clamp(parseNumber(e.target.value, element.position.x), 0, 100) })}
              />
            </Field>
            <Field label="Y (%)">
              <Input
                type="number"
                step="0.1"
                value={String(element.position.y)}
                onChange={(e) => onPositionChange({ y: clamp(parseNumber(e.target.value, element.position.y), 0, 100) })}
              />
            </Field>
            <Field label="W (%)">
              <Input
                type="number"
                step="0.1"
                value={String(element.position.w)}
                onChange={(e) => onPositionChange({ w: clamp(parseNumber(e.target.value, element.position.w), 0.1, 100) })}
              />
            </Field>
            <Field label="H (%)">
              <Input
                type="number"
                step="0.1"
                value={String(element.position.h)}
                onChange={(e) => onPositionChange({ h: clamp(parseNumber(e.target.value, element.position.h), 0.1, 100) })}
              />
            </Field>
          </div>
        </section>

        {/* TYPE-SPECIFIC */}
        {element.type === "text" && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold text-white/70">Text</div>

            <Field label="Font">
              <Select
                value={element.style.fontFamily}
                onChange={(e) => onStyleChange({ fontFamily: e.target.value } as Partial<TextStyle>)}
              >
                {FONT_CHOICES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Size (pt)">
                <Input
                  type="number"
                  step="1"
                  value={String(element.style.fontSize)}
                  onChange={(e) =>
                    onStyleChange({ fontSize: clamp(parseNumber(e.target.value, element.style.fontSize), 6, 220) } as Partial<TextStyle>)
                  }
                />
              </Field>
              <Field label="Weight">
                <Select
                  value={String(element.style.fontWeight)}
                  onChange={(e) => onStyleChange({ fontWeight: parseNumber(e.target.value, element.style.fontWeight) } as Partial<TextStyle>)}
                >
                  {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={element.style.color}
                    onChange={(e) => onStyleChange({ color: e.target.value } as Partial<TextStyle>)}
                    className="h-9 w-10 rounded-lg border border-white/10 bg-transparent"
                  />
                  <Input
                    value={element.style.color}
                    onChange={(e) => onStyleChange({ color: e.target.value } as Partial<TextStyle>)}
                  />
                </div>
              </Field>
              <Field label="Align">
                <Select
                  value={element.style.align}
                  onChange={(e) => onStyleChange({ align: e.target.value } as Partial<TextStyle>)}
                >
                  {["left", "center", "right", "justify"].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Opacity (0–1)">
                <Input
                  type="number"
                  step="0.05"
                  value={String(element.style.opacity ?? 1)}
                  onChange={(e) =>
                    onStyleChange({ opacity: clamp(parseNumber(e.target.value, element.style.opacity ?? 1), 0, 1) } as Partial<TextStyle>)
                  }
                />
              </Field>
              <Field label="Line height">
                <Input
                  type="number"
                  step="0.05"
                  value={String(element.style.lineHeight ?? 1.3)}
                  onChange={(e) =>
                    onStyleChange({ lineHeight: clamp(parseNumber(e.target.value, element.style.lineHeight ?? 1.3), 0.8, 3) } as Partial<TextStyle>)
                  }
                />
              </Field>
            </div>
          </section>
        )}

        {element.type === "shape" && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold text-white/70">Shape</div>

            <Field label="Fill">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.style.fill === "transparent" ? "#000000" : element.style.fill}
                  onChange={(e) => onStyleChange({ fill: e.target.value } as Partial<ShapeStyle>)}
                  className="h-9 w-10 rounded-lg border border-white/10 bg-transparent"
                />
                <Input
                  value={element.style.fill}
                  onChange={(e) => onStyleChange({ fill: e.target.value } as Partial<ShapeStyle>)}
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Stroke">
                <Input
                  value={element.style.stroke ?? ""}
                  placeholder="#ffffff"
                  onChange={(e) => onStyleChange({ stroke: e.target.value || undefined } as Partial<ShapeStyle>)}
                />
              </Field>
              <Field label="Stroke width">
                <Input
                  type="number"
                  step="0.5"
                  value={String(element.style.strokeWidth ?? 0)}
                  onChange={(e) => onStyleChange({ strokeWidth: clamp(parseNumber(e.target.value, element.style.strokeWidth ?? 0), 0, 30) } as Partial<ShapeStyle>)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Opacity (0–1)">
                <Input
                  type="number"
                  step="0.05"
                  value={String(element.style.opacity ?? 1)}
                  onChange={(e) => onStyleChange({ opacity: clamp(parseNumber(e.target.value, element.style.opacity ?? 1), 0, 1) } as Partial<ShapeStyle>)}
                />
              </Field>
              <Field label="Rotation (deg)">
                <Input
                  type="number"
                  step="1"
                  value={String(element.style.rotation ?? 0)}
                  onChange={(e) => onStyleChange({ rotation: parseNumber(e.target.value, element.style.rotation ?? 0) } as Partial<ShapeStyle>)}
                />
              </Field>
            </div>

            <Field label="Corner radius">
              <Input
                type="number"
                step="1"
                value={String(element.style.cornerRadius ?? 0)}
                onChange={(e) => onStyleChange({ cornerRadius: clamp(parseNumber(e.target.value, element.style.cornerRadius ?? 0), 0, 60) } as Partial<ShapeStyle>)}
              />
            </Field>
          </section>
        )}

        {element.type === "image" && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold text-white/70">Image</div>

            <Field label="Object fit">
              <Select
                value={element.style.objectFit}
                onChange={(e) => onStyleChange({ objectFit: e.target.value } as Partial<ImageStyle>)}
              >
                {["cover", "contain", "fill"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Opacity (0–1)">
                <Input
                  type="number"
                  step="0.05"
                  value={String(element.style.opacity ?? 1)}
                  onChange={(e) => onStyleChange({ opacity: clamp(parseNumber(e.target.value, element.style.opacity ?? 1), 0, 1) } as Partial<ImageStyle>)}
                />
              </Field>
              <Field label="Radius (px)">
                <Input
                  type="number"
                  step="1"
                  value={String(element.style.borderRadius ?? 0)}
                  onChange={(e) => onStyleChange({ borderRadius: clamp(parseNumber(e.target.value, element.style.borderRadius ?? 0), 0, 80) } as Partial<ImageStyle>)}
                />
              </Field>
            </div>

            <Field label="Rotation (deg)">
              <Input
                type="number"
                step="1"
                value={String(element.style.rotation ?? 0)}
                onChange={(e) => onStyleChange({ rotation: parseNumber(e.target.value, element.style.rotation ?? 0) } as Partial<ImageStyle>)}
              />
            </Field>
          </section>
        )}

        {element.type === "icon" && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold text-white/70">Icon</div>

            <Field label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.style.color}
                  onChange={(e) => onStyleChange({ color: e.target.value } as Partial<IconStyle>)}
                  className="h-9 w-10 rounded-lg border border-white/10 bg-transparent"
                />
                <Input
                  value={element.style.color}
                  onChange={(e) => onStyleChange({ color: e.target.value } as Partial<IconStyle>)}
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Opacity (0–1)">
                <Input
                  type="number"
                  step="0.05"
                  value={String(element.style.opacity ?? 1)}
                  onChange={(e) => onStyleChange({ opacity: clamp(parseNumber(e.target.value, element.style.opacity ?? 1), 0, 1) } as Partial<IconStyle>)}
                />
              </Field>
              <Field label="Size (pt)">
                <Input
                  type="number"
                  step="1"
                  value={String(element.style.size)}
                  onChange={(e) => onStyleChange({ size: clamp(parseNumber(e.target.value, element.style.size), 6, 220) } as Partial<IconStyle>)}
                />
              </Field>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

