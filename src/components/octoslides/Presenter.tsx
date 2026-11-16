"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openDeck, PRESENTER_CHANNEL, type EngineInstance, type PresenterMessage } from "@/components/octoslides/engine";

/**
 * Present mode, drawn by the Octopilot Presentation Engine (Rust -> WebAssembly,
 * engine/octo-present). The engine reads the .pptx itself and plays it:
 * transitions, Morph and entrance animations. This component is the shell
 * around it: fullscreen, keyboard / click controls, laser pointer, notes.
 */

export default function Presenter({
  pptx,
  references,
  startSlide = 0,
  onClose,
}: {
  pptx: ArrayBuffer;
  /** rendered slide images by slide number (1-based), used for charts and tables */
  references?: Record<number, string>;
  startSlide?: number;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineInstance | null>(null);
  const rafRef = useRef(0);
  const urlsRef = useRef<string[]>([]);
  const typedRef = useRef("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [pos, setPos] = useState({ slide: startSlide, count: 0, steps: 0 });
  const [ended, setEnded] = useState(false);
  const [blank, setBlank] = useState<null | "black" | "white">(null);
  const [laser, setLaser] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const [typed, setTyped] = useState("");
  const [popupBlocked, setPopupBlocked] = useState(false);
  const laserRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── draw loop: runs only while something is moving ──
  const draw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (!engine || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let moving = false;
      try {
        moving = engine.render(ctx, canvas.width, canvas.height, performance.now());
      } catch (e) {
        console.error("[octo-present]", e);
      }
      if (moving) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const startedAtRef = useRef(Date.now());
  const endedRef = useRef(false);
  const presenterWin = useRef<Window | null>(null);

  const sync = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setPos({ slide: e.slide(), count: e.slideCount(), steps: e.stepsLeft() });
    channelRef.current?.postMessage({
      type: "state",
      slide: e.slide(),
      count: e.slideCount(),
      stepsLeft: e.stepsLeft(),
      ended: endedRef.current,
      startedAt: startedAtRef.current,
    } satisfies PresenterMessage);
  }, []);

  const resize = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!engine || !canvas || !root) return;
    const aspect = engine.aspect();
    const { clientWidth: W, clientHeight: H } = root;
    const w = Math.min(W, H * aspect);
    const h = w / aspect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw();
  }, [draw]);

  // ── boot ──
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { engine, urls } = await openDeck(pptx, references);
        urlsRef.current.push(...urls);
        if (dead) {
          engine.free();
          return;
        }
        engineRef.current = engine;
        if (startSlide > 0) engine.goto(startSlide, performance.now());
        setStatus("ready");
        sync();
        resize();
      } catch (e) {
        if (!dead) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    })();
    const urls = urlsRef.current;
    return () => {
      dead = true;
      cancelAnimationFrame(rafRef.current);
      urls.forEach((u) => URL.revokeObjectURL(u));
      try {
        engineRef.current?.free();
      } catch {
        // already freed
      }
      engineRef.current = null;
    };
    // the deck is fixed for the lifetime of this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fullscreen ──
  useEffect(() => {
    const root = rootRef.current;
    root?.requestFullscreen?.().catch(() => undefined);
    const onChange = () => {
      setIsFull(!!document.fullscreenElement);
      resize();
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("resize", resize);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [resize]);

  // ── navigation ──
  const go = useCallback(
    (action: "next" | "prev" | number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const now = performance.now();
      if (blank) {
        setBlank(null);
        return;
      }
      if (action === "next") {
        if (ended) {
          onClose();
          return;
        }
        if (!engine.next(now)) {
          endedRef.current = true;
          setEnded(true);
        }
      } else if (action === "prev") {
        if (ended) {
          endedRef.current = false;
          setEnded(false);
        } else engine.prev(now);
      } else {
        endedRef.current = false;
        setEnded(false);
        engine.goto(Math.max(0, Math.min(engine.slideCount() - 1, action)), now);
      }
      sync();
      draw();
    },
    [blank, ended, onClose, sync, draw],
  );

  // ── presenter view: a second window with notes, next slide and timer ──
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  }, [go]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PRESENTER_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (ev: MessageEvent<PresenterMessage>) => {
      const m = ev.data;
      if (m.type === "hello") {
        channel.postMessage({ type: "deck", pptx, references: references ?? {} } satisfies PresenterMessage);
        sync();
      } else if (m.type === "command") {
        if (m.action === "end") onClose();
        else if (m.action === "goto" && typeof m.index === "number") goRef.current(m.index);
        else if (m.action === "next" || m.action === "prev") goRef.current(m.action);
      }
    };
    return () => {
      channel.postMessage({ type: "closed" } satisfies PresenterMessage);
      channel.close();
      channelRef.current = null;
      presenterWin.current?.close();
    };
  }, [pptx, references, onClose, sync]);

  const openPresenterView = useCallback(() => {
    if (presenterWin.current && !presenterWin.current.closed) {
      presenterWin.current.focus();
      return;
    }
    presenterWin.current = window.open("/octoslides/presenter", "octoslides-presenter", "popup=yes,width=1280,height=800");
    // a blocked pop-up returns null: say so instead of doing nothing
    if (!presenterWin.current) setPopupBlocked(true);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Escape") {
        // the browser leaves fullscreen on Esc by itself; a second Esc closes
        if (!document.fullscreenElement) onClose();
        return;
      }
      if (/^[0-9]$/.test(k)) {
        typedRef.current = (typedRef.current + k).slice(0, 3);
        setTyped(typedRef.current);
        return;
      }
      if (k === "Enter" && typedRef.current) {
        go(Number(typedRef.current) - 1);
        typedRef.current = "";
        setTyped("");
        return;
      }
      typedRef.current = "";
      setTyped("");
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(k)) {
        e.preventDefault();
        go("next");
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(k)) {
        e.preventDefault();
        go("prev");
      } else if (k === "Home") go(0);
      else if (k === "End") go((engineRef.current?.slideCount() ?? 1) - 1);
      else if (k === "b" || k === "B" || k === ".") setBlank((v) => (v === "black" ? null : "black"));
      else if (k === "w" || k === "W" || k === ",") setBlank((v) => (v === "white" ? null : "white"));
      else if (k === "l" || k === "L") setLaser((v) => !v);
      else if (k === "s" || k === "S") setShowNotes((v) => !v);
      else if (k === "f" || k === "F") toggleFullscreen();
      else if (k === "v" || k === "V") openPresenterView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, toggleFullscreen, openPresenterView]);

  const onMove = (e: React.MouseEvent) => {
    setChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 2600);
    if (laser && laserRef.current) laserRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  };
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

  const notes = status === "ready" ? engineRef.current?.notes(pos.slide) ?? "" : "";
  const progress = pos.count ? (pos.slide + (ended ? 1 : 0)) / Math.max(1, pos.count - 1) : 0;

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black ${chrome || laser ? "" : "cursor-none"} ${laser ? "cursor-none" : ""}`}
      onMouseMove={onMove}
      onClick={() => go("next")}
      onContextMenu={(e) => {
        e.preventDefault();
        go("prev");
      }}
    >
      <style>{`
        @keyframes op-in { from { opacity: 0; transform: scale(.985) } to { opacity: 1; transform: none } }
        @keyframes op-spin { to { transform: rotate(360deg) } }
        .op-in { animation: op-in .6s cubic-bezier(.2,.8,.2,1) both }
      `}</style>

      <canvas ref={canvasRef} className={`block ${status === "ready" ? "op-in" : "opacity-0"}`} />

      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/60">
          <span className="h-10 w-10 rounded-full" style={{ background: "conic-gradient(from 0deg, transparent 0 60%, rgba(239,68,68,.95) 90%, transparent)", WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))", animation: "op-spin 1s linear infinite" }} />
          <p className="text-[13px] tracking-wide">Preparing your presentation…</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/70" onClick={(e) => e.stopPropagation()}>
          <p className="text-[14px]">This deck could not be presented.</p>
          <p className="max-w-md text-[12px] text-white/40">{error}</p>
          <button type="button" onClick={onClose} className="mt-2 rounded-lg bg-white px-4 py-2 text-[12.5px] font-semibold text-black">
            Close
          </button>
        </div>
      )}

      {ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-white/60">
          <p className="text-[14px]">End of presentation</p>
          <p className="text-[12px] text-white/35">Click or press → to exit · ← to go back</p>
        </div>
      )}
      {blank && <div className="absolute inset-0" style={{ background: blank }} />}

      {laser && (
        <div
          ref={laserRef}
          className="pointer-events-none fixed left-0 top-0 z-10 -ml-2 -mt-2 h-4 w-4 rounded-full"
          style={{ background: "radial-gradient(circle, #fff 0 18%, #ff3b3b 30% 55%, rgba(255,59,59,0) 72%)", boxShadow: "0 0 18px 6px rgba(255,40,40,.55)", willChange: "transform" }}
        />
      )}

      {popupBlocked && (
        <div className="absolute left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#2b2121] px-4 py-3 text-[14px] text-[#ffdad6] shadow-2xl" role="alert" onClick={(e) => e.stopPropagation()}>
          Your browser blocked the presenter window. Allow pop-ups for this site, then press V again.
          <button type="button" onClick={() => setPopupBlocked(false)} className="rounded-full px-3 py-1 font-medium text-white hover:bg-white/10">
            OK
          </button>
        </div>
      )}
      {typed && <div className="absolute right-6 top-6 rounded-xl bg-white/10 px-4 py-2 text-[22px] font-semibold tabular-nums text-white backdrop-blur">{typed}⏎</div>}

      {showNotes && status === "ready" && (
        <div className="absolute bottom-20 left-1/2 max-h-[34vh] w-[min(760px,88vw)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-black/75 px-5 py-4 text-[15px] leading-relaxed text-white/85 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">Speaker notes · slide {pos.slide + 1}</p>
          <p className="whitespace-pre-wrap">{notes || "No notes for this slide."}</p>
        </div>
      )}

      {/* control bar */}
      {status === "ready" && (
        <div
          className={`absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#111]/80 p-1.5 text-white/75 shadow-[0_20px_60px_-15px_rgba(0,0,0,.9)] backdrop-blur-xl transition-all duration-500 ${chrome ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <Btn label="Previous (←)" onClick={() => go("prev")}>
            <path d="m15 6-6 6 6 6" />
          </Btn>
          <div className="min-w-[78px] px-2 text-center">
            <p className="text-[12.5px] tabular-nums text-white">
              {pos.slide + 1} <span className="text-white/35">/ {pos.count}</span>
            </p>
            <div className="mt-1 h-[2px] overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-red-500 transition-all duration-500" style={{ width: `${Math.min(1, progress) * 100}%` }} />
            </div>
          </div>
          <Btn label="Next (→)" onClick={() => go("next")}>
            <path d="m9 6 6 6-6 6" />
          </Btn>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <Btn label="Laser pointer (L)" active={laser} onClick={() => setLaser((v) => !v)}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          </Btn>
          <Btn label="Speaker notes (S)" active={showNotes} onClick={() => setShowNotes((v) => !v)}>
            <path d="M5 5h14v10H9l-4 4V5Z" />
          </Btn>
          <Btn label="Black screen (B)" active={blank === "black"} onClick={() => setBlank((v) => (v === "black" ? null : "black"))}>
            <rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor" stroke="none" />
          </Btn>
          <Btn label="Presenter view: notes, next slide, timer (V)" onClick={openPresenterView}>
            <rect x="3" y="5" width="12" height="9" rx="1.5" />
            <rect x="17" y="5" width="4" height="4" rx="1" />
            <path d="M17 12h4M17 15h4M3 18h12" />
          </Btn>
          <Btn label={isFull ? "Exit full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen}>
            {isFull ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </Btn>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-red-500/90 hover:text-white">
            End show
          </button>
        </div>
      )}
    </div>
  );
}

function Btn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${active ? "bg-red-500/90 text-white" : "hover:bg-white/10 hover:text-white"}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
