"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { STAGE_H, STAGE_W } from "./SlideCanvas";
import { openDeck, type EngineInstance } from "./engine";

/**
 * The full slide editor: slide rail on the left, the page in the middle, a
 * properties panel on the right, and the designer one message away at the
 * bottom. Changes show at once and are saved in batches: edits made within a
 * short pause go to the server together and cost one rebuild. The page is
 * drawn by the presentation engine from the deck itself, so it updates as soon
 * as the rebuilt deck exists, without waiting for the LibreOffice preview.
 */

export type EditorAnimation = { effect: string; trigger?: string; durationMs?: number; delayMs?: number };
export type EditorFormat = { bold?: boolean; italic?: boolean; underline?: boolean; align?: string; color?: string; size?: number; font?: string };
export type EditorElement = { id: string; name: string; kind: string; text?: string; x: number; y: number; w: number; h: number; rot?: number; animations?: EditorAnimation[]; format?: EditorFormat };
export type EditorLayout = { slides: Array<{ slide: number; elements: EditorElement[]; transition?: string }> };

type Props = {
  version: number;
  images: Record<number, string>;
  slides: number[];
  layout: EditorLayout | null;
  active: number;
  setActive: (slide: number) => void;
  selected: EditorElement | null;
  onSelect: (element: EditorElement | null) => void;
  /** saves a batch of edits ({ slide, name, ... } / { slide, transition } / { slide, add }) */
  onEdits: (edits: Array<Record<string, unknown>>) => Promise<void>;
  /** the latest deck, drawn by the engine */
  deck: { version: number; pptx: ArrayBuffer } | null;
  onAsk: (text: string, target?: { slide: number; name: string }) => Promise<void>;
  question: string | null;
  onAnswer: (text: string) => Promise<void>;
  onClose: () => void;
  onDownload: () => void;
  onPresent: () => void;
  /** the designer is working on the deck */
  busy: boolean;
  /** an edit is being applied */
  saving: boolean;
  notice: string | null;
  onDismissNotice?: () => void;
};

type Box = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const FONTS = ["Aptos", "Arial", "Calibri", "Georgia", "Montserrat", "Times New Roman"];
const SWATCHES = ["FFFFFF", "D9D9D9", "595959", "000000", "EF4444", "F59E0B", "10B981", "3B82F6", "8B5CF6", "EC4899"];
const ENTRANCES: Array<[string, string]> = [["appear", "Appear"], ["fade", "Fade"], ["rise", "Rise"], ["fly", "Fly in"], ["wipe", "Wipe"], ["zoom", "Zoom"]];
const EMPHASIS: Array<[string, string]> = [["pulse", "Pulse"], ["spin", "Spin"], ["grow", "Grow"], ["transparency", "Fade a bit"]];
const EXITS: Array<[string, string]> = [["disappear", "Disappear"], ["fadeOut", "Fade out"], ["flyOut", "Fly out"], ["wipeOut", "Wipe out"], ["zoomOut", "Zoom out"]];
const STARTS: Array<[string, string]> = [["onClick", "On click"], ["withPrevious", "With previous"], ["afterPrevious", "After previous"]];
const TRANSITIONS: Array<[string, string, string]> = [
  ["none", "None", "Cut straight to the slide"],
  ["fade", "Fade", "Cross-fades from the last slide"],
  ["push", "Push", "Slides in and pushes the last one out"],
  ["wipe", "Wipe", "Reveals the slide with a moving edge"],
  ["dissolve", "Dissolve", "Breaks up the last slide into the new one"],
  ["zoom", "Zoom", "Zooms in from the centre"],
  ["morph", "Morph", "Moves objects with the same name between slides"],
];
const label = (list: Array<[string, string, ...string[]]>, value: string) => list.find(([v]) => v === value)?.[1] ?? value;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ─────────────────────────── icons ─────────────────────────── */

const PATHS: Record<string, string> = {
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  text: "M5 4v3h5.5v12h3V7H19V4z",
  shape: "M4 4h16v16H4V4zm2 2v12h12V6H6z",
  bold: "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z",
  italic: "M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z",
  underline: "M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z",
  left: "M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z",
  center: "M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z",
  right: "M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z",
  justify: "M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z",
  minus: "M19 13H5v-2h14v2z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  send: "M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  download: "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z",
  play: "M8 5v14l11-7z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  chevron: "M7 10l5 5 5-5z",
};

