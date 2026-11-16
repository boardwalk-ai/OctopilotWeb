"use client";

/**
 * A slide that is still being designed: drifting color fields under film grain, a
 * slow light sweep and a breathing skeleton of the layout. When the real render
 * arrives it replaces this with a blur-to-sharp reveal (see `.os-reveal`).
 */

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Keyframes and classes shared by the stage and the thumbnails. */
export function GeneratingStyles() {
  return (
    <style>{`
      @keyframes gs-drift-a { 0% { transform: translate(-12%, -8%) scale(1) } 50% { transform: translate(14%, 10%) scale(1.25) } 100% { transform: translate(-12%, -8%) scale(1) } }
      @keyframes gs-drift-b { 0% { transform: translate(10%, 12%) scale(1.15) } 50% { transform: translate(-16%, -6%) scale(.9) } 100% { transform: translate(10%, 12%) scale(1.15) } }
      @keyframes gs-drift-c { 0% { transform: translate(0, 18%) scale(.9) } 50% { transform: translate(8%, -14%) scale(1.2) } 100% { transform: translate(0, 18%) scale(.9) } }
      @keyframes gs-sweep { 0% { transform: translateX(-120%) skewX(-18deg) } 100% { transform: translateX(260%) skewX(-18deg) } }
      @keyframes gs-breathe { 0%, 100% { opacity: .35 } 50% { opacity: .7 } }
      @keyframes gs-grain { 0% { transform: translate(0, 0) } 25% { transform: translate(-3%, 2%) } 50% { transform: translate(2%, -3%) } 75% { transform: translate(-2%, -1%) } 100% { transform: translate(0, 0) } }
      @keyframes gs-in { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
      @keyframes os-reveal { 0% { opacity: 0; filter: blur(28px) saturate(1.5) brightness(1.15); transform: scale(1.035) } 60% { opacity: 1; filter: blur(4px) saturate(1.15) } 100% { opacity: 1; filter: none; transform: none } }
      .gs-blob { position: absolute; width: 70%; height: 90%; border-radius: 9999px; filter: blur(48px); opacity: .55; mix-blend-mode: screen }
      .gs-a { animation: gs-drift-a 9s ease-in-out infinite }
      .gs-b { animation: gs-drift-b 11s ease-in-out infinite }
      .gs-c { animation: gs-drift-c 13s ease-in-out infinite }
      .gs-sweep { position: absolute; inset: -10% auto -10% 0; width: 32%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent); animation: gs-sweep 2.8s cubic-bezier(.4,0,.2,1) infinite }
      .gs-grain { position: absolute; inset: -10%; opacity: .16; mix-blend-mode: overlay; animation: gs-grain .9s steps(2) infinite }
      .gs-bone { border-radius: 6px; background: rgba(255,255,255,.16); animation: gs-breathe 2.4s ease-in-out infinite }
      .gs-in { animation: gs-in .6s cubic-bezier(.2,.8,.2,1) both }
      .os-reveal { animation: os-reveal 1.1s cubic-bezier(.2,.8,.2,1) both }
      @media (prefers-reduced-motion: reduce) { .gs-a, .gs-b, .gs-c, .gs-sweep, .gs-grain, .gs-bone, .gs-in, .os-reveal { animation: none !important } }
    `}</style>
  );
}

/** The colored field itself; `seed` varies the palette and layout per slide. */
export function GeneratingField({ seed = 0, compact = false }: { seed?: number; compact?: boolean }) {
  const palettes = [
    ["#ef4444", "#7c3aed", "#f59e0b"],
    ["#0ea5e9", "#ef4444", "#22c55e"],
    ["#f97316", "#db2777", "#6366f1"],
    ["#14b8a6", "#8b5cf6", "#f43f5e"],
  ];
  const [a, b, c] = palettes[seed % palettes.length];
  const layout = seed % 3;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0d0d10]">
      <span className="gs-blob gs-a" style={{ left: "-10%", top: "-20%", background: a, animationDelay: `${-seed * 1.3}s` }} />
      <span className="gs-blob gs-b" style={{ right: "-15%", top: "10%", background: b, animationDelay: `${-seed * 0.9}s` }} />
      <span className="gs-blob gs-c" style={{ left: "20%", bottom: "-30%", background: c, animationDelay: `${-seed * 1.7}s` }} />
      {!compact && (
        <div className="absolute inset-0" style={{ padding: "7% 7.5%" }}>
          <div className="gs-bone" style={{ width: layout === 1 ? "38%" : "52%", height: "9%" }} />
          <div className="gs-bone mt-[2.2%]" style={{ width: "30%", height: "4%", animationDelay: ".2s" }} />
          {layout === 0 && (
            <div className="mt-[6%] grid grid-cols-3 gap-[3%]" style={{ height: "48%" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="gs-bone" style={{ animationDelay: `${0.3 + i * 0.15}s`, opacity: 0.4 }} />
              ))}
            </div>
          )}
          {layout === 1 && (
            <div className="mt-[5%] flex gap-[4%]" style={{ height: "55%" }}>
              <div className="flex-1 space-y-[5%] pt-[2%]">
                {[70, 85, 60, 75].map((w, i) => (
                  <div key={i} className="gs-bone" style={{ width: `${w}%`, height: "9%", animationDelay: `${0.25 + i * 0.12}s` }} />
                ))}
              </div>
              <div className="gs-bone w-[42%]" style={{ animationDelay: ".5s", opacity: 0.45 }} />
            </div>
          )}
          {layout === 2 && (
            <div className="mt-[8%] flex items-end gap-[5%]" style={{ height: "45%" }}>
              {[55, 80, 40, 95].map((hgt, i) => (
                <div key={i} className="gs-bone flex-1" style={{ height: `${hgt}%`, animationDelay: `${0.2 + i * 0.15}s`, opacity: 0.45 }} />
              ))}
            </div>
          )}
        </div>
      )}
      <span className="gs-sweep" style={{ animationDelay: `${(seed % 5) * 0.35}s` }} />
      <span className="gs-grain" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}

/** The big stage version, with the slide's working title. */
export default function GeneratingSlide({ index, total, title, status }: { index: number; total: number; title: string; status: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="gs-in relative w-full max-w-[1000px]" style={{ aspectRatio: "13.333 / 7.5" }}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-[0_40px_120px_-30px_rgba(0,0,0,.9),0_0_0_1px_rgba(255,255,255,.06)]">
          <GeneratingField seed={index} />
        </div>
        <div className="absolute -bottom-12 left-0 right-0 flex items-center justify-center gap-2.5 text-center">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <p className="text-[12.5px] text-white/60">
            Slide {index + 1} of {total} · <span className="text-white/85">{title}</span>
            <span className="text-white/30"> · {status}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
