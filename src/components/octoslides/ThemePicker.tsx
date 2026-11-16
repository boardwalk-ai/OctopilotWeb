"use client";

import { useEffect, useRef, useState } from "react";
import { OCTOSLIDES_THEMES } from "@/lib/octoslidesThemes";

/**
 * The designer asked which colors to use: the ten fixed themes as large previews
 * over the canvas, plus "Other" for the user's own colors.
 */

type Theme = (typeof OCTOSLIDES_THEMES)[number];

/** Relative luminance (0 black .. 1 white). */
function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const isDark = (hex: string) => luminance(hex) < 0.4;

/** A tiny title slide in the theme's colors: background, title, accent bar, a card. */
function Preview({ theme }: { theme: Theme }) {
  const [a, b, c] = theme.colors;
  // the darkest color carries the slide, the lightest is text, the middle one is the accent
  const sorted = [...theme.colors].sort((x, y) => luminance(x) - luminance(y));
  const bg = sorted[0];
  const text = isDark(bg) ? (isDark(c) ? "FFFFFF" : c) : "1A1A1A";
  const accent = b === bg ? a : b;
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg" style={{ background: `#${bg}` }}>
      <div className="absolute inset-y-0 right-0 w-[38%]" style={{ background: `linear-gradient(135deg, #${accent}, #${accent}cc)` }} />
      <div className="absolute left-[8%] top-[22%] h-[9%] w-[46%] rounded-sm" style={{ background: `#${text}` }} />
      <div className="absolute left-[8%] top-[37%] h-[5%] w-[34%] rounded-sm opacity-60" style={{ background: `#${text}` }} />
      <div className="absolute left-[8%] top-[58%] h-[22%] w-[22%] rounded-md" style={{ background: `#${c}`, opacity: c === bg ? 0.35 : 0.9 }} />
      <div className="absolute left-[33%] top-[58%] h-[22%] w-[22%] rounded-md" style={{ background: `#${a}`, opacity: a === bg ? 0.35 : 0.9 }} />
    </div>
  );
}

export default function ThemePicker({
  question,
  onPick,
}: {
  question: string;
  onPick: (answer: string) => Promise<void> | void;
}) {
  const [custom, setCustom] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // keyboard users land on the first theme, not at the top of the sidebar
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (otherOpen) inputRef.current?.focus();
  }, [otherOpen]);

  const pick = async (answer: string) => {
    if (sending) return;
    setSending(answer);
    try {
      await onPick(answer);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/55 p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Choose a color theme">
      <style>{`
        @keyframes tp-in { from { opacity: 0; transform: translateY(16px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes tp-card { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .tp-in { animation: tp-in .5s cubic-bezier(.2,.8,.2,1) both }
        .tp-card { animation: tp-card .45s cubic-bezier(.2,.8,.2,1) both }
      `}</style>
      <div ref={dialogRef} className="tp-in my-auto w-full max-w-[920px] rounded-[var(--md-shape-xl)] p-6" style={{ background: "var(--md-surface-container-high)", boxShadow: "var(--md-elev-3)" }}>
        <h2 className="t-headline-s">Choose a look</h2>
        <p className="t-body-m on-variant mt-2">{question}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {OCTOSLIDES_THEMES.map((theme, i) => (
            <button
              key={theme.name}
              type="button"
              disabled={!!sending}
              onClick={() => void pick(theme.name)}
              className="tp-card state group rounded-[var(--md-shape-l)] p-2 text-left disabled:opacity-50"
              style={{ animationDelay: `${60 + i * 35}ms`, background: "var(--md-surface-container-highest)" }}
            >
              <Preview theme={theme} />
              <div className="mt-2 flex items-center gap-2 px-1 pb-0.5">
                <span className="flex shrink-0 -space-x-1" aria-hidden="true">
                  {theme.colors.map((color) => (
                    <span key={color} className="h-3 w-3 rounded-full border border-white/25" style={{ background: `#${color}` }} />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="t-label-l block truncate">{sending === theme.name ? "Applying…" : theme.name}</span>
                  <span className="t-body-s on-variant block truncate">{theme.description}</span>
                </span>
              </div>
            </button>
          ))}
          <div
            className="tp-card flex flex-col justify-center rounded-[var(--md-shape-l)] border border-dashed p-3" style={{ borderColor: "var(--md-outline)", animationDelay: `${60 + OCTOSLIDES_THEMES.length * 35}ms` }}
          >
            {!otherOpen ? (
              <button type="button" onClick={() => setOtherOpen(true)} className="flex h-full flex-col items-center justify-center gap-1.5 py-4 text-center text-white/70 transition hover:text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-[18px] leading-none">+</span>
                <span className="text-[12.5px] font-medium">Other</span>
                <span className="text-[10.5px] text-white/40">Type your own colors</span>
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim()) void pick(custom.trim());
                }}
                className="flex flex-col gap-2"
              >
                <label className="text-[11px] text-white/50" htmlFor="tp-custom">
                  Your colors
                </label>
                <input
                  id="tp-custom"
                  ref={inputRef}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="navy and gold, or #1E3A8A #F59E0B"
                  className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[12.5px] text-white outline-none placeholder:text-white/25 focus:border-red-500/45"
                />
                <button type="submit" disabled={!custom.trim() || !!sending} className="rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-400 disabled:opacity-30">
                  {sending ? "Applying…" : "Use these colors"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