function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ─────────────────────────── small controls ─────────────────────────── */

function ToggleIcon({ icon, label: text, on, disabled, onClick }: { icon: keyof typeof PATHS; label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={text} title={text} aria-pressed={on} disabled={disabled} onClick={onClick} className={`state icon-btn ed-tool ${on ? "selected" : ""}`}>
      <Icon name={icon} />
    </button>
  );
}

function Dropdown({ value, onChange, children, labelText, disabled, className = "" }: { value: string; onChange: (v: string) => void; children: ReactNode; labelText: string; disabled?: boolean; className?: string }) {
  return (
    <span className={`ed-select ${className}`}>
      <select aria-label={labelText} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <Icon name="chevron" size={18} />
    </span>
  );
}

/** a number field that commits on Enter or blur, not on every keystroke */
function NumberField({ labelText, value, suffix, min, max, step = 1, disabled, onCommit }: { labelText: string; value: number; suffix?: string; min: number; max: number; step?: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onCommit(clamp(n, min, max));
  };
  return (
    <label className="ed-field">
      <span className="t-label-s on-variant">{labelText}</span>
      <span className="ed-field-box">
        <input
          inputMode="decimal"
          value={shown}
          disabled={disabled}
          onFocus={() => {
            setText(String(value));
            setFocused(true);
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            commit();
            setFocused(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const n = clamp((Number(text) || 0) + (e.key === "ArrowUp" ? step : -step), min, max);
              setText(String(Math.round(n * 10) / 10));
            }
          }}
        />
        {suffix && <span className="on-variant">{suffix}</span>}
      </span>
    </label>
  );
}

function Swatches({ value, onPick, disabled, labelText }: { value: string | null; onPick: (hex: string) => void; disabled?: boolean; labelText: string }) {
  return (
    <div role="group" aria-label={labelText} className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          disabled={disabled}
          aria-label={`#${hex}`}
          aria-pressed={value?.toUpperCase() === hex}
          onClick={() => onPick(hex)}
          className="ed-swatch"
          style={{ background: `#${hex}` }}
        />
      ))}
      <label className="ed-swatch ed-swatch-custom" title="Custom colour">
        <span className="sr-only">Custom colour</span>
        <input type="color" disabled={disabled} value={`#${value ?? "4472C4"}`} onChange={(e) => onPick(e.target.value.slice(1).toUpperCase())} />
      </label>
    </div>
  );
}

function ChipSet({ options, value, onPick, disabled, labelText, none }: { options: Array<[string, string]>; value: string | null; onPick: (v: string | null) => void; disabled?: boolean; labelText: string; none?: string }) {
  return (
    <div role="radiogroup" aria-label={labelText} className="flex flex-wrap gap-2">
      {none && (
        <button type="button" role="radio" aria-checked={value === null} disabled={disabled} onClick={() => onPick(null)} className={`state chip ${value === null ? "selected has-icon" : ""}`}>
          {value === null && <Icon name="check" size={18} />}
          {none}
        </button>
      )}
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onPick(v)} className={`state chip ${value === v ? "selected has-icon" : ""}`}>
          {value === v && <Icon name="check" size={18} />}
          {text}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 px-4 py-4" style={{ borderTop: "1px solid var(--md-outline-variant)" }}>
      <h3 className="t-title-s">{title}</h3>
      {children}
    </section>
  );
}

/* ─────────────────────────── live page ─────────────────────────── */

/**
 * Draws one slide of `deck` with the presentation engine. Until the engine has
 * the deck (or if it cannot open it) the LibreOffice render shows instead.
 * A new deck version is swapped in only once it is ready, so nothing flickers.
 */
