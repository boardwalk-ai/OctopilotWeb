"use client";

import {
  useEffect, useRef, useState,
  FormEvent, KeyboardEvent, useCallback,
} from "react";
import Image from "next/image";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";
import { SlideCanvas, SlideThumbnail, PropertyPanel } from "@/components/slides";
import { getThemeByName, type SlideSpec, type DeckTheme, type AgentQuestion, type SlidesSSEEvent } from "@/types/slides";
import { SlidesAgentClient } from "@/services/SlidesAgentClient";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";

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

// ─── Constants ─────────────────────────────────────────────────────────────────

const SLIDE_W = 880;
const SLIDE_H = 495;
const SLIDE_GAP = 72;

const INITIAL_STEPS: WorkflowStep[] = [
  { id: 1, title: "Analyze topic",    detail: "Parsing the brief and locking in scope.",      status: "pending" },
  { id: 2, title: "Choose theme",     detail: "Picking the best color voice for your deck.",  status: "pending" },
  { id: 3, title: "Build outline",    detail: "Structuring slides section by section.",        status: "pending" },
  { id: 4, title: "Research sources", detail: "Searching for relevant, citable content.",      status: "pending" },
  { id: 5, title: "Generate slides",  detail: "Writing and designing each slide.",             status: "pending" },
  { id: 6, title: "Speaker notes",    detail: "Drafting presenter notes per slide.",           status: "pending" },
  { id: 7, title: "Export deck",      detail: "Packaging the final PPTX.",                    status: "pending" },
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hi! Tell me your topic, target audience, and tone — I'll design the rest.",
};

// ─── Demo slides (real SlideSpec — showcasing the renderer) ───────────────────

const DEMO_THEME: DeckTheme = getThemeByName("ember + charcoal + black")!;

