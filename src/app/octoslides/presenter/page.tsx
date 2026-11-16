"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openDeck, PRESENTER_CHANNEL, type EngineInstance, type PresenterMessage } from "@/components/octoslides/engine";

/**
 * Presenter view: opened from Present mode in a second window (usually on the laptop
 * screen while the audience sees the full-screen slides). It gets the deck from the
 * presenting window over a BroadcastChannel (same origin only, nothing is fetched) and
 * drives it: current and next slide, speaker notes, elapsed time and clock.
 */

type State = { slide: number; count: number; stepsLeft: number; ended: boolean; startedAt: number };

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

function SlideCanvas({ engine, index, className }: { engine: EngineInstance | null; index: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !engine) return;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round((rect.width / engine.aspect()) * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx && index >= 0 && index < engine.slideCount()) engine.renderSlide(ctx, canvas.width, canvas.height, index);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [engine, index]);
  return <canvas ref={ref} className={`block w-full rounded-xl bg-black ${className ?? ""}`} style={{ aspectRatio: engine ? String(engine.aspect()) : "16 / 9" }} />;
}

export default function PresenterPage() {
  const [engine, setEngine] = useState<EngineInstance | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(true);
  const [timerBase, setTimerBase] = useState<number | null>(null);
  const [paused, setPaused] = useState<number | null>(null);
  const [fontScale, setFontScale] = useState(1);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const channel = new BroadcastChannel(PRESENTER_CHANNEL);
    channelRef.current = channel;
    let loading = false;
    channel.onmessage = async (ev: MessageEvent<PresenterMessage>) => {
      const m = ev.data;
      if (m.type === "deck" && !loading) {
        loading = true;
        const { engine: e, urls } = await openDeck(m.pptx, m.references);
        urlsRef.current = urls;
        setEngine((old) => {
          old?.free();
          return e;
        });
      } else if (m.type === "state") {
        setState({ slide: m.slide, count: m.count, stepsLeft: m.stepsLeft, ended: m.ended, startedAt: m.startedAt });
        setConnected(true);
      } else if (m.type === "closed") {
        setConnected(false);
      }
    };
    channel.postMessage({ type: "hello" } satisfies PresenterMessage);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(tick);
      channel.close();
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const send = useCallback((action: "next" | "prev" | "goto" | "end", index?: number) => {
    channelRef.current?.postMessage({ type: "command", action, index } satisfies PresenterMessage);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(e.key)) {
        e.preventDefault();
        send("next");
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(e.key)) {
        e.preventDefault();
        send("prev");
      } else if (e.key === "Home") send("goto", 0);
      else if (e.key === "End" && state) send("goto", state.count - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, state]);

  const started = timerBase ?? state?.startedAt ?? now;
  const elapsed = (paused ?? now) - started;
  const slide = state?.slide ?? 0;
  const notes = engine && state ? engine.notes(slide) : "";
  const nextIndex = state && !state.ended ? (state.stepsLeft > 0 ? slide : slide + 1) : -1;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0b0b0c] text-white">
      <header className="flex items-center gap-4 border-b border-white/[0.07] px-5 py-3">
        <p className="text-[13px] font-semibold tracking-tight">Presenter view</p>
        {!connected && <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[11.5px] text-amber-200">The presentation was closed</span>}
        <span className="flex-1" />
        <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5">
          <span className="text-[22px] font-semibold tabular-nums">{fmt(elapsed)}</span>
          <button type="button" onClick={() => setPaused((p) => (p === null ? Date.now() : null))} className="rounded-md px-2 py-1 text-[11.5px] text-white/60 hover:bg-white/10 hover:text-white">
            {paused === null ? "Pause" : "Resume"}
          </button>
          <button type="button" onClick={() => { setTimerBase(Date.now()); setPaused(null); }} className="rounded-md px-2 py-1 text-[11.5px] text-white/60 hover:bg-white/10 hover:text-white">
            Reset
          </button>
        </div>
        <span className="text-[15px] tabular-nums text-white/50">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </header>

      {!engine ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-white/45">{connected ? "Connecting to the presentation…" : "Start Present mode in OctoSlides, then open the presenter view again."}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 p-5">
          <section className="flex min-h-0 flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">Now · slide {slide + 1} of {state?.count ?? "…"}</p>
              {state && state.stepsLeft > 0 && <p className="text-[11.5px] text-red-300/80">{state.stepsLeft} more click{state.stepsLeft > 1 ? "s" : ""} on this slide</p>}
            </div>
            <SlideCanvas engine={engine} index={slide} className="ring-2 ring-red-500/70" />
            <div className="mt-auto flex items-center gap-2">
              <button type="button" onClick={() => send("prev")} className="rounded-xl border border-white/10 px-4 py-2.5 text-[13px] text-white/80 transition hover:bg-white/10">← Previous</button>
              <button type="button" onClick={() => send("next")} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-red-400">
                {state?.ended ? "End of show" : state && state.stepsLeft > 0 ? "Next click →" : "Next slide →"}
              </button>
              <button type="button" onClick={() => send("end")} className="rounded-xl border border-white/10 px-4 py-2.5 text-[13px] text-white/70 transition hover:border-red-500/50 hover:text-white">End show</button>
            </div>
          </section>
          <section className="flex min-h-0 flex-col gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">{nextIndex === slide ? "Next · same slide, next build" : "Next"}</p>
            {nextIndex >= 0 && nextIndex < (state?.count ?? 0) ? (
              <SlideCanvas engine={engine} index={nextIndex} className="opacity-90" />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/15 text-[12px] text-white/35">End of presentation</div>
            )}
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">Notes</p>
              <div className="flex gap-1">
                <button type="button" onClick={() => setFontScale((f) => Math.max(0.7, f - 0.1))} className="rounded-md px-2 py-0.5 text-[12px] text-white/55 hover:bg-white/10">A−</button>
                <button type="button" onClick={() => setFontScale((f) => Math.min(2, f + 0.1))} className="rounded-md px-2 py-0.5 text-[14px] text-white/55 hover:bg-white/10">A+</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="whitespace-pre-wrap leading-relaxed text-white/85" style={{ fontSize: `${16 * fontScale}px` }}>
                {notes || "No notes for this slide."}
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {Array.from({ length: state?.count ?? 0 }, (_, i) => (
                <button key={i} type="button" onClick={() => send("goto", i)} className={`shrink-0 rounded-md px-2 py-1 text-[11px] tabular-nums transition ${i === slide ? "bg-red-500 text-white" : "bg-white/[0.06] text-white/55 hover:bg-white/10"}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
