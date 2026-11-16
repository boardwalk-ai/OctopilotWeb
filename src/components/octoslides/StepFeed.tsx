"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The designer's activity as it arrives from the server. Every tool call keeps
 * its own row, and each model call can be opened again after it finishes.
 */

export type FeedItem =
  | { kind: "user"; id: string; text: string; target?: { slide: number; name: string }; steer?: boolean }
  | { kind: "notice"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; label: string; detail: string; status: "running" | "done" | "error"; elapsedMs?: number }
  | { kind: "thinking"; id: string; text: string; status: "running" | "done"; startedAt?: number }
  | { kind: "complete"; id: string; text: string }
  | { kind: "error"; id: string; text: string };

const ICONS: Record<string, ReactNode> = {
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  build: <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />,
  shield: <path d="M12 3 5 6v5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-3Zm-3 9 2 2 4-4" />,
  text: <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  spark: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11l5.6-2 1.9-5.5ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20.5 20.5-4.8-4.8" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m20.5 16-5-5-9 8.5" />
    </>
  ),
  wand: <path d="m4 20 11-11m2-5 .7 1.8L19.5 6l-1.8.7L17 8.5l-.7-1.8L14.5 6l1.8-.7L17 3.5ZM20 11l.5 1.3 1.3.5-1.3.5L20 14.6l-.5-1.3-1.3-.5 1.3-.5.5-1.3Z" />,
  motion: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20" />,
  ask: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8M12 17.2v.1" />
    </>
  ),
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  pencil: <path d="m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3" />,
};

const TOOL_ICON: Record<string, keyof typeof ICONS> = {
  write_file: "code",
  edit_file: "code",
  read_file: "text",
  list_files: "text",
  run_script: "build",
  validate_deck: "shield",
  deck_text: "text",
  render_slides: "eye",
  critique_slides: "spark",
  search_images: "search",
  fetch_image: "image",
  generate_image: "wand",
  refresh_deck: "motion",
  list_my_documents: "book",
  read_document: "book",
  search_document: "search",
  remember: "spark",
  forget: "spark",
  ask_user: "ask",
  finish: "flag",
  manual_edit: "pencil",
  steer: "spark",
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[TOOL_ICON[name] ?? "build"]}
    </svg>
  );
}

