"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The conversation with the designer, as a chat: the user's messages as bubbles,
 * each designer turn as one message with its working steps folded into a single
 * card (live while running, a one-line summary when done), and its questions and
 * results as plain text. Styled with the M3 tokens in m3.css.
 */

export type FeedItem =
  | { kind: "user"; id: string; text: string; target?: { slide: number; name: string }; steer?: boolean }
  | { kind: "question"; id: string; text: string }
  | { kind: "notice"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; label: string; detail: string; status: "running" | "done" | "error"; elapsedMs?: number }
  | { kind: "thinking"; id: string; text: string; status: "running" | "done"; startedAt?: number }
  | { kind: "complete"; id: string; text: string }
  | { kind: "error"; id: string; text: string };

type Step = Extract<FeedItem, { kind: "tool" | "thinking" }>;
type Part =
  | { type: "work"; id: string; steps: Step[] }
  | { type: "text"; id: string; tone: "question" | "complete" | "error" | "notice"; text: string };
type Turn = { type: "user"; item: Extract<FeedItem, { kind: "user" }> } | { type: "designer"; id: string; parts: Part[] };

/** Groups the flat event feed into chat turns. */
function toTurns(items: FeedItem[]): Turn[] {
  const turns: Turn[] = [];
  const designer = () => {
    const last = turns[turns.length - 1];
    if (last && last.type === "designer") return last;
    const t: Turn = { type: "designer", id: `d-${turns.length}`, parts: [] };
    turns.push(t);
    return t;
  };
  for (const item of items) {
    if (item.kind === "user") {
      turns.push({ type: "user", item });
      continue;
    }
    const turn = designer();
    if (item.kind === "tool" || item.kind === "thinking") {
      // the question itself is shown as the designer's words
      if (item.kind === "tool" && item.name === "ask_user") continue;
      const last = turn.parts[turn.parts.length - 1];
      if (last && last.type === "work") last.steps.push(item);
      else turn.parts.push({ type: "work", id: `w-${item.id}`, steps: [item] });
      continue;
    }
    const tone = item.kind === "question" ? "question" : item.kind === "complete" ? "complete" : item.kind === "error" ? "error" : "notice";
    turn.parts.push({ type: "text", id: item.id, tone, text: item.text });
  }
  return turns;
}

const PATHS: Record<string, ReactNode> = {
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  build: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />,
  check: <path d="M12 3 5 6v5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-3Zm-3 9 2 2 4-4" />,
  text: <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  critic: <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4" />,
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
  motion: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20" />,
  memory: <path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3ZM9.5 20h5" />,
  plan: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  pencil: <path d="m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3" />,
  think: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z" />,
  note: <path d="M4 12h16M12 4v16" />,
};
const ICON_FOR: Record<string, keyof typeof PATHS> = {
  write_file: "code",
  edit_file: "code",
  read_file: "text",
  list_files: "text",
  run_script: "build",
  validate_deck: "check",
  deck_text: "text",
  render_slides: "eye",
  critique_slides: "critic",
  search_images: "search",
  fetch_image: "image",
  generate_image: "image",
  refresh_deck: "motion",
  list_my_documents: "book",
  read_document: "book",
  search_document: "search",
  remember: "memory",
  forget: "memory",
  outline_deck: "plan",
  finish: "flag",
  manual_edit: "pencil",
  steer: "note",
};

function Glyph({ name, size = 18 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

function seconds(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StepRow({ step, now }: { step: Step; now: number }) {
  if (step.kind === "thinking") {
    const running = step.status === "running";
    return (
      <li className="flex gap-3 py-1.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--md-surface-container-highest)", color: "var(--md-on-surface-variant)" }}>
          <Glyph name="think" />
        </span>
        <details className="min-w-0 flex-1 pt-1" open={running}>
          <summary className="t-body-m cursor-pointer list-none" style={{ color: "var(--md-on-surface)" }}>
            {running ? "Thinking" : "Reasoning"}
            <span className="t-body-s on-variant ml-2">
              {running && step.startedAt && now >= step.startedAt ? seconds(now - step.startedAt) : step.text ? "Show" : ""}
            </span>
          </summary>
          {step.text && <p className="t-body-s on-variant mt-1.5 whitespace-pre-wrap break-words">{step.text}</p>}
        </details>
      </li>
    );
  }
  const running = step.status === "running";
  const failed = step.status === "error";
  return (
    <li className="flex gap-3 py-1.5">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: running ? "var(--md-primary-container)" : "var(--md-surface-container-highest)",
          color: running ? "var(--md-on-primary-container)" : failed ? "var(--md-error)" : "var(--md-on-surface-variant)",
        }}
      >
        <Glyph name={ICON_FOR[step.name] ?? "build"} />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="t-body-m" style={{ color: failed ? "var(--md-error)" : "var(--md-on-surface)" }}>
          {step.label}
          {running && step.elapsedMs != null && <span className="t-body-s on-variant ml-2">{seconds(step.elapsedMs)}</span>}
        </p>
        {step.detail && (
          <p className="t-body-s on-variant mt-0.5 truncate" title={step.detail}>
            {step.detail}
          </p>
        )}
      </div>
      {running && <span className="progress-circular mt-2 block shrink-0" />}
      {failed && <span className="t-label-s mt-2 shrink-0" style={{ color: "var(--md-error)" }}>Retried</span>}
    </li>
  );
}

