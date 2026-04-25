"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";
import Image from "next/image";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";

// ─── Types ────────────────────────────────────────────────────────────────────

type OctopilotSlidesViewProps = {
  onBack: () => void;
};

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
  ts: number;
};

type Slide = {
  id: number;
  title: string;
  body: string;
  layout: "title" | "content" | "two-col" | "blank";
};

// ─── Initial data ─────────────────────────────────────────────────────────────

const INITIAL_STEPS: WorkflowStep[] = [
  { id: 1, title: "Analyze topic",       detail: "Parsing the brief and locking in scope.",         status: "pending" },
  { id: 2, title: "Build outline",       detail: "Structuring slides section by section.",           status: "pending" },
  { id: 3, title: "Research sources",    detail: "Searching for relevant, citable content.",         status: "pending" },
  { id: 4, title: "Generate slides",     detail: "Writing content for each slide.",                  status: "pending" },
  { id: 5, title: "Add speaker notes",   detail: "Drafting presenter notes per slide.",              status: "pending" },
  { id: 6, title: "Apply theme",         detail: "Styling slides with the selected theme.",          status: "pending" },
  { id: 7, title: "Export deck",         detail: "Packaging the final PPTX / PDF.",                  status: "pending" },
];

const PLACEHOLDER_SLIDES: Slide[] = [
  { id: 1, layout: "title",   title: "Your Presentation Title",    body: "Subtitle goes here — author name · date" },
  { id: 2, layout: "content", title: "Introduction",               body: "Overview of the topic and key talking points. This slide sets context for the audience." },
  { id: 3, layout: "content", title: "Key Finding #1",             body: "Main insight with supporting evidence. Numbers, stats, or a compelling data point live here." },
  { id: 4, layout: "two-col", title: "Compare & Contrast",         body: "Left column argument | Right column counter-argument. Side-by-side layout for clarity." },
  { id: 5, layout: "content", title: "Key Finding #2",             body: "Second major insight. Build on slide 3 — connect the dots for your audience." },
  { id: 6, layout: "content", title: "Conclusion",                 body: "Summary of takeaways and a clear call to action. What should the audience do next?" },
  { id: 7, layout: "blank",   title: "Q & A",                     body: "Thank you. Questions welcome." },
];

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hi! I'm ready to build your slide deck. Tell me the topic, target audience, and how many slides you need — I'll handle the rest.",
  ts: Date.now(),
};

// ─── Small helpers ─────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <span className="absolute h-3.5 w-3.5 animate-ping rounded-full bg-violet-400 opacity-40" />
        <span className="h-2 w-2 rounded-full bg-violet-400" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
      </svg>
    );
  }
  // pending
  return <span className="h-2 w-2 rounded-full bg-white/15 shrink-0" />;
}

