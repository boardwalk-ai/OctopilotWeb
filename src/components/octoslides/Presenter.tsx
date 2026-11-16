"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Present mode, drawn by the Octopilot Presentation Engine (Rust -> WebAssembly,
 * engine/octo-present). The engine reads the .pptx itself and plays it:
 * transitions, Morph and entrance animations. This component is the shell
 * around it: fullscreen, keyboard / click controls, laser pointer, notes.
 */

type EngineInstance = {
  slideCount(): number;
  aspect(): number;
  slide(): number;
  stepsLeft(): number;
  notes(index: number): string;
  mediaNames(): string[];
  mediaBytes(name: string): Uint8Array;
  setImage(name: string, image: HTMLImageElement): void;
  setReference(index: number, image: HTMLImageElement): void;
  fonts(): string[];
  fontsChanged(): void;
  next(now: number): boolean;
  prev(now: number): boolean;
  goto(index: number, now: number): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): boolean;
  free(): void;
};
type EngineModule = { default: (init?: unknown) => Promise<unknown>; Engine: new (bytes: Uint8Array) => EngineInstance };

const ENGINE_URL = "/octo-present/octo_present.js";
const WASM_URL = "/octo-present/octo_present_bg.wasm";
/** Metric-compatible stand-ins for the Office fonts, for devices that lack them. */
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Caladea:ital,wght@0,400;0,700;1,400;1,700&family=Arimo:ital,wght@0,400;0,700;1,400;1,700&display=swap";
const FALLBACK: Record<string, string> = { Calibri: "Carlito", Cambria: "Caladea", Arial: "Arimo" };

let modulePromise: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  modulePromise ??= (async () => {
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ENGINE_URL)) as EngineModule;
    await mod.default({ module_or_path: WASM_URL });
    return mod;
  })();
  return modulePromise;
}

function mime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
}

function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadFonts(families: string[]) {
  if (!document.querySelector(`link[data-octo-present-fonts]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_CSS;
    link.dataset.octoPresentFonts = "1";
    document.head.appendChild(link);
    await new Promise((r) => {
      link.onload = r;
      link.onerror = r;
      setTimeout(r, 2500);
    });
  }
  const wanted = new Set<string>();
  for (const f of families) {
    wanted.add(f);
    if (FALLBACK[f]) wanted.add(FALLBACK[f]);
  }
  await Promise.all(
    [...wanted].flatMap((f) => ["400", "700"].map((w) => document.fonts.load(`${w} 24px "${f}"`).catch(() => undefined))),
  );
}

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

  const sync = useCallback(() => {
    const e = engineRef.current;
    if (e) setPos({ slide: e.slide(), count: e.slideCount(), steps: e.stepsLeft() });
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
        const mod = await loadEngine();
        if (dead) return;
        const engine = new mod.Engine(new Uint8Array(pptx));
        engineRef.current = engine;
        await Promise.all([
          ...engine.mediaNames().map(async (name) => {
            const url = URL.createObjectURL(new Blob([engine.mediaBytes(name) as BlobPart], { type: mime(name) }));
            urlsRef.current.push(url);
            const img = await decode(url);
            if (img && !dead) engine.setImage(name, img);
          }),
          ...Object.entries(references ?? {}).map(async ([n, url]) => {
            const img = await decode(url);
            if (img && !dead) engine.setReference(Number(n) - 1, img);
          }),
          loadFonts(engine.fonts()),
        ]);
        if (dead) return;
        engine.fontsChanged();
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
        if (!engine.next(now)) setEnded(true);
      } else if (action === "prev") {
        if (ended) setEnded(false);
        else engine.prev(now);
      } else {
        setEnded(false);
        engine.goto(Math.max(0, Math.min(engine.slideCount() - 1, action)), now);
      }
      sync();
      draw();
    },
    [blank, ended, onClose, sync, draw],
  );

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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, toggleFullscreen]);

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