const DEMO_SLIDES: SlideSpec[] = [
  // 1 — THE_HERO (Title)
  {
    id: "slide_001", position: 1, layout: "hero",
    archetype: "THE_HERO",
    designIntent: "First impression — bold, confident, dark-studio feel",
    background: { type: "solid", color: "#0f0f0f" },
    speakerNotes: "Opening slide — set the tone.",
    elements: [
      { id: "slide_001_shape_accent", type: "shape", shape: "rectangle",
        position: { x: 6, y: 38, w: 0.5, h: 20 },
        style: { fill: "#f97316", opacity: 1 } },
      { id: "slide_001_title", type: "text", variant: "title",
        content: "OctopilotSlides",
        position: { x: 9, y: 36, w: 72, h: 24 },
        style: { fontSize: 64, fontWeight: 800, fontFamily: "Inter", color: "#ffffff", align: "left" } },
      { id: "slide_001_subtitle", type: "text", variant: "subtitle",
        content: "AI-Designed Presentations",
        position: { x: 9, y: 62, w: 55, h: 12 },
        style: { fontSize: 20, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "left", opacity: 0.45 } },
      { id: "slide_001_caption", type: "text", variant: "caption",
        content: "Everything customizable · AI assist",
        position: { x: 9, y: 78, w: 45, h: 8 },
        style: { fontSize: 13, fontWeight: 400, fontFamily: "Inter", color: "#f97316", align: "left", opacity: 0.8 } },
    ],
  },

  // 2 — THE_DATA_HERO (Stat)
  {
    id: "slide_002", position: 2, layout: "hero",
    archetype: "THE_DATA_HERO",
    designIntent: "Let the number own the slide — make the viewer feel the scale",
    background: { type: "solid", color: "#0f0f0f" },
    elements: [
      { id: "slide_002_shape_bg", type: "shape", shape: "circle",
        position: { x: 20, y: -15, w: 80, h: 130 },
        style: { fill: "#ffffff", opacity: 0.025 } },
      { id: "slide_002_stat_1", type: "text", variant: "stat",
        content: "73%",
        position: { x: 5, y: 15, w: 90, h: 50 },
        style: { fontSize: 108, fontWeight: 900, fontFamily: "Inter", color: "#f97316", align: "center" } },
      { id: "slide_002_body_1", type: "text", variant: "body",
        content: "of presentations built with AI get redesigned by users within 48 hours",
        position: { x: 12, y: 63, w: 76, h: 18 },
        style: { fontSize: 17, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "center", opacity: 0.5, lineHeight: 1.5 } },
      { id: "slide_002_caption", type: "text", variant: "caption",
        content: "Based on 2,400 OctopilotSlides beta users · 2026",
        position: { x: 20, y: 83, w: 60, h: 8 },
        style: { fontSize: 12, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "center", opacity: 0.25 } },
    ],
  },

  // 3 — THE_EDITORIAL (Content + bleed)
  {
    id: "slide_003", position: 3, layout: "split",
    archetype: "THE_EDITORIAL",
    designIntent: "Design intelligence — show the AI thinks, it doesn't just fill",
    background: { type: "solid", color: "#111111" },
    elements: [
      { id: "slide_003_shape_image", type: "shape", shape: "rectangle",
        position: { x: 52, y: 0, w: 52, h: 100 },
        style: { fill: "#1a2233", opacity: 1 } },
      { id: "slide_003_shape_overlay", type: "shape", shape: "rectangle",
        position: { x: 52, y: 0, w: 52, h: 100 },
        style: { fill: "#f97316", opacity: 0.06 } },
      { id: "slide_003_shape_accent", type: "shape", shape: "rectangle",
        position: { x: 6, y: 20, w: 0.45, h: 22 },
        style: { fill: "#f97316", opacity: 1 } },
      { id: "slide_003_title", type: "text", variant: "title",
        content: "Design\nIntelligence",
        position: { x: 8, y: 18, w: 42, h: 28 },
        style: { fontSize: 42, fontWeight: 800, fontFamily: "Inter", color: "#ffffff", align: "left", lineHeight: 1.15 } },
      { id: "slide_003_body_1", type: "text", variant: "body",
        content: "The AI picks archetypes, applies visual hierarchy, and makes bold choices — not safe ones.\n\nEvery slide earns its place or gets cut.",
        position: { x: 8, y: 52, w: 41, h: 34 },
        style: { fontSize: 15, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "left", opacity: 0.55, lineHeight: 1.65 } },
    ],
  },

  // 4 — THE_BREATH (Quote)
  {
    id: "slide_004", position: 4, layout: "blank",
    archetype: "THE_BREATH",
    designIntent: "Pause — let the quote land. Maximum weight through emptiness.",
    background: { type: "solid", color: "#0f0f0f" },
    elements: [
      { id: "slide_004_shape_bg", type: "shape", shape: "circle",
        position: { x: 15, y: -30, w: 70, h: 160 },
        style: { fill: "#ffffff", opacity: 0.02 } },
      { id: "slide_004_shape_bar", type: "shape", shape: "rectangle",
        position: { x: 48.7, y: 28, w: 0.45, h: 44 },
        style: { fill: "#f97316", opacity: 1 } },
      { id: "slide_004_quote", type: "text", variant: "quote",
        content: "Flashy doesn't mean busy.\nIt means intentional drama.",
        position: { x: 15, y: 28, w: 70, h: 44 },
        style: { fontSize: 30, fontWeight: 600, fontFamily: "Inter", color: "#ffffff", align: "center", lineHeight: 1.45, italic: true } },
    ],
  },

  // 5 — THE_GRID (Features)
  {
    id: "slide_005", position: 5, layout: "columns",
    archetype: "THE_GRID",
    designIntent: "3 features — systematic, confident, credible",
    background: { type: "solid", color: "#0f0f0f" },
    elements: [
      { id: "slide_005_title", type: "text", variant: "title",
        content: "What makes it frontier",
        position: { x: 8, y: 9, w: 84, h: 13 },
        style: { fontSize: 32, fontWeight: 700, fontFamily: "Inter", color: "#ffffff", align: "left" } },
      { id: "slide_005_shape_div", type: "shape", shape: "line",
        position: { x: 8, y: 24, w: 84, h: 0.3 },
        style: { fill: "#ffffff", stroke: "#ffffff", strokeWidth: 1, opacity: 0.08 } },
      // Column 1
      { id: "slide_005_shape_1", type: "shape", shape: "rectangle",
        position: { x: 8, y: 32, w: 25, h: 42 },
        style: { fill: "#1a1a1a", cornerRadius: 8 } },
      { id: "slide_005_label_1", type: "text", variant: "label",
        content: "01",
        position: { x: 11, y: 34, w: 19, h: 10 },
        style: { fontSize: 20, fontWeight: 800, fontFamily: "Inter", color: "#f97316", align: "left" } },
      { id: "slide_005_body_1", type: "text", variant: "body",
        content: "Agentic AI\nDesigner",
        position: { x: 11, y: 47, w: 20, h: 12 },
        style: { fontSize: 16, fontWeight: 700, fontFamily: "Inter", color: "#ffffff", align: "left", lineHeight: 1.3 } },
      { id: "slide_005_caption_1", type: "text", variant: "caption",
        content: "Plans, researches, designs every slide from scratch",
        position: { x: 11, y: 62, w: 20, h: 10 },
        style: { fontSize: 12, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "left", opacity: 0.4, lineHeight: 1.5 } },
      // Column 2
      { id: "slide_005_shape_2", type: "shape", shape: "rectangle",
        position: { x: 37.5, y: 32, w: 25, h: 42 },
        style: { fill: "#1a1a1a", cornerRadius: 8 } },
      { id: "slide_005_label_2", type: "text", variant: "label",
        content: "02",
        position: { x: 40.5, y: 34, w: 19, h: 10 },
        style: { fontSize: 20, fontWeight: 800, fontFamily: "Inter", color: "#f97316", align: "left" } },
      { id: "slide_005_body_2", type: "text", variant: "body",
        content: "Morph\nNarrative",
        position: { x: 40.5, y: 47, w: 20, h: 12 },
        style: { fontSize: 16, fontWeight: 700, fontFamily: "Inter", color: "#ffffff", align: "left", lineHeight: 1.3 } },
      { id: "slide_005_caption_2", type: "text", variant: "caption",
        content: "Shapes morph across slides — visual story without extra work",
        position: { x: 40.5, y: 62, w: 20, h: 10 },
        style: { fontSize: 12, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "left", opacity: 0.4, lineHeight: 1.5 } },
      // Column 3
      { id: "slide_005_shape_3", type: "shape", shape: "rectangle",
        position: { x: 67, y: 32, w: 25, h: 42 },
        style: { fill: "#1a1a1a", cornerRadius: 8 } },
      { id: "slide_005_label_3", type: "text", variant: "label",
        content: "03",
        position: { x: 70, y: 34, w: 19, h: 10 },
        style: { fontSize: 20, fontWeight: 800, fontFamily: "Inter", color: "#f97316", align: "left" } },
      { id: "slide_005_body_3", type: "text", variant: "body",
        content: "Full PPTX\nFidelity",
        position: { x: 70, y: 47, w: 20, h: 12 },
        style: { fontSize: 16, fontWeight: 700, fontFamily: "Inter", color: "#ffffff", align: "left", lineHeight: 1.3 } },
      { id: "slide_005_caption_3", type: "text", variant: "caption",
        content: "Animations, Morph, transitions — all intact in PowerPoint",
        position: { x: 70, y: 62, w: 20, h: 10 },
        style: { fontSize: 12, fontWeight: 400, fontFamily: "Inter", color: "#ffffff", align: "left", opacity: 0.4, lineHeight: 1.5 } },
    ],
  },

  // 6 — THE_TYPOGRAPHIC (CTA close)
  {
    id: "slide_006", position: 6, layout: "blank",
    archetype: "THE_TYPOGRAPHIC",
    designIntent: "Close with conviction — type as design, one message",
    background: { type: "solid", color: "#0f0f0f" },
    elements: [
      { id: "slide_006_shape_accent", type: "shape", shape: "rectangle",
        position: { x: 8, y: 34, w: 0.45, h: 32 },
        style: { fill: "#f97316", opacity: 1 } },
      { id: "slide_006_title", type: "text", variant: "title",
        content: "Build something\nworth watching.",
        position: { x: 11, y: 30, w: 78, h: 40 },
        style: { fontSize: 52, fontWeight: 800, fontFamily: "Inter", color: "#ffffff", align: "left", lineHeight: 1.2 } },
      { id: "slide_006_caption", type: "text", variant: "caption",
        content: "OctopilotSlides · octopilotai.com",
        position: { x: 11, y: 76, w: 50, h: 8 },
        style: { fontSize: 13, fontWeight: 400, fontFamily: "Inter", color: "#f97316", align: "left", opacity: 0.7 } },
    ],
  },
];

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
  const [slides, setSlides] = useState<SlideSpec[]>(DEMO_SLIDES);
  const [theme, setTheme] = useState<DeckTheme>(DEMO_THEME);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"workflow" | "sources">("workflow");
  const [canvasMode, setCanvasMode] = useState<"h" | "v">("h");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<AgentQuestion | null>(null);

  // ── Canvas pan / zoom state ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [zoom, setZoom] = useState(0.55);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const runHandleRef = useRef<null | { close: () => void; getRunId: () => string }>(null);
  const workflowIndexRef = useRef(0);

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
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mouse drag — only in H mode
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || canvasMode !== "h") return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-slide-canvas]")) return;
    dragging.current = true;
    setIsDragging(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [canvasMode]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

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

  useEffect(() => { fitView(); }, [fitView]);

  const focusSlide = useCallback((index: number) => {
    setActiveSlide(index);
    setSelectedElementId(null);
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
  }, []);

  // Keyboard shortcut H / V
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "h" || e.key === "H") { setCanvasMode("h"); setSelectedElementId(null); }
      if (e.key === "v" || e.key === "V") setCanvasMode("v");
      if (e.key === "Escape") { setCanvasMode("h"); setSelectedElementId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

    if (pendingQuestion) {
      const runId = runHandleRef.current?.getRunId() || "";
      if (!runId) {
        setMessages((p) => [
          ...p,
          { id: `a-${Date.now()}`, role: "assistant", text: "Run is not ready yet — please retry in a moment." },
        ]);
        return;
      }

      setIsRunning(true);
      setPendingQuestion(null);
      void SlidesAgentClient.answer(runId, pendingQuestion.field, text)
        .catch((err) => {
          setIsRunning(false);
          setMessages((p) => [
            ...p,
            { id: `a-${Date.now()}`, role: "assistant", text: err instanceof Error ? err.message : "Could not submit answer." },
          ]);
        });
      return;
    }

    setIsRunning(true);
    runWorkflow(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  function runWorkflow(prompt: string) {
    runHandleRef.current?.close();
    runHandleRef.current = null;

    workflowIndexRef.current = 0;
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));
    setSlides([]);
    setTheme(DEMO_THEME);
    setActiveSlide(0);
    setSelectedElementId(null);
    setPendingQuestion(null);
    setSidebarTab("workflow");

    const handleEvent = (ev: SlidesSSEEvent) => {
      if (ev.type === "workflow_step" && ev.stepId !== "run_id") {
        setSteps((prev) => {
          const next = [...prev];
          const idx = workflowIndexRef.current;
          if (idx < next.length) {
            const status: StepStatus =
              ev.status === "done" ? "completed" : ev.status === "error" ? "error" : "running";
            next[idx] = { ...next[idx], status, detail: ev.detail ?? next[idx].detail };
            if (ev.status === "done") workflowIndexRef.current = Math.min(next.length, idx + 1);
          }
          return next;
        });
      }

      if (ev.type === "theme_set") {
        setTheme(ev.theme);
      }

      if (ev.type === "slide_created") {
        setSlides((prev) => {
          if (prev.some((s) => s.id === ev.id)) return prev;
          const blank: SlideSpec = {
            id: ev.id,
            position: ev.position,
            layout: "blank",
            archetype: "THE_BREATH",
            designIntent: "Blank slide.",
            background: { type: "solid", color: DEMO_THEME.palette.background },
            elements: [],
          };
          return [...prev, blank].sort((a, b) => a.position - b.position);
        });
      }

      if (ev.type === "slide_designed") {
        setSlides((prev) => {
          const exists = prev.some((s) => s.id === ev.id);
          const next = exists ? prev.map((s) => (s.id === ev.id ? ev.spec : s)) : [...prev, ev.spec];
          return next.sort((a, b) => a.position - b.position);
        });
      }

      if (ev.type === "slide_written") {
        setMessages((p) => [...p, { id: `a-${Date.now()}-${ev.id}`, role: "assistant", text: `Writing ${ev.id}: ${ev.title}` }]);
      }

      if (ev.type === "ask_user") {
        setIsRunning(false);
        setPendingQuestion(ev.question);
        setMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", text: ev.question.question }]);
      }

      if (ev.type === "workflow_complete") {
        setSteps((p) => p.map((s) => ({ ...s, status: "completed" })));
        setIsRunning(false);
      }

      if (ev.type === "error") {
        setIsRunning(false);
        setSteps((p) => p.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
        setMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", text: ev.message }]);
      }
    };

    void SlidesAgentClient.start({ instruction: prompt }, handleEvent)
      .then((handle) => {
        runHandleRef.current = handle;
      })
      .catch((err) => {
        setIsRunning(false);
        setMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", text: err instanceof Error ? err.message : "Could not start agent." }]);
      });
  }

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const runningStep = steps.find((s) => s.status === "running");
  const activeSpec = slides[activeSlide];
  const selectedElement =
    activeSpec && selectedElementId
      ? activeSpec.elements.find((el) => el.id === selectedElementId) ?? null
      : null;

  const patchSelectedElementStyle = useCallback(
    (changes: Record<string, unknown>) => {
      if (!activeSpec || !selectedElementId) return;
      const slideId = activeSpec.id;
      const patch = changes && typeof changes === "object" ? changes : {};
      setSlides((prev) =>
        prev.map((s) => {
          if (s.id !== slideId) return s;
          return {
            ...s,
            elements: s.elements.map((el) =>
              el.id !== selectedElementId
                ? el
                : ({ ...el, style: { ...el.style, ...(patch as Record<string, unknown>) } } as typeof el)
            ),
          };
        }),
      );
    },
    [activeSpec, selectedElementId],
  );

  const patchSelectedElementPosition = useCallback(
    (changes: Partial<Pick<NonNullable<typeof selectedElement>["position"], "x" | "y" | "w" | "h">>) => {
      if (!activeSpec || !selectedElementId) return;
      const slideId = activeSpec.id;
      setSlides((prev) =>
        prev.map((s) => {
          if (s.id !== slideId) return s;
          return {
            ...s,
            elements: s.elements.map((el) =>
              el.id !== selectedElementId ? el : { ...el, position: { ...el.position, ...changes } }
            ),
          };
        }),
      );
    },
    [activeSpec, selectedElementId],
  );

  const exportPptx = useCallback(async () => {
    if (!slides.length) {
      setMessages((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", text: "No slides to export yet." }]);
      return;
    }

    try {
      const response = await fetchWithUserAuthorization("/api/slides/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckTitle: "octopilotslides",
          slides,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "octopilotslides.pptx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessages((p) => [
        ...p,
        { id: `a-${Date.now()}`, role: "assistant", text: err instanceof Error ? err.message : "Export failed." },
      ]);
    }
  }, [slides]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">

      {/* ─ Header ─ */}
      <AppHeader
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      {/* ─ Body ─ */}
      <div className="flex overflow-hidden" style={{ marginTop: 64, height: "calc(100vh - 64px)" }}>

        {/* ══ SIDEBAR ══ */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0f0f0f]">

          {/* Head */}
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
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-red-400">{progressPct}</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-4 shrink-0">
            {(["workflow", "sources"] as const).map((tab) => (
              <button key={tab} onClick={() => setSidebarTab(tab)}
                className={`relative pb-2 pt-2.5 text-[12px] font-medium capitalize mr-5 transition-colors ${sidebarTab === tab ? "text-white" : "text-white/30 hover:text-white/60"}`}>
                {tab}
                {sidebarTab === tab && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-red-500" />}
              </button>
            ))}
          </div>

          {/* Workflow */}
          {sidebarTab === "workflow" && (
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
              {steps.map((step) => (
                <div key={step.id} className={`flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-all ${
                  step.status === "running" ? "bg-red-500/[0.06]" : step.status === "completed" ? "opacity-60" : "opacity-30"
                }`}>
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    <StepIcon status={step.status} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[12.5px] font-medium leading-snug ${step.status === "running" ? "text-white" : "text-white/70"}`}>
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

          {/* Sources */}
          {sidebarTab === "sources" && (
            <div className="flex-1 overflow-y-auto px-3 py-2.5">
              {completedCount >= 4 ? (
                <div className="space-y-2">
                  {[
                    { title: "Wikipedia", sub: "Background & overview", url: "en.wikipedia.org" },
                    { title: "Britannica", sub: "Encyclopedia entry", url: "britannica.com" },
                    { title: "Academic Journal", sub: "Peer-reviewed", url: "scholar.google.com" },
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

          {/* Chat */}
          <div className="border-t border-white/[0.06] flex flex-col shrink-0">
            <div className="flex max-h-48 flex-col gap-2 overflow-y-auto px-3 py-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 text-[12.5px] leading-relaxed ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  style={{ animation: "slideUp 0.2s ease-out" }}>
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
                <button type="submit" disabled={!input.trim() || isRunning}
                  className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 transition-all hover:bg-red-400 disabled:opacity-25 disabled:cursor-not-allowed">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-white/12">Enter to send · Shift+Enter for new line</p>
            </form>
          </div>
        </aside>

        {/* ══ MAIN CANVAS ══ */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a] px-4 py-2 shrink-0">
            <div className="flex items-center gap-3">
              {/* H / V mode toggle */}
              <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
                {(["h", "v"] as const).map((m) => (
                  <button key={m} onClick={() => { setCanvasMode(m); if (m === "h") setSelectedElementId(null); }}
                    title={m === "h" ? "Hand / Navigate (H)" : "Select / Edit (V)"}
                    className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition-all ${
                      canvasMode === m ? "bg-white/10 text-white" : "text-white/25 hover:text-white/50"
                    }`}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="h-3 w-px bg-white/[0.06]" />

              <span className="text-[11.5px] text-white/25 font-mono tabular-nums">
                {activeSlide + 1} / {slides.length}
              </span>
              <span className="text-[12px] text-white/40 font-medium truncate max-w-[200px]">
                {activeSpec?.archetype.replace("THE_", "").replace("_", " ") ?? "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom */}
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1">
                <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
                  className="h-5 w-5 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors text-base leading-none">−</button>
                <span className="text-[11px] text-white/40 font-mono w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
                  className="h-5 w-5 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors text-base leading-none">+</button>
              </div>
              <button onClick={fitView}
                className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-white/40 hover:text-white/70 hover:border-white/15 transition-all">
                Fit
              </button>

              {/* Theme swatch */}
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 cursor-default select-none">
                <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: theme.palette.primary }} />
                <span className="text-[11.5px] text-white/35 truncate max-w-[100px]">{theme.name}</span>
              </div>

              {/* Export */}
              <button
                onClick={() => void exportPptx()}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-400 shadow-[0_0_16px_rgba(239,68,68,0.3)]"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export .pptx
              </button>
            </div>
          </div>

          {/* Infinite canvas */}
          <div
            ref={canvasRef}
            className="flex-1 overflow-hidden relative select-none"
            style={{ cursor: canvasMode === "h" ? (isDragging ? "grabbing" : "grab") : "default" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Dot-grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)`,
              backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
              backgroundPosition: `${pan.x % (28 * zoom)}px ${pan.y % (28 * zoom)}px`,
            }} />

            {/* Transform layer */}
            <div className="absolute top-0 left-0" style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              willChange: "transform",
            }}>
              {slides.map((spec, i) => {
                const x = i * (SLIDE_W + SLIDE_GAP);
                const isActive = activeSlide === i;
                return (
                  <div key={spec.id} className="absolute" style={{ left: x, top: 0, width: SLIDE_W, height: SLIDE_H }}>
                    {/* Shadow + border ring */}
                    <div className="absolute inset-0 rounded-[6px] transition-[box-shadow] duration-200" style={{
                      boxShadow: isActive
                        ? "0 0 0 3px #ef4444, 0 24px 80px rgba(0,0,0,0.8)"
                        : "0 0 0 1px rgba(255,255,255,0.08), 0 12px 48px rgba(0,0,0,0.7)",
                    }} />

                    {/* Real slide render */}
                    <SlideCanvas
                      spec={spec}
                      theme={theme}
                      width={SLIDE_W}
                      mode={isActive ? canvasMode : "h"}
                      selectedElementId={isActive ? selectedElementId : null}
                      onElementSelect={(id) => {
                        focusSlide(i);
                        setSelectedElementId(id);
                      }}
                      onBackgroundClick={() => {
                        focusSlide(i);
                        setSelectedElementId(null);
                      }}
                      style={{ borderRadius: 6, cursor: canvasMode === "h" ? "pointer" : "default" }}
                    />

                    {/* Click to focus (H mode) */}
                    {canvasMode === "h" && (
                      <div className="absolute inset-0 rounded-[6px]"
                        onClick={(e) => { e.stopPropagation(); focusSlide(i); }} />
                    )}

                    {/* Slide number */}
                    <div className="absolute -bottom-8 left-0 text-[11px] font-mono text-white/25 select-none">{i + 1}</div>

                    {/* Active top indicator */}
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
                {canvasMode === "h"
                  ? "Drag to pan · Ctrl+scroll to zoom · H/V to switch mode"
                  : "Click element to select · V mode · Press H or Esc to exit"}
              </p>
            </div>
          </div>

          {/* Thumbnail strip */}
          <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0a0a]">
            <div className="flex items-center gap-2.5 overflow-x-auto px-4 py-2.5">
              {slides.map((spec, i) => (
                <SlideThumbnail
                  key={spec.id}
                  spec={spec}
                  theme={theme}
                  width={96}
                  isActive={activeSlide === i}
                  onClick={() => focusSlide(i)}
                />
              ))}
              {/* Add slide button */}
              <button className="shrink-0" style={{ width: 96, height: 54 }}>
                <div className="flex h-full w-full items-center justify-center rounded text-white/20 hover:text-white/40 border border-dashed border-white/[0.09] hover:border-white/20 transition-all">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 5v14" /><path d="M5 12h14" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
          </div>

          {/* Property panel (V mode only) */}
          {canvasMode === "v" && activeSpec && selectedElement && (
            <PropertyPanel
              slideId={activeSpec.id}
              element={selectedElement}
              onClose={() => setSelectedElementId(null)}
              onStyleChange={(changes) => patchSelectedElementStyle(changes)}
              onPositionChange={(changes) => patchSelectedElementPosition(changes)}
            />
          )}
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
