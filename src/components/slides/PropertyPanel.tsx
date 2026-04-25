"use client";

import { useMemo } from "react";
import type {
  Rect,
  SlideElement,
  TextStyle,
  ShapeStyle,
  ImageStyle,
  IconStyle,
  AnimationSpec,
  AnimationTrigger,
  EntranceAnimationType,
  ExitAnimationType,
  EmphasisAnimationType,
} from "@/types/slides";

const FONT_CHOICES = [
  "Inter",
  "Source Sans Pro",
  "Playfair Display",
  "JetBrains Mono",
  "Cormorant",
  "Nunito",
  "Georgia",
  "Calibri",
] as const;

const ENTRANCE_TYPES: EntranceAnimationType[] = [
  "appear",
  "fade",
  "flyIn",
  "floatIn",
  "zoomIn",
  "wipe",
  "bounce",
  "swivel",
  "grow",
];
const EXIT_TYPES: ExitAnimationType[] = ["disappear", "fadeOut", "flyOut", "zoomOut", "collapse"];
const EMPHASIS_TYPES: EmphasisAnimationType[] = ["pulse", "spin", "teeter", "flash", "boldReveal", "wiggle"];

const TRIGGERS: AnimationTrigger[] = [
  "entrance",
  "exit",
  "emphasis",
  "onClick",
  "withPrev",
  "afterPrev",
];

const DIRECTIONS = ["fromBottom", "fromTop", "fromLeft", "fromRight"] as const;

type Props = {
  element: SlideElement;
  slideId: string;
  onClose: () => void;
  onStyleChange: (changes: Partial<TextStyle | ShapeStyle | ImageStyle | IconStyle>) => void;
  onPositionChange: (changes: Partial<Rect>) => void;
  onContentChange?: (content: string) => void;
  onAnimationChange?: (anim: AnimationSpec | undefined) => void;
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

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-9 min-w-[2.25rem] rounded-lg border px-2 text-[12px] font-semibold transition-colors",
        active
          ? "border-red-500/50 bg-red-500/20 text-white"
          : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function typesForTrigger(trigger: AnimationTrigger): readonly string[] {
  if (trigger === "entrance") return ENTRANCE_TYPES;
  if (trigger === "exit") return EXIT_TYPES;
  if (trigger === "emphasis") return EMPHASIS_TYPES;
  return ENTRANCE_TYPES;
}

export default function PropertyPanel({
  element,
  slideId,
  onClose,
  onStyleChange,
  onPositionChange,
  onContentChange,
  onAnimationChange,
}: Props) {
  const typeLabel = useMemo(() => {
    if (element.type === "text") return `Text · ${element.variant}`;
    if (element.type === "shape") return `Shape · ${element.shape}`;
    if (element.type === "image") return "Image";
    if (element.type === "icon") return `Icon · ${element.name}`;
    return "Element";
  }, [element]);

  const anim: AnimationSpec | undefined = element.animation;
  const defaultAnim = (): AnimationSpec => ({
    trigger: "entrance",
    type: "fade",
    duration: 500,
    delay: 0,
  });

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

        {/* ANIMATION */}
        {onAnimationChange && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold text-white/70">Animation</div>
            <Field label="Preset">
              <Select
                value={anim ? "on" : "off"}
                onChange={(e) => {
                  if (e.target.value === "off") onAnimationChange(undefined);
                  else onAnimationChange(anim ?? defaultAnim());
                }}
              >
                <option value="off">None</option>
                <option value="on">On</option>
              </Select>
            </Field>
            {anim && (
              <>
                <Field label="Trigger">
                  <Select
                    value={anim.trigger}
                    onChange={(e) => {
                      const trigger = e.target.value as AnimationTrigger;
                      const pool = typesForTrigger(trigger);
                      const nextType = pool.includes(anim.type as never) ? anim.type : pool[0];
                      onAnimationChange({ ...anim, trigger, type: nextType as AnimationSpec["type"] });
                    }}
                  >
                    {TRIGGERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Type">
                  <Select
                    value={anim.type}
                    onChange={(e) =>
                      onAnimationChange({
                        ...anim,
                        type: e.target.value as AnimationSpec["type"],
                      })
                    }
                  >
                    {typesForTrigger(anim.trigger).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                {(anim.type === "flyIn" || anim.type === "flyOut" || anim.type === "wipe") && (
                  <Field label="Direction">
                    <Select
                      value={anim.direction ?? "fromBottom"}
                      onChange={(e) =>
                        onAnimationChange({
                          ...anim,
                          direction: e.target.value as NonNullable<AnimationSpec["direction"]>,
                        })
                      }
                    >
                      {DIRECTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Duration (ms)">
                    <Input
                      type="number"
                      step="50"
                      value={String(anim.duration)}
                      onChange={(e) =>
                        onAnimationChange({
                          ...anim,
                          duration: clamp(parseNumber(e.target.value, anim.duration), 0, 60000),
                        })
                      }
                    />
                  </Field>
                  <Field label="Delay (ms)">
                    <Input
                      type="number"
                      step="50"
                      value={String(anim.delay)}
                      onChange={(e) =>
                        onAnimationChange({
                          ...anim,
                          delay: clamp(parseNumber(e.target.value, anim.delay), 0, 60000),
                        })
                      }
                    />
                  </Field>
                </div>
              </>
            )}
          </section>
        )}

        {/* TYPE-SPECIFIC */}
        {element.type === "text" && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold text-white/70">Text</div>

            {onContentChange && (
              <Field label="Content">
                <textarea
                  value={element.content}
                  onChange={(e) => onContentChange(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-white/80 outline-none focus:border-red-500/30 resize-y min-h-[88px]"
                />
              </Field>
            )}

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

            <div className="flex flex-wrap gap-1.5">
              <Toggle
                label="B"
                active={element.style.fontWeight >= 700}
                onClick={() =>
                  onStyleChange({
                    fontWeight: (element.style.fontWeight >= 700 ? 400 : 700) as TextStyle["fontWeight"],
                  } as Partial<TextStyle>)
                }
              />
              <Toggle label="I" active={!!element.style.italic} onClick={() => onStyleChange({ italic: !element.style.italic } as Partial<TextStyle>)} />
              <Toggle
                label="U"
                active={!!element.style.underline}
                onClick={() => onStyleChange({ underline: !element.style.underline } as Partial<TextStyle>)}
              />
              <Toggle
                label="S"
                active={!!element.style.strikethrough}
                onClick={() => onStyleChange({ strikethrough: !element.style.strikethrough } as Partial<TextStyle>)}
              />
            </div>

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

            <Field label="Letter spacing (em)">
              <Input
                type="number"
                step="0.01"
                value={String(element.style.letterSpacing ?? 0)}
                onChange={(e) =>
                  onStyleChange({
                    letterSpacing: clamp(parseNumber(e.target.value, element.style.letterSpacing ?? 0), -0.5, 1),
                  } as Partial<TextStyle>)
                }
              />
            </Field>
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
