"use client";

import {
  useEffect, useRef, useState,
  FormEvent, KeyboardEvent, useCallback,
  useMemo,
} from "react";
import Image from "next/image";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";
import { SlideCanvas, SlideThumbnail, PropertyPanel, GoogleFontsLink } from "@/components/slides";
import {
  getThemeByName,
  normalizeDeckTheme,
  normalizeSlideSpec,
  THEME_NAMES,
  type SlideSpec,
  type DeckTheme,
  type AgentQuestion,
  type SlidesSSEEvent,
  type AnimationSpec,
  type TextElement,
} from "@/types/slides";
import { buildGoogleFontsCssHref } from "@/lib/slideGoogleFonts";
import { SlidesAgentClient } from "@/services/SlidesAgentClient";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";

// ─── Types ─────────────────────────────────────────────────────────────────────

type OctopilotSlidesViewProps = { onBack: () => void };

type ActivityStatus = "running" | "done" | "error";

type ActivityEntry = {
  id: string;
  label: string;       // human-readable: "Writing slide 2..."
  toolName: string;    // badge: "write_slide"
  status: ActivityStatus;
  detail?: string;     // answer, slide title, or error text
  thinking?: string;   // orchestrator reasoning text (collapsible)
  thinkingOpen?: boolean;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const SLIDE_W = 880;
const SLIDE_H = 495;
const SLIDE_GAP = 72;

// Maps step detail strings (tool stepTitle output) → human-readable activity labels.
function activityLabel(detail: string): { label: string; toolName: string } {
  if (detail === "Analyze instruction") return { label: "Analyzing your brief", toolName: "analyze_instruction" };
  if (detail.startsWith("Ask:")) {
    const field = detail.replace("Ask:", "").trim();
    if (field === "designAesthetic") return { label: "Choosing design aesthetic", toolName: "ask_user" };
    if (field === "slideCount")      return { label: "Deciding slide count",       toolName: "ask_user" };
    return { label: `Asking about ${field}`, toolName: "ask_user" };
  }
  if (detail === "Set deck theme") return { label: "Crafting custom theme",    toolName: "update_deck_theme" };
  if (detail.startsWith("Create "))  return { label: `Scaffolding slides`,      toolName: "create_slides" };
  if (detail.startsWith("Write "))   return { label: `Writing ${detail.replace("Write ", "").toLowerCase()}`, toolName: "write_slide" };
  if (detail.startsWith("Design "))  return { label: `Designing ${detail.replace("Design ", "").toLowerCase()}`, toolName: "design_slide" };
  if (detail === "Compose deck")     return { label: "Finalizing deck",          toolName: "compose" };
  return { label: detail, toolName: "tool" };
}

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
    transition: { type: "fade", duration: 500 },
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
    transition: { type: "push", duration: 450, direction: "left" },
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
    transition: { type: "fade", duration: 500 },
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
    transition: { type: "fade", duration: 500 },
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
    transition: { type: "push", duration: 400, direction: "up" },
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

// ─── Activity icon ─────────────────────────────────────────────────────────────

function ActivityIcon({ status }: { status: ActivityStatus }) {
  if (status === "done") return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[3px]">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
  if (status === "running") return (
    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center mt-[2px]">
      <span className="absolute h-3 w-3 animate-ping rounded-full bg-red-500/60" />
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
    </span>
  );
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[3px]">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
    </svg>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function OctopilotSlidesView({ onBack }: OctopilotSlidesViewProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [pendingThinking, setPendingThinking] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideAnimEpoch, setSlideAnimEpoch] = useState(0);
  const [slides, setSlides] = useState<SlideSpec[]>(DEMO_SLIDES);
  const [theme, setTheme] = useState<DeckTheme>(DEMO_THEME);
  const [isRunning, setIsRunning] = useState(false);
  const [canvasMode, setCanvasMode] = useState<"h" | "v">("h");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingTextElementId, setEditingTextElementId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<AgentQuestion | null>(null);

  const fontsHref = useMemo(() => buildGoogleFontsCssHref(theme, slides), [theme, slides]);

  useEffect(() => {
    setSlideAnimEpoch((n) => n + 1);
  }, [activeSlide]);

  // ── Canvas pan / zoom state ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [zoom, setZoom] = useState(0.55);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const activitiesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const runHandleRef = useRef<null | { close: () => void; getRunId: () => string }>(null);
  const pendingThinkingRef = useRef<string | null>(null);

  // Auto-scroll activity log
  useEffect(() => {
    activitiesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities]);

  // Keep pendingThinkingRef in sync for use inside event handler closure
  useEffect(() => {
    pendingThinkingRef.current = pendingThinking;
  }, [pendingThinking]);

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

  // Auto-fit when the first AI slide appears (replaces demo slides)
  const prevSlideLenRef = useRef(DEMO_SLIDES.length);
  useEffect(() => {
    const prev = prevSlideLenRef.current;
    prevSlideLenRef.current = slides.length;
    // Trigger fit when slides reset from demo to 0-1 (new run started)
    if (prev > 1 && slides.length <= 1) fitView();
  }, [slides.length, fitView]);

  const focusSlide = useCallback((index: number) => {
    setActiveSlide(index);
    setSelectedElementId(null);
    setEditingTextElementId(null);
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

  // ── Chat / send ──
  const handleInputChange = (v: string) => {
    setInput(v);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  const submitAnswer = (answer: string) => {
    const q = pendingQuestion;
    const runId = runHandleRef.current?.getRunId() || "";
    if (!q || !runId) return;
    // Mark the ask_user activity as done with the chosen answer
    setActivities((prev) =>
      prev.map((a) => a.toolName === "ask_user" && a.status === "running"
        ? { ...a, status: "done", detail: answer }
        : a
      )
    );
    setIsRunning(true);
    setPendingQuestion(null);
    void SlidesAgentClient.answer(runId, q.field, answer).catch(() => setIsRunning(false));
  };

  const sendMessage = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isRunning || pendingQuestion) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsRunning(true);
    runWorkflow(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  function runWorkflow(prompt: string) {
    runHandleRef.current?.close();
    runHandleRef.current = null;

    setActivities([]);
    setPendingThinking(null);
    setIsComplete(false);
    setSlides([]);
    setTheme(DEMO_THEME);
    setActiveSlide(0);
    setSelectedElementId(null);
    setEditingTextElementId(null);
    setPendingQuestion(null);

    const handleEvent = (ev: SlidesSSEEvent) => {
      if (ev.type === "thinking") {
        // Buffer thinking text — attach it to the NEXT activity entry
        setPendingThinking(ev.text);
      }

      if (ev.type === "workflow_step" && ev.stepId !== "run_id") {
        const { label, toolName } = activityLabel(ev.detail ?? "");
        const entryId = ev.stepId;

        if (ev.status === "running") {
          setActivities((prev) => {
            if (prev.some((a) => a.id === entryId)) return prev;
            // Consume buffered thinking text
            const thinking = pendingThinkingRef.current ?? undefined;
            pendingThinkingRef.current = null;
            return [...prev, { id: entryId, label, toolName, status: "running", thinking, thinkingOpen: false }];
          });
          setPendingThinking(null);
        } else if (ev.status === "done") {
          setActivities((prev) =>
            prev.map((a) => a.id === entryId ? { ...a, status: "done", detail: ev.detail } : a)
          );
        } else if (ev.status === "error") {
          setActivities((prev) =>
            prev.map((a) => a.id === entryId ? { ...a, status: "error", detail: ev.detail } : a)
          );
        }
      }

      if (ev.type === "theme_set") {
        setTheme((prev) => normalizeDeckTheme(ev.theme, prev));
      }

      if (ev.type === "slide_created") {
        setSlides((prev) => {
          if (prev.some((s) => s.id === ev.id)) return prev;
          const blank: SlideSpec = {
            id: ev.id, position: ev.position, layout: "blank",
            archetype: "THE_BREATH", designIntent: "Blank slide.",
            background: { type: "solid", color: theme?.palette.background ?? "#0f0f0f" },
            elements: [],
          };
          return [...prev, blank].sort((a, b) => a.position - b.position);
        });
      }

      if (ev.type === "slide_written") {
        // 1. Update activity label with the slide title
        setActivities((prev) =>
          prev.map((a) =>
            a.toolName === "write_slide" && a.status === "running"
              ? { ...a, detail: ev.title }
              : a
          )
        );
        // 2. Render a live text-preview on canvas immediately (replaced later by design_slide)
        setSlides((prev) => {
          const existing = prev.find((s) => s.id === ev.id);
          if (!existing) return prev;
          const t = theme;
          const preview: SlideSpec = {
            ...existing,
            designIntent: "Writing preview",
            elements: [
              {
                id: `${ev.id}_title`,
                type: "text", variant: "title",
                content: ev.title,
                position: { x: 8, y: 10, w: 84, h: 22 },
                style: {
                  fontFamily: t?.typography.heading.web ?? "Inter",
                  fontSize: 52, fontWeight: 800,
                  color: t?.palette.text ?? "#ffffff",
                  align: "left", opacity: 1,
                },
              },
              ...(ev.bullets && ev.bullets.length > 0 ? [{
                id: `${ev.id}_body_1`,
                type: "text" as const, variant: "body" as const,
                content: ev.bullets.map((b: string) => `• ${b}`).join("\n"),
                position: { x: 8, y: 36, w: 84, h: 52 },
                style: {
                  fontFamily: t?.typography.body.web ?? "Inter",
                  fontSize: 18, fontWeight: 400 as const,
                  color: t?.palette.textMuted ?? "#888888",
                  align: "left" as const, opacity: 0.75, lineHeight: 1.65,
                },
              }] : []),
            ],
          };
          return prev.map((s) => s.id === ev.id ? preview : s);
        });
        // 3. Focus this slide on canvas
        setSlides((prev) => {
          const idx = prev.findIndex((s) => s.id === ev.id);
          if (idx >= 0) setActiveSlide(idx);
          return prev;
        });
      }

      if (ev.type === "slide_designed") {
        setSlides((prev) => {
          const fallback = {
            id: ev.id,
            position: prev.find((s) => s.id === ev.id)?.position ?? (ev.spec?.position ?? prev.length + 1),
          };
          const safeSpec = normalizeSlideSpec(ev.spec, fallback, { theme });
          const exists = prev.some((s) => s.id === ev.id);
          const next = exists ? prev.map((s) => (s.id === ev.id ? safeSpec : s)) : [...prev, safeSpec];
          // Focus the newly designed slide
          const idx = next.findIndex((s) => s.id === ev.id);
          if (idx >= 0) setActiveSlide(idx);
          return next.sort((a, b) => a.position - b.position);
        });
      }

      if (ev.type === "ask_user") {
        setIsRunning(false);
        setPendingQuestion(ev.question);
        // Mark the ask_user activity as waiting
        setActivities((prev) =>
          prev.map((a) => a.toolName === "ask_user" && a.status === "running"
            ? { ...a, label: ev.question.question }
            : a
          )
        );
      }

      if (ev.type === "workflow_complete") {
        setIsRunning(false);
        setIsComplete(true);
        setActivities((prev) => [
          ...prev,
          { id: "complete", label: `${slides.length || "All"} slides ready`, toolName: "complete", status: "done" },
        ]);
      }

      if (ev.type === "error") {
        setIsRunning(false);
        setActivities((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, label: ev.message, toolName: "error", status: "error" },
        ]);
      }
    };

    void SlidesAgentClient.start({ instruction: prompt }, handleEvent)
      .then((handle) => { runHandleRef.current = handle; })
      .catch((err) => {
        setIsRunning(false);
        setActivities((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, label: err instanceof Error ? err.message : "Could not start agent.", toolName: "error", status: "error" },
        ]);
      });
  }

  const doneCount = activities.filter((a) => a.status === "done").length;
  const totalCount = activities.length;
  const runningActivity = activities.find((a) => a.status === "running");
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

  const patchSelectedElementContent = useCallback(
    (content: string) => {
      if (!activeSpec || !selectedElementId) return;
      const slideId = activeSpec.id;
      setSlides((prev) =>
        prev.map((s) => {
          if (s.id !== slideId) return s;
          return {
            ...s,
            elements: s.elements.map((el) =>
              el.id === selectedElementId && el.type === "text" ? { ...el, content } : el,
            ),
          };
        }),
      );
    },
    [activeSpec, selectedElementId],
  );

  const patchSelectedElementAnimation = useCallback(
    (animation: AnimationSpec | undefined) => {
      if (!activeSpec || !selectedElementId) return;
      const slideId = activeSpec.id;
      setSlides((prev) =>
        prev.map((s) => {
          if (s.id !== slideId) return s;
          return {
            ...s,
            elements: s.elements.map((el) =>
              el.id === selectedElementId ? { ...el, animation } : el,
            ),
          };
        }),
      );
    },
    [activeSpec, selectedElementId],
  );

  const patchActiveSlideTransition = useCallback(
    (transition: SlideSpec["transition"]) => {
      setSlides((prev) => {
        const spec = prev[activeSlide];
        if (!spec) return prev;
        return prev.map((s, i) =>
          i !== activeSlide
            ? s
            : {
                ...s,
                transition: !transition || transition.type === "none" ? undefined : transition,
              },
        );
      });
    },
    [activeSlide],
  );

  const slideEnterAnimation = useMemo(() => {
    const spec = slides[activeSlide];
    if (!spec?.transition || spec.transition.type === "none") return undefined;
    const ms = spec.transition.duration ?? 500;
    const sec = `${ms / 1000}s`;
    if (spec.transition.type === "fade") return `octoSlideFadeIn ${sec} ease-out both`;
    if (spec.transition.type === "push") {
      const d = spec.transition.direction ?? "left";
      const map: Record<string, string> = {
        left: `octoSlidePushFromLeft ${sec} ease-out both`,
        right: `octoSlidePushFromRight ${sec} ease-out both`,
        up: `octoSlidePushFromTop ${sec} ease-out both`,
        down: `octoSlidePushFromBottom ${sec} ease-out both`,
      };
      return map[d] ?? map.left;
    }
    return undefined;
  }, [activeSlide, slides]);

  // Keyboard: H / V / Esc + Ctrl/Cmd+B/I/U for selected text
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable) return;

      if ((e.metaKey || e.ctrlKey) && canvasMode === "v" && selectedElementId && activeSpec) {
        const hit = activeSpec.elements.find((x) => x.id === selectedElementId);
        if (hit?.type === "text") {
          const te = hit as TextElement;
          if (e.key === "b" || e.key === "B") {
            e.preventDefault();
            patchSelectedElementStyle({
              fontWeight: (te.style.fontWeight >= 700 ? 400 : 700) as TextElement["style"]["fontWeight"],
            });
            return;
          }
          if (e.key === "i" || e.key === "I") {
            e.preventDefault();
            patchSelectedElementStyle({ italic: !te.style.italic });
            return;
          }
          if (e.key === "u" || e.key === "U") {
            e.preventDefault();
            patchSelectedElementStyle({ underline: !te.style.underline });
            return;
          }
        }
      }

      if (e.key === "h" || e.key === "H") {
        setCanvasMode("h");
        setSelectedElementId(null);
        setEditingTextElementId(null);
      }
      if (e.key === "v" || e.key === "V") setCanvasMode("v");
      if (e.key === "Escape") {
        setCanvasMode("h");
        setSelectedElementId(null);
        setEditingTextElementId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canvasMode, selectedElementId, activeSpec, patchSelectedElementStyle]);

  const exportPptx = useCallback(async () => {
    if (!slides.length) return;

    try {
      const response = await fetchWithUserAuthorization("/api/slides/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckTitle: "octopilotslides", slides }),
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
      setActivities((prev) => [
        ...prev,
        { id: `export-err-${Date.now()}`, label: err instanceof Error ? err.message : "Export failed.", toolName: "error", status: "error" },
      ]);
    }
  }, [slides]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
      <GoogleFontsLink href={fontsHref} />

      {/* ─ Header ─ */}
      <AppHeader
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      {/* ─ Body ─ */}
      <div className="flex overflow-hidden" style={{ marginTop: 64, height: "calc(100vh - 64px)" }}>

        {/* ══ SIDEBAR ══ */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0f0f0f]">

          {/* Head */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white leading-none">OctopilotSlides</p>
              <p className="text-[11px] text-white/30 mt-0.5 leading-none truncate">
                {isComplete
                  ? `${slides.length} slides ready`
                  : isRunning && runningActivity
                  ? runningActivity.label
                  : activities.length > 0
                  ? `${doneCount} of ${totalCount} done`
                  : "Describe your deck below"}
              </p>
            </div>
            {/* Pulsing dot when running */}
            {isRunning && (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            )}
            {isComplete && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </div>

          {/* ── Activity log ── */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {activities.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2 opacity-40">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <p className="text-[12px] text-white/40">Type a topic below to start</p>
              </div>
            )}

            {activities.map((a) => (
              <div key={a.id} className={`group rounded-lg transition-all ${
                a.status === "running" ? "bg-white/[0.04]" : ""
              }`} style={{ animation: "slideUp 0.15s ease-out" }}>

                {/* Thinking block (collapsible) */}
                {a.thinking && (
                  <button
                    onClick={() => setActivities((prev) => prev.map((x) => x.id === a.id ? { ...x, thinkingOpen: !x.thinkingOpen } : x))}
                    className="w-full flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-left"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      className={`text-white/20 shrink-0 transition-transform ${a.thinkingOpen ? "rotate-90" : ""}`}>
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                    <span className="text-[10px] text-white/20 font-medium tracking-wide uppercase">Thinking</span>
                  </button>
                )}
                {a.thinking && a.thinkingOpen && (
                  <div className="mx-2.5 mb-2 rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-2">
                    <p className="text-[11px] text-white/30 leading-relaxed whitespace-pre-wrap">{a.thinking}</p>
                  </div>
                )}

                {/* Main row */}
                <div className="flex items-start gap-2.5 px-2.5 py-2">
                  <ActivityIcon status={a.status} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12.5px] leading-snug ${
                      a.status === "running" ? "text-white font-medium" :
                      a.status === "done"    ? "text-white/50" :
                      "text-red-400"
                    }`}>
                      {a.label}
                      {a.status === "running" && (
                        <span className="ml-1 inline-flex gap-[3px] items-center">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="inline-block h-[3px] w-[3px] rounded-full bg-red-500/70 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </span>
                      )}
                    </p>
                    {a.detail && a.status === "done" && a.toolName !== "complete" && (
                      <p className="text-[10.5px] text-white/25 mt-0.5 truncate">{a.detail}</p>
                    )}
                    <p className={`text-[9.5px] font-mono mt-0.5 transition-opacity ${
                      a.status === "running" ? "text-red-500/50 opacity-100" : "text-white/15 opacity-0 group-hover:opacity-100"
                    }`}>
                      {a.toolName !== "complete" && a.toolName !== "error" ? `calling ${a.toolName}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Completion banner */}
            {isComplete && (
              <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-3 text-center"
                style={{ animation: "slideUp 0.2s ease-out" }}>
                <p className="text-[13px] font-semibold text-white">✓ Deck complete</p>
                <p className="text-[11px] text-white/35 mt-0.5">{slides.length} slides · Export when ready</p>
              </div>
            )}
            <div ref={activitiesEndRef} />
          </div>

          {/* ── Question panel (when AI asks something) ── */}
          {pendingQuestion && (
            <div className="border-t border-white/[0.06] bg-[#0f0f0f] px-3 pt-3 pb-3 shrink-0"
              style={{ animation: "slideUp 0.2s ease-out" }}>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 mb-2.5">
                <div className="flex items-start gap-2 mb-2.5">
                  <div className="h-5 w-5 shrink-0 rounded-full bg-red-500/15 flex items-center justify-center mt-0.5">
                    <Image src="/OCTOPILOT.png" alt="AI" width={11} height={11} className="opacity-80" />
                  </div>
                  <p className="text-[13px] text-white leading-snug">{pendingQuestion.question}</p>
                </div>
                {/* Choice chips */}
                {pendingQuestion.inputType === "choice" && (pendingQuestion.suggestions?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {pendingQuestion.suggestions!.map((s) => (
                      <button key={s} type="button" onClick={() => submitAnswer(s)}
                        className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/75 hover:border-red-500/40 hover:bg-red-500/[0.07] hover:text-white transition-all text-left">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Free-text answer */}
              <form onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (v) { submitAnswer(v); setInput(""); } }}
                className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:border-red-500/25 transition-colors">
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = input.trim(); if (v) { submitAnswer(v); setInput(""); } } }}
                  placeholder="Or type your answer…"
                  className="flex-1 bg-transparent text-[12.5px] text-white placeholder-white/20 outline-none"
                />
                <button type="submit" disabled={!input.trim()}
                  className="h-5 w-5 flex items-center justify-center rounded-full bg-red-500 disabled:opacity-25 transition-opacity shrink-0">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </button>
              </form>
            </div>
          )}

          {/* ── Prompt input (when idle) ── */}
          {!pendingQuestion && (
            <form onSubmit={sendMessage} className="border-t border-white/[0.06] px-3 py-3 shrink-0">
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:border-red-500/30 transition-colors">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRunning ? "Working on your deck…" : "Describe your presentation…"}
                  disabled={isRunning}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder-white/20 outline-none min-h-[22px] max-h-[120px] disabled:opacity-30 leading-relaxed"
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
          )}
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

              <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1">
                <span className="text-[10px] text-white/25 uppercase tracking-wider shrink-0">Slide</span>
                <select
                  value={activeSpec?.transition?.type ?? "none"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "none") patchActiveSlideTransition(undefined);
                    else if (v === "fade") patchActiveSlideTransition({ type: "fade", duration: 500 });
                    else patchActiveSlideTransition({ type: "push", duration: 450, direction: "left" });
                  }}
                  className="max-w-[88px] bg-transparent text-[11px] text-white/60 outline-none cursor-pointer"
                  aria-label="Slide transition"
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="push">Push</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1">
                <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: theme?.palette?.primary ?? "#888" }} />
                <select
                  value={theme?.name ?? DEMO_THEME.name}
                  onChange={(e) => {
                    const t = getThemeByName(e.target.value);
                    if (t) setTheme(t);
                  }}
                  className="max-w-[120px] bg-transparent text-[11px] text-white/50 outline-none cursor-pointer truncate"
                  aria-label="Deck theme"
                >
                  {THEME_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
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

                    <div
                      key={isActive ? `live-${slideAnimEpoch}` : `idle-${spec.id}`}
                      style={{
                        position: "relative",
                        width: SLIDE_W,
                        height: SLIDE_H,
                        borderRadius: 6,
                        animation: isActive ? slideEnterAnimation : undefined,
                      }}
                    >
                    <SlideCanvas
                      spec={spec}
                      theme={theme}
                      width={SLIDE_W}
                      mode={isActive ? canvasMode : "h"}
                      selectedElementId={isActive ? selectedElementId : null}
                      onElementSelect={(id) => {
                        focusSlide(i);
                        setEditingTextElementId(null);
                        setSelectedElementId(id);
                      }}
                      onBackgroundClick={() => {
                        focusSlide(i);
                        setEditingTextElementId(null);
                        setSelectedElementId(null);
                      }}
                      editingTextElementId={isActive ? editingTextElementId : null}
                      onTextDoubleClick={(id) => {
                        focusSlide(i);
                        setSelectedElementId(id);
                        setEditingTextElementId(id);
                      }}
                      onTextEditCommit={(id, content) => {
                        setEditingTextElementId(null);
                        setSlides((prev) =>
                          prev.map((s) =>
                            s.id !== spec.id
                              ? s
                              : {
                                  ...s,
                                  elements: s.elements.map((el) =>
                                    el.id === id && el.type === "text" ? { ...el, content } : el,
                                  ),
                                },
                          ),
                        );
                      }}
                      onTextEditCancel={() => setEditingTextElementId(null)}
                      style={{ borderRadius: 6, cursor: canvasMode === "h" ? "pointer" : "default" }}
                    />
                    </div>

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
                  : "Click to select · Double-click text to edit · ⌘/Ctrl+B/I/U · H or Esc exits"}
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
              onClose={() => {
                setSelectedElementId(null);
                setEditingTextElementId(null);
              }}
              onStyleChange={(changes) => patchSelectedElementStyle(changes)}
              onPositionChange={(changes) => patchSelectedElementPosition(changes)}
              onContentChange={selectedElement.type === "text" ? patchSelectedElementContent : undefined}
              onAnimationChange={patchSelectedElementAnimation}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes octoSlideFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes octoSlidePushFromLeft {
          from { transform: translateX(-28px); opacity: 0.65; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes octoSlidePushFromRight {
          from { transform: translateX(28px); opacity: 0.65; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes octoSlidePushFromTop {
          from { transform: translateY(-22px); opacity: 0.65; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes octoSlidePushFromBottom {
          from { transform: translateY(22px); opacity: 0.65; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