export default function StepFeed({ items, empty }: { items: FeedItem[]; empty?: ReactNode }) {
  const [now, setNow] = useState(0);
  const thinkingNow = items.some((item) => item.kind === "thinking" && item.status === "running");
  useEffect(() => {
    if (!thinkingNow) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [thinkingNow]);
  const endRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const scroller = endRef.current?.parentElement?.parentElement;
    if (!scroller) return;
    const onScroll = () => {
      atBottom.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    };
    scroller.addEventListener("scroll", onScroll);
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const scroller = endRef.current?.parentElement?.parentElement;
    if (scroller && atBottom.current) scroller.scrollTo({ top: scroller.scrollHeight });
  }, [items]);

  return (
    <div className="osf relative">
      <style>{`
        @keyframes osf-in { from { opacity: 0; transform: translateY(8px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
        @keyframes osf-sheen { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        @keyframes osf-spin { to { transform: rotate(360deg) } }
        @keyframes osf-pop { 0% { transform: scale(.4); opacity: 0 } 70% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes osf-breathe { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.0) } 50% { box-shadow: 0 0 18px 2px rgba(239,68,68,.28) } }
        .osf-row { animation: osf-in .5s cubic-bezier(.2,.8,.2,1) both }
        .osf-word { display: inline-block; animation: osf-word .45s ease-out both }
        .osf-sheen { background: linear-gradient(90deg, rgba(255,255,255,.55) 0%, #fff 45%, rgba(255,255,255,.55) 60%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: osf-sheen 2.2s linear infinite }
        .osf-ring { position: absolute; inset: -2px; border-radius: 9999px; background: conic-gradient(from 0deg, transparent 0 55%, rgba(239,68,68,.95) 85%, transparent); animation: osf-spin 1.1s linear infinite; -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px)) }
        .osf-node-run { animation: osf-breathe 2s ease-in-out infinite }
        .osf-check { animation: osf-pop .45s cubic-bezier(.2,.9,.3,1.3) both }
        @media (prefers-reduced-motion: reduce) { .osf-row, .osf-word, .osf-ring, .osf-sheen, .osf-node-run, .osf-check { animation: none !important } .osf-sheen { color: #fff } }
      `}</style>
      {items.length === 0 && empty}
      <div className="space-y-1">
        {items.map((row, i) => {
          if (row.kind === "user")
            return (
              <div key={row.id} className="osf-row flex justify-end py-2">
                <div className="max-w-[88%] rounded-2xl rounded-br-md border border-white/[0.07] bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-3.5 py-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,.6)]">
                  {row.steer && <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200/70">Added while working</p>}
                  {row.target && (
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-wide text-red-300/80">
                      <span className="h-1 w-1 rounded-full bg-red-400" />
                      Slide {row.target.slide} · {row.target.name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/90">{row.text}</p>
                </div>
              </div>
            );
          if (row.kind === "thinking")
            return (
              <div key={row.id} className="osf-row py-1.5 pl-9 pr-1">
                <details open={row.status === "running"} className="group rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-white/55">
                    {row.status === "running" ? "Thinking live…" : row.text ? "Thinking · expand to read" : "Thinking · no trace returned"}
                    {row.text && <span className="ml-2 text-white/30">{row.text.length.toLocaleString()} chars</span>}
                    {row.status === "running" && row.startedAt && now >= row.startedAt && <span className="ml-2 text-white/30">{Math.floor((now - row.startedAt) / 1000)}s</span>}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-white/65">{row.text || (row.status === "running" ? "Waiting for the model…" : "The model did not provide thinking text for this step.")}</p>
                </details>
              </div>
            );
          if (row.kind === "complete")
            return (
              <div key={row.id} className="osf-row py-3 pl-1 pr-1">
                <p className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-300/80">
                  <span className="osf-check inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/15">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  Deck ready
                </p>
                <p className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-white/80">{row.text}</p>
              </div>
            );
          if (row.kind === "notice")
            return (
              <div key={row.id} className="osf-row flex items-center gap-2 py-2 pl-1 pr-1">
                <span className="h-2 w-2 rounded-[2px] bg-white/40" />
                <p className="text-[12.5px] leading-relaxed text-white/55">{row.text}</p>
              </div>
            );
          if (row.kind === "error")
            return (
              <div key={row.id} className="osf-row py-2 pl-9 pr-1">
                <p className="text-[12.5px] leading-relaxed text-red-300/90">{row.text}</p>
              </div>
            );
          const running = row.status === "running";
          const failed = row.status === "error";
          const next = items[i + 1];
          const connect = next && next.kind === "tool";
          return (
            <div key={row.id} className="osf-row relative flex gap-3 py-1.5 pl-1">
              {connect && <span className="absolute left-[15px] top-[30px] h-[calc(100%-18px)] w-px bg-gradient-to-b from-white/15 to-white/[0.04]" />}
              <span
                className={`relative mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${
                  running ? "osf-node-run border-red-500/30 bg-red-500/10 text-red-300" : failed ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-white/10 bg-white/[0.04] text-white/55"
                }`}
              >
                {running && <span className="osf-ring" />}
                <Icon name={row.name} />
              </span>
              <div className="min-w-0 flex-1 pt-[3px]">
                <p className={`flex items-center gap-1.5 text-[12.5px] leading-tight ${running ? "osf-sheen font-medium" : failed ? "text-amber-200/80" : "text-white/70"}`}>
                  {row.label}
                  {running && row.elapsedMs != null && <span className="text-[10px] text-white/40">{Math.floor(row.elapsedMs / 1000)}s</span>}
                  {!running && !failed && (
                    <svg className="osf-check text-emerald-400/80" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </p>
                {row.detail && (
                  <p className="mt-0.5 truncate text-[11px] text-white/30" title={row.detail}>
                    {row.detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={endRef} />
    </div>
  );
}