function SlidePreview({ slide, isActive }: { slide: Slide; isActive: boolean }) {
  const base = "w-full h-full rounded-sm flex flex-col overflow-hidden bg-white";

  if (slide.layout === "title") {
    return (
      <div className={base + " items-center justify-center gap-2 p-6 bg-gradient-to-br from-slate-900 to-slate-700"}>
        <div className="h-0.5 w-12 bg-violet-400 mb-3" />
        <h2 className="text-center text-lg font-bold text-white leading-snug">{slide.title}</h2>
        <p className="text-center text-xs text-white/50 mt-1">{slide.body}</p>
      </div>
    );
  }

  if (slide.layout === "two-col") {
    const [left, right] = slide.body.split("|");
    return (
      <div className={base + " p-5"}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">{slide.title}</h3>
        <div className="flex flex-1 gap-4">
          <div className="flex-1 rounded bg-slate-50 p-3 text-[10px] text-slate-600 leading-relaxed">{left?.trim()}</div>
          <div className="flex-1 rounded bg-slate-50 p-3 text-[10px] text-slate-600 leading-relaxed">{right?.trim()}</div>
        </div>
      </div>
    );
  }

  if (slide.layout === "blank") {
    return (
      <div className={base + " items-center justify-center bg-slate-900"}>
        <p className="text-xl font-bold text-white/80">{slide.title}</p>
        <p className="text-xs text-white/30 mt-1">{slide.body}</p>
      </div>
    );
  }

  // content
  return (
    <div className={base + " p-5"}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-4 w-1 rounded-full bg-violet-500" />
        <h3 className="text-sm font-semibold text-slate-800">{slide.title}</h3>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{slide.body}</p>
      {/* Fake bullet lines */}
      <div className="mt-4 flex flex-col gap-2">
        {[60, 80, 45].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-violet-400" />
            <div className="h-1.5 rounded-full bg-slate-100" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideThumb({ slide, index, isActive, onClick }: {
  slide: Slide;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative shrink-0 flex flex-col items-start gap-1.5 transition-all ${isActive ? "opacity-100" : "opacity-50 hover:opacity-80"}`}
    >
      <div
        className={`relative w-28 overflow-hidden rounded border transition-all ${
          isActive ? "border-violet-500 shadow-md shadow-violet-500/20" : "border-white/[0.07] hover:border-white/20"
        }`}
        style={{ aspectRatio: "16/9" }}
      >
        {/* Mini slide preview */}
        <div className="absolute inset-0 scale-[0.28] origin-top-left" style={{ width: "357%", height: "357%" }}>
          <SlidePreview slide={slide} isActive={false} />
        </div>
      </div>
      <span className="text-[10px] text-white/30 pl-0.5">{index + 1}</span>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OctopilotSlidesView({ onBack }: OctopilotSlidesViewProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [slides] = useState<Slide[]>(PLACEHOLDER_SLIDES);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"workflow" | "sources">("workflow");
  const [sourcesPanelOpen, setSourcesPanelOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (v: string) => {
    setInput(v);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const sendMessage = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isRunning) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Simulate agentic workflow
    setIsRunning(true);
    simulateWorkflow(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  function simulateWorkflow(userPrompt: string) {
    // Reset steps
    setSteps(INITIAL_STEPS);

    // Simulate step-by-step progression
    const delays = [800, 1800, 3000, 4400, 5600, 6600, 7800];

    delays.forEach((delay, i) => {
      setTimeout(() => {
        setSteps((prev) =>
          prev.map((s) => {
            if (s.id === i + 1) return { ...s, status: "running" };
            if (s.id < i + 1) return { ...s, status: "completed" };
            return s;
          })
        );
      }, delay);
    });

    // AI thinking messages
    const aiMessages = [
      { delay: 900,  text: `Got it — analyzing your brief: "${userPrompt.slice(0, 60)}${userPrompt.length > 60 ? "…" : ""}"` },
      { delay: 2200, text: "Outline ready. 7 slides structured — title, 4 content, comparison, and Q&A." },
      { delay: 3800, text: "Found 3 relevant sources. Compacting content for slide generation." },
      { delay: 5200, text: "Slides drafted. Adding speaker notes now." },
      { delay: 7200, text: "Theme applied. Your deck is ready — you can export it as PPTX or PDF." },
    ];

    aiMessages.forEach(({ delay, text }) => {
      setTimeout(() => {
        setMessages((prev) => [...prev, { id: `a-${Date.now()}-${delay}`, role: "assistant", text, ts: Date.now() }]);
      }, delay);
    });

    // Complete all steps
    setTimeout(() => {
      setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
      setIsRunning(false);
    }, 8600);
  }

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const runningStep = steps.find((s) => s.status === "running");

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── Header ── */}
      <AppHeader
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden pt-[52px]">

        {/* ════════════════════════════════
            LEFT SIDEBAR
        ════════════════════════════════ */}
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-white/[0.06] bg-[#111111]">

          {/* Sidebar header */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white leading-none">OctopilotSlides</p>
              <p className="text-[11px] text-white/30 mt-0.5 leading-none truncate">
                {isRunning && runningStep ? runningStep.title : completedCount > 0 ? `${completedCount}/${steps.length} steps complete` : "Ready to build your deck"}
              </p>
            </div>
            {/* Progress ring */}
            {isRunning && (
              <div className="relative h-8 w-8 shrink-0">
                <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                  <circle
                    cx="16" cy="16" r="12" fill="none"
                    stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 12}`}
                    strokeDashoffset={`${2 * Math.PI * 12 * (1 - progressPct / 100)}`}
                    className="transition-all duration-500"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-violet-400">
                  {progressPct}
                </span>
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-white/[0.06] px-4">
            {(["workflow", "sources"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`relative pb-2.5 pt-2 text-[12px] font-medium capitalize mr-5 transition-colors ${
                  sidebarTab === tab ? "text-white" : "text-white/35 hover:text-white/60"
                }`}
              >
                {tab}
                {sidebarTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-violet-500" />
                )}
              </button>
            ))}
          </div>

          {/* ── Workflow tab ── */}
          {sidebarTab === "workflow" && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scrollbar-thin">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors ${
                    step.status === "running"
                      ? "bg-violet-500/[0.07]"
                      : step.status === "completed"
                      ? "opacity-70"
                      : "opacity-40"
                  }`}
                >
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    <StepIcon status={step.status} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[12.5px] font-medium leading-snug ${
                      step.status === "running" ? "text-white" : step.status === "completed" ? "text-white/70" : "text-white/35"
                    }`}>
                      {step.title}
                    </p>
                    {(step.status === "running" || step.status === "completed") && (
                      <p className="text-[11px] text-white/30 mt-0.5 leading-snug">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Sources tab ── */}
          {sidebarTab === "sources" && (
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {completedCount >= 3 ? (
                  <>
                    {[
                      { title: "Wikipedia", subtitle: "Background & overview", url: "en.wikipedia.org" },
                      { title: "Britannica", subtitle: "Encyclopedia entry", url: "britannica.com" },
                      { title: "Academic Journal", subtitle: "Peer-reviewed source", url: "scholar.google.com" },
                    ].map((src, i) => (
                      <div key={i} className="rounded-lg border border-white/[0.07] p-3 hover:border-white/15 transition-colors cursor-default">
                        <p className="text-[12.5px] font-medium text-white/80 leading-snug">{src.title}</p>
                        <p className="text-[11px] text-white/35 mt-0.5">{src.subtitle}</p>
                        <p className="text-[10px] text-violet-400/60 mt-1 font-mono truncate">{src.url}</p>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-white/[0.04] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                      </svg>
                    </div>
                    <p className="text-[12px] text-white/20">Sources will appear here once research completes.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Chat messages ── */}
          <div className="flex flex-col border-t border-white/[0.06]">
            {/* Messages */}
            <div className="flex max-h-52 flex-col gap-2 overflow-y-auto px-3 py-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 text-[12.5px] leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-5 w-5 shrink-0 rounded-full bg-violet-500/20 flex items-center justify-center mt-0.5">
                      <Image src="/OCTOPILOT.png" alt="AI" width={12} height={12} className="opacity-80" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 ${
                      msg.role === "assistant"
                        ? "bg-white/[0.04] text-white/75"
                        : "bg-violet-500/20 text-violet-100 rounded-tr-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="px-3 pb-3">
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2 focus-within:border-violet-500/40 transition-colors">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRunning ? "Working on your deck…" : "Describe your presentation…"}
                  disabled={isRunning}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder-white/20 outline-none min-h-[22px] max-h-[160px] disabled:opacity-40 leading-relaxed"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isRunning}
                  className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 transition-all hover:bg-violet-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10.5px] text-white/15">
                Enter to send · Shift+Enter for new line
              </p>
            </form>
          </div>
        </aside>

        {/* ════════════════════════════════
            MAIN CANVAS
        ════════════════════════════════ */}
        <main className="flex flex-1 flex-col overflow-hidden">

          {/* Canvas toolbar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-white/30 font-mono">
                {activeSlide + 1} / {slides.length}
              </span>
              <div className="h-3.5 w-px bg-white/[0.07]" />
              <span className="text-[12px] text-white/50 font-medium">
                {slides[activeSlide]?.title ?? "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Theme picker stub */}
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 cursor-default">
                <div className="h-3 w-3 rounded-sm bg-gradient-to-br from-slate-700 to-slate-900" />
                <span className="text-[11.5px] text-white/40">Dark Pro</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/25 ml-0.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              {/* Export button */}
              <button className="flex items-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3.5 py-1.5 text-[12px] font-medium text-violet-300 transition-all hover:bg-violet-500/20">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
            </div>
          </div>

          {/* Slide area */}
          <div className="flex flex-1 flex-col overflow-hidden">

            {/* Active slide preview */}
            <div className="flex flex-1 items-center justify-center p-8 overflow-hidden">
              <div
                className="w-full max-w-3xl rounded-xl shadow-2xl shadow-black/60 overflow-hidden ring-1 ring-white/[0.08] transition-all duration-300"
                style={{ aspectRatio: "16/9" }}
              >
                {slides[activeSlide] && (
                  <SlidePreview slide={slides[activeSlide]} isActive={true} />
                )}
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="border-t border-white/[0.06] bg-[#0e0e0e]">
              <div className="flex items-center gap-3 overflow-x-auto px-5 py-3 scrollbar-thin">
                {slides.map((slide, i) => (
                  <SlideThumb
                    key={slide.id}
                    slide={slide}
                    index={i}
                    isActive={activeSlide === i}
                    onClick={() => setActiveSlide(i)}
                  />
                ))}

                {/* Add slide button */}
                <button className="shrink-0 flex h-[63px] w-28 items-center justify-center rounded border border-dashed border-white/[0.1] text-white/20 hover:border-white/25 hover:text-white/40 transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" /><path d="M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