function WorkCard({ steps, live, now }: { steps: Step[]; live: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const tools = steps.filter((s): s is Extract<Step, { kind: "tool" }> => s.kind === "tool");
  const current = [...steps].reverse().find((s) => s.status === "running");
  const failed = tools.filter((t) => t.status === "error").length;
  const running = live && !!current;
  // while it runs: the latest three steps; afterwards: a one-line summary unless opened
  const shown = open ? steps : running ? steps.slice(-3) : [];
  const title = running
    ? current.kind === "thinking"
      ? "Thinking"
      : current.label
    : `Worked through ${tools.length} step${tools.length === 1 ? "" : "s"}`;

  return (
    <div className="enter mt-2 overflow-hidden rounded-[var(--md-shape-l)]" style={{ background: "var(--md-surface-container-low)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="state flex w-full items-center gap-3 px-4 py-3 text-left">
        {running ? (
          <span className="progress-circular" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--md-success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        <span className="t-title-s min-w-0 flex-1 truncate">{title}</span>
        {!running && failed > 0 && <span className="t-label-s on-variant">{failed} retried</span>}
        {running && steps.length > 3 && !open && <span className="t-label-s on-variant">+{steps.length - 3} earlier</span>}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="on-variant shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {running && <div className="progress-linear mx-4" />}
      {shown.length > 0 && (
        <ul className="px-4 pb-3 pt-2">
          {shown.map((s) => (
            <StepRow key={s.id} step={s} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChatFeed({ items, empty, busy, actions }: { items: FeedItem[]; empty?: ReactNode; busy: boolean; actions?: ReactNode }) {
  const [now, setNow] = useState(0);
  const thinkingNow = items.some((item) => item.kind === "thinking" && item.status === "running");
  useEffect(() => {
    if (!thinkingNow) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [thinkingNow]);

  // follow new messages unless the user scrolled up to read
  const endRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const scroller = endRef.current?.closest("[data-chat-scroll]");
    if (!scroller) return;
    const onScroll = () => {
      atBottom.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    };
    scroller.addEventListener("scroll", onScroll);
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const scroller = endRef.current?.closest("[data-chat-scroll]");
    if (scroller && atBottom.current) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [items]);

  const turns = toTurns(items);
  const lastDesigner = [...turns].reverse().find((t) => t.type === "designer");

  return (
    <div>
      {items.length === 0 && empty}
      <ol className="space-y-6" aria-live="polite">
        {turns.map((turn) => {
          if (turn.type === "user") {
            const { item } = turn;
            return (
              <li key={item.id} className="enter flex flex-col items-end">
                {(item.steer || item.target) && (
                  <span className="t-label-m on-variant mb-1 mr-1">
                    {item.steer ? "Added while working" : `Slide ${item.target!.slide} · ${item.target!.name}`}
                  </span>
                )}
                <p className="t-body-l max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-[4px] px-4 py-2.5" style={{ background: "var(--md-surface-container-highest)", color: "var(--md-on-surface)" }}>
                  {item.text}
                </p>
              </li>
            );
          }
          const live = busy && turn === lastDesigner;
          return (
            <li key={turn.id} className="enter">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "var(--md-primary-container)" }}>
                  <Image src="/OCTOPILOT.png" alt="" width={14} height={14} />
                </span>
                <span className="t-label-l">OctoSlides</span>
              </div>
              <div className="pl-8">
                {turn.parts.map((part) => {
                  if (part.type === "work") return <WorkCard key={part.id} steps={part.steps} live={live} now={now} />;
                  if (part.tone === "error")
                    return (
                      <p key={part.id} className="t-body-m enter mt-2 rounded-[var(--md-shape-m)] px-4 py-3" style={{ background: "var(--md-error-container)", color: "var(--md-on-error-container)" }}>
                        {part.text}
                      </p>
                    );
                  if (part.tone === "notice")
                    return (
                      <p key={part.id} className="t-body-m on-variant enter mt-2">
                        {part.text}
                      </p>
                    );
                  return (
                    <div key={part.id} className="enter mt-2">
                      {part.tone === "complete" && (
                        <p className="t-label-l mb-1 flex items-center gap-1.5" style={{ color: "var(--md-success)" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          Deck ready
                        </p>
                      )}
                      <p className="t-body-l whitespace-pre-wrap break-words">{part.text}</p>
                      {part.tone === "complete" && actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
