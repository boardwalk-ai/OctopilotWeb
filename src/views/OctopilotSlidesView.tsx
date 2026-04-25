"use client";

import {
  useEffect, useRef, useState,
  FormEvent, KeyboardEvent, useCallback,
} from "react";
import Image from "next/image";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";

// ─── Types ─────────────────────────────────────────────────────────────────────

type OctopilotSlidesViewProps = { onBack: () => void };

type StepStatus = "pending" | "running" | "completed" | "error";

type WorkflowStep = {
  id: number;
  title: string;
  detail: string;
  status: StepStatus;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type Slide = {
  id: number;
  title: string;
  body: string;
  layout: "title" | "content" | "two-col" | "blank";
};

// ─── Constants ─────────────────────────────────────────────────────────────────

// Intrinsic slide dimensions on the canvas (before zoom)
const SLIDE_W = 880;
const SLIDE_H = 495; // 16:9
const SLIDE_GAP = 72;

const INITIAL_STEPS: WorkflowStep[] = [
  { id: 1, title: "Analyze topic",     detail: "Parsing the brief and locking in scope.",       status: "pending" },
  { id: 2, title: "Build outline",     detail: "Structuring slides section by section.",         status: "pending" },
  { id: 3, title: "Research sources",  detail: "Searching for relevant, citable content.",       status: "pending" },
  { id: 4, title: "Generate slides",   detail: "Writing content for each slide.",                status: "pending" },
  { id: 5, title: "Speaker notes",     detail: "Drafting presenter notes per slide.",            status: "pending" },
  { id: 6, title: "Apply theme",       detail: "Styling slides with the selected theme.",        status: "pending" },
  { id: 7, title: "Export deck",       detail: "Packaging the final PPTX / PDF.",               status: "pending" },
];

const PLACEHOLDER_SLIDES: Slide[] = [
  { id: 1, layout: "title",   title: "Your Presentation Title",  body: "Subtitle · Author Name · Date" },
  { id: 2, layout: "content", title: "Introduction",             body: "Overview of the topic and key talking points. This slide sets context for the audience and frames the narrative." },
  { id: 3, layout: "content", title: "Key Finding #1",           body: "First major insight with supporting evidence. Place your strongest data point or quote here to anchor the argument." },
  { id: 4, layout: "two-col", title: "Compare & Contrast",       body: "Left column argument|Right column counter-argument" },
  { id: 5, layout: "content", title: "Key Finding #2",           body: "Second major insight. Build on slide 3 — connect the dots for your audience and show the implication." },
  { id: 6, layout: "content", title: "Conclusion",               body: "Summary of takeaways and a clear call to action. Leave the audience with one memorable sentence." },
  { id: 7, layout: "blank",   title: "Q & A",                   body: "Thank you. Questions welcome." },
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hi! Tell me your topic, target audience, and how many slides you need — I'll handle the rest.",
};

// ─── Slide renderers ───────────────────────────────────────────────────────────

function SlideCanvas({ slide }: { slide: Slide }) {
  const base = "w-full h-full flex flex-col overflow-hidden";

  if (slide.layout === "title") {
    return (
      <div className={`${base} items-center justify-center gap-3 bg-black`}>
        <div className="h-0.5 w-20 bg-red-500 mb-2" />
        <h2 className="text-center text-4xl font-bold text-white px-16 leading-snug">{slide.title}</h2>
        <p className="text-center text-base text-white/40 mt-1">{slide.body}</p>
      </div>
    );
  }

  if (slide.layout === "two-col") {
    const [left, right] = slide.body.split("|");
    return (
      <div className={`${base} p-12 bg-white`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-6 w-1 rounded-full bg-red-500" />
          <h3 className="text-2xl font-bold text-black">{slide.title}</h3>
        </div>
        <div className="flex flex-1 gap-6">
          <div className="flex-1 rounded-xl bg-black/[0.04] border border-black/[0.07] p-6 text-sm text-black/60 leading-relaxed">{left?.trim()}</div>
          <div className="flex-1 rounded-xl bg-red-500/[0.05] border border-red-500/20 p-6 text-sm text-black/60 leading-relaxed">{right?.trim()}</div>
        </div>
      </div>
    );
  }

  if (slide.layout === "blank") {
    return (
      <div className={`${base} items-center justify-center bg-black`}>
        <p className="text-5xl font-bold text-white">{slide.title}</p>
        <p className="text-lg text-white/30 mt-3">{slide.body}</p>
      </div>
    );
  }

  // content
  return (
    <div className={`${base} p-12 bg-white`}>
      <div className="flex items-center gap-3 mb-8">
        <div className="h-6 w-1 rounded-full bg-red-500" />
        <h3 className="text-2xl font-bold text-black">{slide.title}</h3>
      </div>
      <p className="text-base text-black/55 leading-relaxed mb-8">{slide.body}</p>
      <div className="flex flex-col gap-3.5 mt-auto">
        {[75, 90, 55].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            <div className="h-2 rounded-full bg-black/[0.07]" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
  if (status === "running") return (
    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
      <span className="absolute h-3 w-3 animate-ping rounded-full bg-red-500 opacity-40" />
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
    </span>
  );
  if (status === "error") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
    </svg>
  );
  return <span className="h-1.5 w-1.5 rounded-full bg-white/[0.15] shrink-0" />;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function OctopilotSlidesView({ onBack }: OctopilotSlidesViewProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [slides] = useState<Slide[]>(PLACEHOLDER_SLIDES);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"workflow" | "sources">("workflow");

  // ── Canvas pan / zoom state ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [zoom, setZoom] = useState(0.55);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Non-passive wheel listener for zoom + pan
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch / ctrl-scroll → zoom centered on cursor
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.08 : 0.93;
        setZoom((z) => {
          const nz = Math.max(0.1, Math.min(4, z * factor));
          setPan((p) => ({
            x: cx - (cx - p.x) * (nz / z),
            y: cy - (cy - p.y) * (nz / z),
          }));
          return nz;
        });
      } else {
        // Two-finger trackpad scroll → pan
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mouse drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Only drag on canvas background, not on slides
    const target = e.target as HTMLElement;
    if (target.closest("[data-slide]")) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Fit all slides in view
  const fitView = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const totalW = slides.length * SLIDE_W + (slides.length - 1) * SLIDE_GAP;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const fitZoom = Math.min(cw / (totalW + 160), ch / (SLIDE_H + 160), 1);
    const scaledW = totalW * fitZoom;
    const scaledH = SLIDE_H * fitZoom;
    setZoom(fitZoom);
    setPan({ x: (cw - scaledW) / 2, y: (ch - scaledH) / 2 });
  }, [slides.length]);

  // Initial fit
  useEffect(() => { fitView(); }, [fitView]);

  // Focus active slide
  const focusSlide = (index: number) => {
    setActiveSlide(index);
    const el = canvasRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const targetX = index * (SLIDE_W + SLIDE_GAP);
    const targetZoom = Math.min(cw / (SLIDE_W + 120), ch / (SLIDE_H + 120), 1.2);
    setZoom(targetZoom);
    setPan({
      x: cw / 2 - (targetX + SLIDE_W / 2) * targetZoom,
      y: ch / 2 - (SLIDE_H / 2) * targetZoom,
    });
  };

  // ── Chat / send ──
  const handleInputChange = (v: string) => {
    setInput(v);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  const sendMessage = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isRunning) return;
    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: "user", text }]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsRunning(true);
    runWorkflow(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  function runWorkflow(_prompt: string) {
    setSteps(INITIAL_STEPS);
    const delays = [600, 1600, 2800, 4000, 5200, 6200, 7400];
    delays.forEach((d, i) => {
      setTimeout(() => {
        setSteps((prev) => prev.map((s) => {
          if (s.id === i + 1) return { ...s, status: "running" };
          if (s.id < i + 1) return { ...s, status: "completed" };
          return s;
        }));
      }, d);
    });
    const aiMsgs = [
      { d: 700,  t: `Got it — analyzing your brief and locking in the structure.` },
      { d: 2000, t: "Outline ready. 7 slides: title, 4 content, comparison, and Q&A." },
      { d: 3600, t: "3 sources found and compacted for slide generation." },
      { d: 5000, t: "Slides drafted and speaker notes added." },
      { d: 7200, t: "Your deck is ready. Export as PPTX or PDF whenever you like." },
    ];
    aiMsgs.forEach(({ d, t }) => {
      setTimeout(() => {
        setMessages((p) => [...p, { id: `a-${Date.now()}-${d}`, role: "assistant", text: t }]);
      }, d);
    });
    setTimeout(() => {
      setSteps((p) => p.map((s) => ({ ...s, status: "completed" })));
      setIsRunning(false);
    }, 8200);
  }

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const runningStep = steps.find((s) => s.status === "running");

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">

      {/* ─ Header ─ */}
      <AppHeader
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      {/* ─ Body — sits below header (min-h-16 = 64px) ─ */}
      <div className="flex overflow-hidden" style={{ marginTop: 64 + "px", height: "calc(100vh - 64px)" }}>

        {/* ══════════════════════════════
            SIDEBAR
        ══════════════════════════════ */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0f0f0f]">

          {/* Sidebar head */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white leading-none">OctopilotSlides</p>
              <p className="text-[11px] text-white/30 mt-0.5 leading-none truncate">
                {isRunning && runningStep
                  ? runningStep.title
                  : completedCount > 0
                  ? `${completedCount} / ${steps.length} steps done`
                  : "Ready to build your deck"}
              </p>
            </div>
            {/* Progress ring */}
            {(isRunning || completedCount > 0) && (
              <div className="relative h-8 w-8 shrink-0">
                <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2.5" />
                  <circle cx="16" cy="16" r="12" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 12}`}
                    strokeDashoffset={`${2 * Math.PI * 12 * (1 - progressPct / 100)}`}
                    className="transition-all duration-500"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-red-400">
                  {progressPct}
                </span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-4 shrink-0">
            {(["workflow", "sources"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`relative pb-2 pt-2.5 text-[12px] font-medium capitalize mr-5 transition-colors ${sidebarTab === tab ? "text-white" : "text-white/30 hover:text-white/60"}`}
              >
                {tab}
                {sidebarTab === tab && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-red-500" />}
              </button>
            ))}
          </div>

          {/* Workflow tab */}
          {sidebarTab === "workflow" && (
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-all ${
                    step.status === "running"
                      ? "bg-red-500/[0.06]"
                      : step.status === "completed"
                      ? "opacity-60"
                      : "opacity-30"
                  }`}
                >
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    <StepIcon status={step.status} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[12.5px] font-medium leading-snug ${
                      step.status === "running" ? "text-white" : "text-white/70"
                    }`}>
                      {step.title}
                    </p>
                    {(step.status === "running" || step.status === "completed") && (
                      <p className="text-[11px] text-white/30 mt-0.5">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sources tab */}
          {sidebarTab === "sources" && (
            <div className="flex-1 overflow-y-auto px-3 py-2.5">
              {completedCount >= 3 ? (
                <div className="space-y-2">
                  {[
                    { title: "Wikipedia", sub: "Background & overview", url: "en.wikipedia.org" },
                    { title: "Britannica", sub: "Encyclopedia entry",   url: "britannica.com" },
                    { title: "Academic Journal", sub: "Peer-reviewed",  url: "scholar.google.com" },
                  ].map((src, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.07] p-3 hover:border-white/15 transition-colors">
                      <p className="text-[12.5px] font-medium text-white/80">{src.title}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">{src.sub}</p>
                      <p className="text-[10px] text-red-500/60 mt-1 font-mono truncate">{src.url}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-white/[0.03] flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                  </div>
                  <p className="text-[12px] text-white/20 max-w-[200px]">Sources appear after the research step completes.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Chat ── */}
          <div className="border-t border-white/[0.06] flex flex-col shrink-0">
            {/* Messages */}
            <div className="flex max-h-48 flex-col gap-2 overflow-y-auto px-3 py-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 text-[12.5px] leading-relaxed ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  style={{ animation: "slideUp 0.2s ease-out" }}
                >
                  {msg.role === "assistant" && (
                    <div className="h-5 w-5 shrink-0 rounded-full bg-red-500/15 flex items-center justify-center mt-0.5">
                      <Image src="/OCTOPILOT.png" alt="AI" width={11} height={11} className="opacity-80" />
                    </div>
                  )}
                  <div className={`max-w-[84%] rounded-2xl px-3 py-2 ${
                    msg.role === "assistant"
                      ? "bg-white/[0.04] text-white/70 rounded-tl-sm"
                      : "bg-red-500/20 text-white/90 rounded-tr-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="px-3 pb-3">
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:border-red-500/30 transition-colors">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRunning ? "Working on your deck…" : "Describe your presentation…"}
                  disabled={isRunning}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder-white/20 outline-none min-h-[22px] max-h-[140px] disabled:opacity-40 leading-relaxed"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isRunning}
                  className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 transition-all hover:bg-red-400 disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-white/12">Enter to send · Shift+Enter for new line</p>
            </form>
          </div>
        </aside>

        {/* ══════════════════════════════
            MAIN CANVAS
        ══════════════════════════════ */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Canvas toolbar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a] px-4 py-2 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-[11.5px] text-white/25 font-mono tabular-nums">
                Slide {activeSlide + 1} / {slides.length}
              </span>
              <div className="h-3 w-px bg-white/[0.06]" />
              <span className="text-[12px] text-white/50 font-medium truncate max-w-[200px]">
                {slides[activeSlide]?.title ?? "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1">
                <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
                  className="h-5 w-5 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors text-base leading-none">
                  −
                </button>
                <span className="text-[11px] text-white/40 font-mono w-9 text-center tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
                  className="h-5 w-5 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors text-base leading-none">
                  +
                </button>
              </div>

              <button onClick={fitView}
                className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-white/40 hover:text-white/70 hover:border-white/15 transition-all">
                Fit
              </button>

              {/* Theme */}
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 cursor-default select-none">
                <div className="h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-black to-red-900 shrink-0" />
                <span className="text-[11.5px] text-white/35">Red Dark</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/20 ml-0.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              {/* Export */}
              <button className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-400 shadow-[0_0_16px_rgba(239,68,68,0.3)]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
            </div>
          </div>

          {/* ── Infinite canvas ── */}
          <div
            ref={canvasRef}
            className="flex-1 overflow-hidden relative select-none"
            style={{ cursor: dragging.current ? "grabbing" : "grab" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Dot-grid background */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)`,
                backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
                backgroundPosition: `${pan.x % (28 * zoom)}px ${pan.y % (28 * zoom)}px`,
              }}
            />

            {/* Transform layer */}
            <div
              className="absolute top-0 left-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: "transform",
              }}
            >
              {slides.map((slide, i) => {
                const x = i * (SLIDE_W + SLIDE_GAP);
                const isActive = activeSlide === i;
                return (
                  <div
                    key={slide.id}
                    data-slide="true"
                    className="absolute cursor-pointer"
                    style={{ left: x, top: 0, width: SLIDE_W, height: SLIDE_H }}
                    onClick={(e) => { e.stopPropagation(); focusSlide(i); }}
                  >
                    {/* Slide frame */}
                    <div
                      className="w-full h-full overflow-hidden transition-[box-shadow] duration-200"
                      style={{
                        boxShadow: isActive
                          ? "0 0 0 3px #ef4444, 0 24px 80px rgba(0,0,0,0.8)"
                          : "0 0 0 1px rgba(255,255,255,0.08), 0 12px 48px rgba(0,0,0,0.7)",
                        borderRadius: 6,
                      }}
                    >
                      <SlideCanvas slide={slide} />
                    </div>

                    {/* Slide number label */}
                    <div className="absolute -bottom-8 left-0 text-[11px] font-mono text-white/25 select-none">
                      {i + 1}
                    </div>

                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Canvas hint */}
            <div className="absolute bottom-4 right-4 pointer-events-none">
              <p className="text-[10.5px] text-white/15 text-right">
                Scroll to pan · Ctrl + scroll to zoom · Click slide to focus
              </p>
            </div>
          </div>

          {/* ── Thumbnail strip ── */}
          <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0a0a]">
            <div className="flex items-center gap-2.5 overflow-x-auto px-4 py-2.5">
              {slides.map((slide, i) => {
                const isActive = activeSlide === i;
                return (
                  <button
                    key={slide.id}
                    onClick={() => focusSlide(i)}
                    className="group relative shrink-0 flex flex-col items-start gap-1 transition-all"
                  >
                    <div
                      className="relative overflow-hidden transition-all duration-200"
                      style={{
                        width: 96,
                        height: 54,
                        borderRadius: 4,
                        boxShadow: isActive
                          ? "0 0 0 2px #ef4444"
                          : "0 0 0 1px rgba(255,255,255,0.07)",
                        opacity: isActive ? 1 : 0.45,
                      }}
                    >
                      {/* Scaled mini preview */}
                      <div
                        className="absolute top-0 left-0 pointer-events-none"
                        style={{
                          width: SLIDE_W,
                          height: SLIDE_H,
                          transform: `scale(${96 / SLIDE_W})`,
                          transformOrigin: "0 0",
                        }}
                      >
                        <SlideCanvas slide={slide} />
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono pl-0.5 ${isActive ? "text-red-400" : "text-white/20"}`}>
                      {i + 1}
                    </span>
                  </button>
                );
              })}

              {/* Add slide */}
              <button className="shrink-0 flex flex-col items-center justify-center gap-1" style={{ width: 96, height: 54 }}>
                <div
                  className="flex items-center justify-center text-white/20 hover:text-white/40 border border-dashed border-white/[0.09] hover:border-white/20 transition-all"
                  style={{ width: 96, height: 54, borderRadius: 4 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 5v14" /><path d="M5 12h14" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