function LiveSlide({ deck, slide, fallback, references, width }: { deck: Props["deck"]; slide: number; fallback?: string; references: Record<number, string>; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<{ engine: EngineInstance; version: number } | null>(null);
  const refs = useRef(references);
  useEffect(() => {
    refs.current = references;
  });

  useEffect(() => {
    if (!deck) return;
    let cancelled = false;
    let opened: { engine: EngineInstance; urls: string[] } | null = null;
    openDeck(deck.pptx.slice(0), refs.current)
      .then((o) => {
        if (cancelled) {
          o.engine.free();
          o.urls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        opened = o;
        setReady({ engine: o.engine, version: deck.version });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      // freed once the next version has replaced it
      const o = opened;
      if (o) setTimeout(() => {
        o.engine.free();
        o.urls.forEach((u) => URL.revokeObjectURL(u));
      }, 1000);
    };
  }, [deck]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !ready || !width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round((width * STAGE_H * dpr) / STAGE_W);
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx || slide > ready.engine.slideCount()) return;
    try {
      ready.engine.renderSlide(ctx, w, h, slide - 1);
    } catch {
      // the image below stays visible
    }
  }, [ready, slide, width]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {fallback && <img src={fallback} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />}
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ opacity: ready ? 1 : 0 }} />
    </>
  );
}

/* ─────────────────────────── the page ─────────────────────────── */

