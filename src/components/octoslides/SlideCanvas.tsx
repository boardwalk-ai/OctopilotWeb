"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Infinite-feeling canvas for one slide: drag to pan, wheel / pinch to zoom
 * (around the cursor), double-click empty space or press 0 to fit. The slide
 * is drawn at a fixed logical size (STAGE_W x STAGE_H) and scaled with one
 * transform, so element overlays line up with the rendered image exactly.
 */

export const STAGE_W = 1333;
export const STAGE_H = 750;

type View = { x: number; y: number; k: number };

export default function SlideCanvas({
  children,
  slideKey,
  onBackgroundClick,
}: {
  children: ReactNode;
  /** changes when the slide changes: re-fits and animates the swap */
  slideKey: string;
  onBackgroundClick?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 });
  const [ready, setReady] = useState(false);
  const [animate, setAnimate] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [grabbing, setGrabbing] = useState(false);

  const fit = useCallback((smooth: boolean) => {
    const el = hostRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = Math.min(72, width * 0.06);
    const k = Math.max(0.1, Math.min((width - pad * 2) / STAGE_W, (height - pad * 2) / STAGE_H));
    setAnimate(smooth);
    setView({ k, x: (width - STAGE_W * k) / 2, y: (height - STAGE_H * k) / 2 });
    setReady(true);
  }, []);

  // ResizeObserver also fires once right after observe(): that is the first fit
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit(false));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // a new slide starts fitted
  useEffect(() => {
    const raf = requestAnimationFrame(() => fit(true));
    return () => cancelAnimationFrame(raf);
  }, [slideKey, fit]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number, smooth = false) => {
    setAnimate(smooth);
    setView((v) => {
      const k = Math.min(4, Math.max(0.15, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }, []);

  // wheel: ctrl/⌘ or pinch = zoom at cursor; plain wheel / two-finger = pan
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setAnimate(false);
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const el = hostRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (e.key === "0") fit(true);
      if (e.key === "=" || e.key === "+") zoomAt(1.2, width / 2, height / 2, true);
      if (e.key === "-") zoomAt(1 / 1.2, width / 2, height / 2, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setGrabbing(true);
      hostRef.current?.setPointerCapture(e.pointerId);
    }
    setAnimate(false);
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    suppressClick.current = d.moved;
    drag.current = null;
    setGrabbing(false);
  };

  const pct = Math.round(view.k * 100);
  const zoomCenter = (factor: number) => {
    const r = hostRef.current?.getBoundingClientRect();
    if (r) zoomAt(factor, r.width / 2, r.height / 2, true);
  };

  return (
    <div
      ref={hostRef}
      className={`osc-host relative h-full w-full touch-none select-none overflow-hidden ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px)",
        backgroundSize: `${22 * view.k * 2}px ${22 * view.k * 2}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onClick={() => onBackgroundClick?.()}
      onDoubleClick={(e) => {
        if (e.target === hostRef.current) fit(true);
      }}
    >
      <style>{`
        @keyframes osc-swap { from { opacity: 0; transform: translateY(14px) scale(.985); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } }
        .osc-swap { animation: osc-swap .55s cubic-bezier(.2,.8,.2,1) both }
      `}</style>
      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`,
          transition: animate ? "transform .45s cubic-bezier(.2,.8,.2,1)" : "none",
          opacity: ready ? 1 : 0,
        }}
      >
        <div key={slideKey} className="osc-swap relative h-full w-full" onClick={(e) => {
            e.stopPropagation();
            onBackgroundClick?.();
          }}
          style={{ ["--osc-k" as string]: view.k }}
        >
          {children}
        </div>
      </div>

      {/* zoom controls */}
      <div
        className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#121212]/85 p-1 text-white/70 shadow-[0_10px_30px_-10px_rgba(0,0,0,.8)] backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="Zoom out" onClick={() => zoomCenter(1 / 1.25)} className="state icon-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" onClick={() => fit(true)} title="Fit (0)" className="state t-label-l min-w-[56px] rounded-full px-2 py-2 tabular-nums">
          {pct}%
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1.25)} className="state icon-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
        </button>
      </div>
      <p className="t-body-s on-variant pointer-events-none absolute bottom-6 left-5 hidden md:block">Drag to pan · Ctrl + scroll to zoom · 0 to fit</p>
    </div>
  );
}