function EditorPage({
  background,
  elements,
  selected,
  disabled,
  onSelect,
  onCommit,
}: {
  background: (width: number) => ReactNode;
  elements: EditorElement[];
  selected: EditorElement | null;
  disabled: boolean;
  onSelect: Props["onSelect"];
  onCommit: (name: string, box: Box) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gesture = useRef<{ id: number; name: string; handle: Handle; cx: number; cy: number; box: Box; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<Record<string, Box>>({});
  // a fresh layout from the server replaces what was dragged locally
  const [draftFor, setDraftFor] = useState(elements);
  if (draftFor !== elements) {
    setDraftFor(elements);
    setDraft({});
  }

  // fit the page to the space it has, leaving room for the composer below
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width: w, height: h } = el.getBoundingClientRect();
      setWidth(Math.max(240, Math.min(w - 64, ((h - 140) * STAGE_W) / STAGE_H, STAGE_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const next = (g: NonNullable<typeof gesture.current>, dx: number, dy: number): Box => {
    const b = g.box;
    if (g.handle === "move") return { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) };
    let { x, y, w, h } = b;
    if (g.handle.includes("e")) w = clamp(b.w + dx, 0.02, 1 - b.x);
    if (g.handle.includes("s")) h = clamp(b.h + dy, 0.02, 1 - b.y);
    if (g.handle.includes("w")) {
      x = clamp(b.x + dx, 0, b.x + b.w - 0.02);
      w = b.x + b.w - x;
    }
    if (g.handle.includes("n")) {
      y = clamp(b.y + dy, 0, b.y + b.h - 0.02);
      h = b.y + b.h - y;
    }
    return { x, y, w, h };
  };

  const start = (e: PointerEvent<HTMLElement>, el: EditorElement, handle: Handle) => {
    if (e.button !== 0 || disabled) return;
    e.stopPropagation();
    const box = draft[el.name] ?? { x: el.x, y: el.y, w: el.w, h: el.h };
    gesture.current = { id: e.pointerId, name: el.name, handle, cx: e.clientX, cy: e.clientY, box, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(el);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const rect = pageRef.current?.getBoundingClientRect();
    if (!g || !rect || g.id !== e.pointerId) return;
    const dx = (e.clientX - g.cx) / rect.width;
    const dy = (e.clientY - g.cy) / rect.height;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 0.004) return;
    g.moved = true;
    setDraft((d) => ({ ...d, [g.name]: next(g, dx, dy) }));
  };
  const end = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const rect = pageRef.current?.getBoundingClientRect();
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.moved || !rect) return;
    onCommit(g.name, next(g, (e.clientX - g.cx) / rect.width, (e.clientY - g.cy) / rect.height));
  };
  // arrow keys nudge the selected element; Shift for bigger steps
  const nudge = (e: KeyboardEvent<HTMLElement>, el: EditorElement) => {
    const step = e.shiftKey ? 0.02 : 0.005;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || disabled) return;
    e.preventDefault();
    const b = draft[el.name] ?? { x: el.x, y: el.y, w: el.w, h: el.h };
    const box = { ...b, x: clamp(b.x + d[0], 0, 1 - b.w), y: clamp(b.y + d[1], 0, 1 - b.h) };
    setDraft((cur) => ({ ...cur, [el.name]: box }));
    onCommit(el.name, box);
  };

  return (
    <div ref={hostRef} className="absolute inset-0 flex items-start justify-center pt-8" onPointerDown={() => onSelect(null)}>
      <div ref={pageRef} className="ed-page relative shrink-0" style={{ width, aspectRatio: `${STAGE_W} / ${STAGE_H}`, opacity: width ? 1 : 0 }}>
        {width > 0 && background(width)}
        {elements
          .filter((el) => el.w < 0.995 || el.h < 0.995)
          .map((el) => {
            const box = draft[el.name] ?? el;
            const on = selected?.id === el.id;
            return (
              <div
                key={el.id}
                role="button"
                tabIndex={0}
                aria-label={`${el.name} (${el.kind})${on ? ", selected. Arrow keys move it." : ""}`}
                aria-pressed={on}
                onPointerDown={(e) => start(e, el, "move")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onFocus={() => !on && onSelect(el)}
                onKeyDown={(e) => nudge(e, el)}
                className={`ed-el absolute touch-none ${on ? "sel" : ""} ${disabled ? "" : on ? "cursor-move" : "cursor-pointer"}`}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, transform: el.rot ? `rotate(${el.rot}deg)` : undefined }}
              >
                {on && (
                  <>
                    <span className="ed-tag t-label-s">{el.name}</span>
                    {!disabled &&
                      (["nw", "ne", "sw", "se"] as const).map((h) => (
                        <span key={h} aria-hidden="true" className={`ed-handle ${h}`} onPointerDown={(e) => start(e, el, h)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
                      ))}
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/* ─────────────────────────── properties ─────────────────────────── */

function animationsOf(el: EditorElement) {
  const list = el.animations ?? [];
  const find = (set: Array<[string, string]>) => list.find((a) => set.some(([v]) => v === a.effect)) ?? null;
  const first = list[0];
  return {
    entrance: find(ENTRANCES)?.effect ?? null,
    emphasis: find(EMPHASIS)?.effect ?? null,
    exit: find(EXITS)?.effect ?? null,
    trigger: first?.trigger ?? "onClick",
    durationMs: first?.durationMs ?? 650,
    delayMs: first?.delayMs ?? 0,
  };
}

function ElementPanel({ el, disabled, edit }: { el: EditorElement; disabled: boolean; edit: (payload: Record<string, unknown>) => void }) {
  const [text, setText] = useState(el.text ?? "");
  const [fill, setFill] = useState<string | null>(null);
  const [motion, setMotion] = useState(() => animationsOf(el));
  const pct = (v: number) => Math.round(v * 1000) / 10;

  const saveMotion = (next: typeof motion) => {
    setMotion(next);
    const effects = [next.entrance, next.emphasis, next.exit].filter((e): e is string => !!e);
    edit({ animations: effects.map((effect) => ({ effect, trigger: next.trigger, durationMs: next.durationMs, delayMs: next.delayMs })) });
  };

  return (
    <>
      {el.kind === "text" && (
        <Section title="Text">
          <textarea
            aria-label="Text content"
            value={text}
            disabled={disabled}
            rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text !== el.text) edit({ text });
            }}
            className="ed-textarea t-body-m"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="t-body-s on-variant">Ctrl + Enter saves</span>
            <button type="button" disabled={disabled || text === (el.text ?? "")} onClick={() => edit({ text })} className="state btn btn-tonal !h-9 !px-4">
              Save text
            </button>
          </div>
        </Section>
      )}

      {el.kind === "shape" && (
        <Section title="Fill">
          <Swatches
            labelText="Shape fill"
            value={fill}
            disabled={disabled}
            onPick={(hex) => {
              setFill(hex);
              edit({ fill: hex });
            }}
          />
        </Section>
      )}

      <Section title="Position and size">
        <div className="grid grid-cols-2 gap-3">
          <NumberField labelText="Left" suffix="%" value={pct(el.x)} min={0} max={100} step={0.5} disabled={disabled} onCommit={(v) => edit({ x: v / 100 })} />
          <NumberField labelText="Top" suffix="%" value={pct(el.y)} min={0} max={100} step={0.5} disabled={disabled} onCommit={(v) => edit({ y: v / 100 })} />
          <NumberField labelText="Width" suffix="%" value={pct(el.w)} min={1} max={100} step={0.5} disabled={disabled} onCommit={(v) => edit({ w: v / 100 })} />
          <NumberField labelText="Height" suffix="%" value={pct(el.h)} min={1} max={100} step={0.5} disabled={disabled} onCommit={(v) => edit({ h: v / 100 })} />
          <NumberField labelText="Rotation" suffix="°" value={el.rot ?? 0} min={-360} max={360} disabled={disabled} onCommit={(v) => edit({ rot: v })} />
        </div>
      </Section>

      <Section title="Animation">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="t-label-m on-variant">Comes in</p>
            <ChipSet labelText="Entrance" none="None" options={ENTRANCES} value={motion.entrance} disabled={disabled} onPick={(v) => saveMotion({ ...motion, entrance: v })} />
          </div>
          <div className="space-y-2">
            <p className="t-label-m on-variant">Draws attention</p>
            <ChipSet labelText="Emphasis" none="None" options={EMPHASIS} value={motion.emphasis} disabled={disabled} onPick={(v) => saveMotion({ ...motion, emphasis: v })} />
          </div>
          <div className="space-y-2">
            <p className="t-label-m on-variant">Goes out</p>
            <ChipSet labelText="Exit" none="None" options={EXITS} value={motion.exit} disabled={disabled} onPick={(v) => saveMotion({ ...motion, exit: v })} />
          </div>
          {(motion.entrance || motion.emphasis || motion.exit) && (
            <>
              <div className="space-y-2">
                <p className="t-label-m on-variant">Starts</p>
                <div role="radiogroup" aria-label="Starts" className="ed-seg">
                  {STARTS.map(([v, t]) => (
                    <button key={v} type="button" role="radio" aria-checked={motion.trigger === v} disabled={disabled} onClick={() => saveMotion({ ...motion, trigger: v })} className={`state ${motion.trigger === v ? "on" : ""}`}>
                      {motion.trigger === v && <Icon name="check" size={16} />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField labelText="Duration" suffix="s" value={motion.durationMs / 1000} min={0.1} max={10} step={0.1} disabled={disabled} onCommit={(v) => saveMotion({ ...motion, durationMs: Math.round(v * 1000) })} />
                <NumberField labelText="Delay" suffix="s" value={motion.delayMs / 1000} min={0} max={10} step={0.1} disabled={disabled} onCommit={(v) => saveMotion({ ...motion, delayMs: Math.round(v * 1000) })} />
              </div>
            </>
          )}
        </div>
      </Section>
    </>
  );
}

function SlidePanel({ slide, elements, transition, disabled, onTransition, onSelect }: { slide: number; elements: EditorElement[]; transition: string; disabled: boolean; onTransition: (t: string) => void; onSelect: (el: EditorElement) => void }) {
  const steps = elements.flatMap((el) => (el.animations ?? []).map((a) => ({ el, a })));
  return (
    <>
      <Section title={`Transition into slide ${slide}`}>
        <div role="radiogroup" aria-label="Transition" className="space-y-1">
          {TRANSITIONS.map(([v, t, hint]) => (
            <button key={v} type="button" role="radio" aria-checked={transition === v} disabled={disabled} onClick={() => onTransition(v)} className={`state ed-row ${transition === v ? "on" : ""}`}>
              <span className="ed-radio" aria-hidden="true" />
              <span className="min-w-0">
                <span className="t-label-l block">{t}</span>
                <span className="t-body-s on-variant block">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Animation order">
        {steps.length === 0 ? (
          <p className="t-body-s on-variant">Nothing on this slide moves yet. Select an element to give it an animation.</p>
        ) : (
          <ol className="space-y-1">
            {steps.map(({ el, a }, i) => (
              <li key={`${el.id}-${i}`}>
                <button type="button" onClick={() => onSelect(el)} className="state ed-row">
                  <span className="ed-step t-label-m">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="t-label-l block truncate">{el.name}</span>
                    <span className="t-body-s on-variant block">
                      {label([...ENTRANCES, ...EMPHASIS, ...EXITS], a.effect)} · {label(STARTS, a.trigger ?? "onClick").toLowerCase()} · {((a.durationMs ?? 650) / 1000).toFixed(1)} s
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

/* ─────────────────────────── editor ─────────────────────────── */

export default function FullEditor(props: Props) {
  const { active, selected } = props;
  const [transitionDraft, setTransitionDraft] = useState<Record<number, string>>({});
  const [chat, setChat] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const slide = props.layout?.slides.find((s) => s.slide === active);
  const elements = slide?.elements ?? [];
  const locked = props.busy;

  // Edits collect for a short pause and are saved together; edits to the same
  // thing merge. While a save is running, new edits wait for the next batch.
  const onEdits = useRef(props.onEdits);
  useEffect(() => {
    onEdits.current = props.onEdits;
  });
  const pendingEdits = useRef(new Map<string, Record<string, unknown>>());
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unsaved, setUnsaved] = useState(0);
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    while (pendingEdits.current.size) {
      const batch = [...pendingEdits.current.values()];
      pendingEdits.current.clear();
      setUnsaved(batch.length);
      await onEdits.current(batch);
    }
    setUnsaved(0);
    sending.current = false;
  }, []);
  const queueEdit = useCallback(
    (key: string, payload: Record<string, unknown>) => {
      const prev = pendingEdits.current.get(key);
      pendingEdits.current.set(key, prev ? { ...prev, ...payload, ...(payload.format ? { format: { ...(prev.format as object), ...(payload.format as object) } } : {}) } : payload);
      setUnsaved(pendingEdits.current.size);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );
  const edit = useCallback((name: string, payload: Record<string, unknown>) => queueEdit(`${active}:${name}`, { slide: active, name, ...payload }), [queueEdit, active]);
  // nothing is lost when the editor closes with edits still waiting
  useEffect(() => {
    const pending = pendingEdits.current;
    const send = onEdits;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.size && !sending.current) void send.current([...pending.values()]);
    };
  }, []);

  // Escape lets go of the selection; it never leaves the editor
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && selected) props.onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, props]);

  // the local format copy keeps the toolbar in step while the deck rebuilds
  const [fmt, setFmt] = useState<EditorFormat>(selected?.format ?? {});
  const [fmtFor, setFmtFor] = useState(`${selected?.id}:${props.version}`);
  if (fmtFor !== `${selected?.id}:${props.version}`) {
    setFmtFor(`${selected?.id}:${props.version}`);
    setFmt(selected?.format ?? {});
  }
  const setFormat = (patch: EditorFormat) => {
    if (!selected) return;
    setFmt((f) => ({ ...f, ...patch }));
    edit(selected.name, { format: patch });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = chat.trim();
    if (!text) return;
    setChat("");
    if (props.question) void props.onAnswer(text);
    else void props.onAsk(text, selected ? { slide: active, name: selected.name } : undefined);
  };

  const saving = props.saving || unsaved > 0;
  const isText = selected?.kind === "text";
  const size = fmt.size ?? 24;

  return (
    <section className="os-full-editor absolute inset-0 z-30 flex flex-col overflow-hidden" style={{ background: "var(--md-surface-dim)" }} aria-label="Slide editor">
      {/* ── top app bar ── */}
      <header className="flex h-16 shrink-0 items-center gap-2 px-2 md:px-4" style={{ background: "var(--md-surface)" }}>
        <button type="button" onClick={props.onClose} aria-label="Back to the studio" title="Back to the studio" className="state icon-btn">
          <Icon name="back" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="t-title-m truncate">Edit slides</p>
          <p className="t-body-s on-variant" aria-live="polite">
            {props.busy ? "The designer is working on the deck…" : saving ? "Saving changes…" : `Slide ${active} of ${props.slides.length} · all changes saved`}
          </p>
        </div>
        <button type="button" onClick={() => setPanelOpen((o) => !o)} aria-label="Properties" aria-expanded={panelOpen} className={`state icon-btn lg:hidden ${panelOpen ? "selected" : ""}`}>
          <Icon name="tune" />
        </button>
        <button type="button" onClick={props.onDownload} className="state btn btn-outlined has-icon hidden sm:inline-flex">
          <Icon name="download" size={18} /> Download
        </button>
        <button type="button" onClick={props.onPresent} className="state btn btn-filled has-icon">
          <Icon name="play" size={18} /> Present
        </button>
      </header>

      {/* ── toolbar: insert, then whatever fits the selection ── */}
      <div className="ed-toolbar flex h-14 shrink-0 items-center gap-1 overflow-x-auto px-2 md:px-4" role="toolbar" aria-label="Formatting">
        <button type="button" disabled={locked} onClick={() => queueEdit(`add-${Date.now()}`, { slide: active, add: "text" })} className="state btn btn-text neutral has-icon !h-10 !px-3">
          <Icon name="text" size={18} /> Text box
        </button>
        <button type="button" disabled={locked} onClick={() => queueEdit(`add-${Date.now()}`, { slide: active, add: "shape" })} className="state btn btn-text neutral has-icon !h-10 !px-3">
          <Icon name="shape" size={18} /> Shape
        </button>
        {isText && selected && (
          <>
            <span className="ed-divider" />
            <Dropdown labelText="Font" value={fmt.font ?? ""} disabled={locked} onChange={(font) => setFormat({ font })} className="w-[150px]">
              <option value="" disabled>
                Theme font
              </option>
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Dropdown>
            <span className="ed-stepper" role="group" aria-label="Font size">
              <button type="button" aria-label="Smaller" disabled={locked || size <= 6} onClick={() => setFormat({ size: Math.max(6, size - 2) })} className="state">
                <Icon name="minus" size={16} />
              </button>
              <span className="t-label-l tabular-nums" aria-live="polite">
                {size}
              </span>
              <button type="button" aria-label="Bigger" disabled={locked || size >= 200} onClick={() => setFormat({ size: Math.min(200, size + 2) })} className="state">
                <Icon name="plus" size={16} />
              </button>
            </span>
            <span className="ed-divider" />
            <ToggleIcon icon="bold" label="Bold" on={!!fmt.bold} disabled={locked} onClick={() => setFormat({ bold: !fmt.bold })} />
            <ToggleIcon icon="italic" label="Italic" on={!!fmt.italic} disabled={locked} onClick={() => setFormat({ italic: !fmt.italic })} />
            <ToggleIcon icon="underline" label="Underline" on={!!fmt.underline} disabled={locked} onClick={() => setFormat({ underline: !fmt.underline })} />
            <span className="ed-divider" />
            {(["left", "center", "right", "justify"] as const).map((a) => (
              <ToggleIcon key={a} icon={a} label={`Align ${a}`} on={(fmt.align ?? "left") === a} disabled={locked} onClick={() => setFormat({ align: a })} />
            ))}
            <span className="ed-divider" />
            <label className="state ed-color" title="Text colour">
              <span className="sr-only">Text colour</span>
              <span className="t-label-l">A</span>
              <span className="ed-color-bar" style={{ background: `#${fmt.color ?? "FFFFFF"}` }} />
              <input type="color" disabled={locked} value={`#${fmt.color ?? "FFFFFF"}`} onChange={(e) => setFormat({ color: e.target.value.slice(1).toUpperCase() })} />
            </label>
          </>
        )}
        {selected && (
          <>
            <span className="flex-1" />
            <button type="button" disabled={locked} onClick={() => edit(selected.name, { deleted: true })} className="state btn btn-text neutral has-icon !h-10 !px-3">
              <Icon name="delete" size={18} /> Delete
            </button>
          </>
        )}
      </div>
      {saving || props.busy ? <div className="progress-linear !h-[3px] !rounded-none" role="progressbar" aria-label="Applying changes" /> : <div className="h-[3px] shrink-0" style={{ background: "var(--md-outline-variant)", height: 1 }} />}

      <div className="relative flex min-h-0 flex-1">
        {/* ── slide rail ── */}
        <nav className="hidden w-[176px] shrink-0 overflow-y-auto px-3 py-4 md:block" style={{ background: "var(--md-surface)" }} aria-label="Slides">
          <ol className="space-y-3">
            {props.slides.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  aria-label={`Slide ${n}`}
                  aria-current={n === active ? "true" : undefined}
                  onClick={() => {
                    props.setActive(n);
                    props.onSelect(null);
                  }}
                  className="group flex w-full items-start gap-2 text-left"
                >
                  <span className="t-label-m w-4 pt-1 text-right tabular-nums" style={{ color: n === active ? "var(--md-primary)" : "var(--md-on-surface-variant)" }}>
                    {n}
                  </span>
                  <span
                    className="block flex-1 overflow-hidden rounded-[var(--md-shape-s)] transition-[outline-color]"
                    style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}`, outline: n === active ? "2px solid var(--md-primary)" : "1px solid var(--md-outline-variant)", outlineOffset: n === active ? 1 : -1, background: "var(--md-surface-container)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {props.images[n] && <img src={props.images[n]} alt="" className="h-full w-full object-cover" draggable={false} />}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── page ── */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {props.images[active] ? (
            <EditorPage
              key={active}
              background={(w) => <LiveSlide deck={props.deck} slide={active} fallback={props.images[active]} references={props.images} width={w} />}
              elements={elements}
              selected={selected}
              disabled={locked}
              onSelect={props.onSelect}
              onCommit={(name, box) => edit(name, box)}
            />
          ) : (
            <p className="t-body-m on-variant absolute inset-0 grid place-items-center">This slide is still rendering.</p>
          )}

          {/* ── designer ── */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4">
            {props.notice && (
              <div role="alert" className="ed-snackbar">
                <span className="t-body-m min-w-0 flex-1">{props.notice}</span>
                {props.onDismissNotice && (
                  <button type="button" onClick={props.onDismissNotice} aria-label="Dismiss" className="state icon-btn !h-8 !w-8" style={{ color: "inherit" }}>
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>
            )}
            {props.question && (
              <div className="ed-question t-body-m" aria-live="polite">
                <span className="ed-avatar" aria-hidden="true">O</span>
                <span className="min-w-0 flex-1">{props.question}</span>
              </div>
            )}
            <form onSubmit={submit} className="ed-composer">
              {selected && !props.question && (
                <button type="button" onClick={() => props.onSelect(null)} className="state chip selected has-icon !h-8 !pl-3 !pr-2 shrink-0" title="Only this element will be changed. Click to ask about the whole slide.">
                  <span className="max-w-[140px] truncate">{selected.name}</span>
                  <Icon name="close" size={16} />
                </button>
              )}
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                aria-label={props.question ? "Your answer" : "Ask the designer"}
                placeholder={props.question ? "Type your answer" : selected ? "What should change about it?" : `Ask the designer to change slide ${active}`}
                className="t-body-m min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-[var(--md-on-surface-variant)]"
              />
              <button type="submit" disabled={!chat.trim() || (props.busy && !props.question)} aria-label="Send" className="state icon-btn filled !h-10 !w-10">
                <Icon name="send" size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* ── properties ── */}
        <aside
          className={`ed-panel w-[320px] shrink-0 overflow-y-auto ${panelOpen ? "absolute inset-y-0 right-0 z-20 block" : "hidden"} lg:static lg:block`}
          aria-label={selected ? `Properties of ${selected.name}` : `Slide ${active} settings`}
        >
          <div className="flex items-center gap-2 px-4 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              <p className="t-title-m truncate">{selected ? selected.name : `Slide ${active}`}</p>
              <p className="t-body-s on-variant">{selected ? `${selected.kind} · slide ${active}` : "Select something on the slide to format it"}</p>
            </div>
            {selected && (
              <button type="button" onClick={() => props.onSelect(null)} aria-label="Back to slide settings" title="Back to slide settings" className="state icon-btn">
                <Icon name="close" />
              </button>
            )}
          </div>
          {selected ? (
            <ElementPanel key={`${selected.id}:${props.version}`} el={selected} disabled={locked} edit={(payload) => edit(selected.name, payload)} />
          ) : (
            <SlidePanel slide={active} elements={elements} transition={transitionDraft[active] ?? slide?.transition ?? "fade"}
              disabled={locked}
              onTransition={(t) => {
                setTransitionDraft((d) => ({ ...d, [active]: t }));
                queueEdit(`${active}:transition`, { slide: active, transition: t });
              }} onSelect={props.onSelect} />
          )}
        </aside>
      </div>
    </section>
  );
}
