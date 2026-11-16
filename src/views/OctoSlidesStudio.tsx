"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";
import dynamic from "next/dynamic";
import SlideCanvas, { STAGE_H, STAGE_W } from "@/components/octoslides/SlideCanvas";
import StepFeed, { type FeedItem } from "@/components/octoslides/StepFeed";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";

/**
 * OctoSlides studio for the pptxgenjs designer (/api/octoslides).
 * Left: the designer's activity (a paced, animated timeline) and a composer.
 * Right: the slide on a pan/zoom canvas; click any element to edit its text
 * directly (free) or ask the designer to change it.
 */

type Props = { onBack: () => void };

type ServerEvent =
  | { type: "run_started"; runId: string }
  | { type: "turn_started"; text: string; target?: { slide: number; name: string } }
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_started"; id: string; name: string; summary: string }
  | { type: "tool_finished"; id: string; name: string; ok: boolean; summary: string }
  | { type: "slides_rendered"; slides: number[]; version: number }
  | { type: "deck_ready"; bytes: number; version: number }
  | { type: "ask_user"; question: string; suggestions?: string[] }
  | { type: "usage"; costUsd: number; steps: number }
  | { type: "watermark"; enabled: boolean; canToggle: boolean; reason: "free" | "pro" | "admin" }
  | { type: "complete"; summary: string }
  | { type: "error"; message: string };

type LayoutElement = { id: string; name: string; kind: "text" | "shape" | "image" | "chart" | "table" | "group"; x: number; y: number; w: number; h: number; rot?: number; text?: string };
type Layout = { slides: Array<{ slide: number; elements: LayoutElement[] }> };
type DocumentRow = { id: string; title: string; word_count: number; updated_at: string };
type RunRow = { runId: string; prompt: string; status: string; createdAt: number; slides: number[]; renderedVersion: number };
type Watermark = { enabled: boolean; canToggle: boolean; reason: "free" | "pro" | "admin" };

const TOOL_LABELS: Record<string, string> = {
  write_file: "Writing the design code",
  edit_file: "Refining the design",
  read_file: "Reading a file",
  list_files: "Checking files",
  run_script: "Building the deck",
  validate_deck: "Checking the file for PowerPoint",
  deck_text: "Proofreading the text",
  render_slides: "Looking at the slides",
  critique_slides: "Getting a design critique",
  search_images: "Searching photos",
  fetch_image: "Adding a photo",
  generate_image: "Generating an image",
  refresh_deck: "Applying motion",
  list_my_documents: "Looking at your documents",
  read_document: "Reading your document",
  ask_user: "Asking you a question",
  finish: "Wrapping up",
  manual_edit: "Applying your edit",
};

/** Friendlier wording for results the user doesn't need in technical form. */
function friendlyDetail(name: string, ok: boolean, summary: string) {
  if (name === "finish" && !ok) return "One more check before handing over";
  if (name === "validate_deck") return ok ? "Opens cleanly in PowerPoint" : "Fixing a file issue";
  if (name === "run_script" && !ok) return "Fixing a build error";
  return summary;
}

const Presenter = dynamic(() => import("@/components/octoslides/Presenter"), { ssr: false });

const API = "/api/octoslides/runs";

async function jsonOrError(res: Response) {
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/15 border-t-red-400 ${className}`} />;
}

export default function OctoSlidesStudio({ onBack }: Props) {
  const [runId, setRunId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<{ question: string; suggestions?: string[] } | null>(null);
  const [input, setInput] = useState("");
  const [deckVersion, setDeckVersion] = useState(0);
  const [render, setRender] = useState<{ version: number; slides: number[] } | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const [layout, setLayout] = useState<Layout | null>(null);
  const [active, setActive] = useState(1);
  const [selected, setSelected] = useState<LayoutElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [askText, setAskText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [attached, setAttached] = useState<DocumentRow | null>(null);
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [togglingMark, setTogglingMark] = useState(false);
  const [presenting, setPresenting] = useState<ArrayBuffer | null>(null);
  const [openingShow, setOpeningShow] = useState(false);

  const streamAbort = useRef<AbortController | null>(null);
  const imageUrls = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchWithUserAuthorization(API)
      .then(jsonOrError)
      .then((d) => setRecent((d.runs as RunRow[]) ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(
    () => () => {
      streamAbort.current?.abort();
      imageUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  // ── rendered slide images + element layout for a version ──
  const loadRender = useCallback(async (id: string, slides: number[], version: number) => {
    const next: Record<number, string> = {};
    await Promise.all(
      slides.map(async (n) => {
        const res = await fetchWithUserAuthorization(`${API}/${id}/files/render/slide-${n}.png?v=${version}`);
        if (res.ok) {
          const url = URL.createObjectURL(await res.blob());
          imageUrls.current.push(url);
          next[n] = url;
        }
      }),
    );
    const lay = await fetchWithUserAuthorization(`${API}/${id}/files/layout.json?v=${version}`)
      .then((r) => (r.ok ? (r.json() as Promise<Layout>) : null))
      .catch(() => null);
    setImages((prev) => {
      Object.entries(prev).forEach(([k, u]) => {
        if (next[Number(k)] && next[Number(k)] !== u) URL.revokeObjectURL(u);
      });
      return { ...prev, ...next };
    });
    if (lay) setLayout(lay);
    setActive((a) => (slides.includes(a) ? a : slides[0] ?? 1));
  }, []);

  const handleEvent = useCallback(
    (id: string, ev: ServerEvent) => {
      switch (ev.type) {
        case "turn_started":
          setBusy(true);
          setFeed((f) => [...f, { kind: "user", id: `u-${f.length}`, text: ev.text, target: ev.target }]);
          break;
        case "thinking":
          setFeed((f) => [...f, { kind: "thinking", id: `t-${f.length}`, text: ev.text }]);
          break;
        case "tool_started":
          setFeed((f) => [...f, { kind: "tool", id: ev.id, name: ev.name, label: TOOL_LABELS[ev.name] ?? ev.name, detail: ev.summary, status: "running" }]);
          if (ev.name === "manual_edit") setBusy(true);
          break;
        case "tool_finished":
          setFeed((f) =>
            f.map((x) =>
              x.kind === "tool" && (x.id === ev.id || (ev.name === "manual_edit" && x.name === "manual_edit" && x.status === "running"))
                ? { ...x, status: ev.ok ? "done" : "error", detail: friendlyDetail(ev.name, ev.ok, ev.summary) }
                : x,
            ),
          );
          if (ev.name === "manual_edit") setBusy(false);
          if (ev.name === "ask_user") setQuestion(null);
          break;
        case "ask_user":
          setQuestion({ question: ev.question, suggestions: ev.suggestions });
          break;
        case "deck_ready":
          setDeckVersion(ev.version);
          break;
        case "watermark":
          setWatermark({ enabled: ev.enabled, canToggle: ev.canToggle, reason: ev.reason });
          break;
        case "slides_rendered":
          setRender({ version: ev.version, slides: ev.slides });
          void loadRender(id, ev.slides, ev.version);
          break;
        case "complete":
          setBusy(false);
          setQuestion(null);
          setFeed((f) => [...f, { kind: "complete", id: `c-${f.length}`, text: ev.summary }]);
          break;
        case "error":
          setBusy(false);
          setQuestion(null);
          setFeed((f) => [...f.map((x) => (x.kind === "tool" && x.status === "running" ? { ...x, status: "error" as const } : x)), { kind: "error", id: `e-${f.length}`, text: ev.message }]);
          break;
      }
    },
    [loadRender],
  );

  // ── SSE over fetch (needs the auth header), with reconnect ──
  const connect = useCallback(
    (id: string) => {
      streamAbort.current?.abort();
      const controller = new AbortController();
      streamAbort.current = controller;
      let attempt = 0;
      const open = async () => {
        // a reconnect replays every event: rebuild instantly, no pacing
        setFeed([]);
        setReplaying(true);
        try {
          const res = await fetchWithUserAuthorization(`${API}/${id}/events`, { signal: controller.signal, headers: { Accept: "text/event-stream" } });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let lastRender: { slides: number[]; version: number } | null = null;
          let inReplay = true;
          const replayTimer = setTimeout(() => {
            inReplay = false;
            setReplaying(false);
            if (lastRender) handleEvent(id, { type: "slides_rendered", ...lastRender });
          }, 300);
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let cut: number;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              const data = chunk.split("\n").find((l) => l.startsWith("data: "));
              if (!data) continue;
              const ev = JSON.parse(data.slice(6)) as ServerEvent;
              if (inReplay && ev.type === "slides_rendered") {
                lastRender = { slides: ev.slides, version: ev.version };
                setRender(lastRender);
                continue;
              }
              handleEvent(id, ev);
            }
          }
          clearTimeout(replayTimer);
          setReplaying(false);
        } catch {
          setReplaying(false);
          if (controller.signal.aborted) return;
        }
        if (controller.signal.aborted) return;
        attempt += 1;
        if (attempt > 6) {
          setNotice("Lost the connection to the designer. Reload to reconnect.");
          return;
        }
        setTimeout(open, Math.min(8000, 800 * attempt));
      };
      void open();
    },
    [handleEvent],
  );

  const resetDeck = () => {
    streamAbort.current?.abort();
    setRunId(null);
    setFeed([]);
    setBusy(false);
    setQuestion(null);
    setDeckVersion(0);
    setRender(null);
    setImages({});
    setLayout(null);
    setSelected(null);
    setActive(1);
    setWatermark(null);
  };

  const openRun = (id: string) => {
    resetDeck();
    setRunId(id);
    connect(id);
  };

  const startDeck = async (prompt: string) => {
    setNotice(null);
    try {
      const data = await jsonOrError(
        await fetchWithUserAuthorization(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, ...(attached ? { documentId: attached.id } : {}) }),
        }),
      );
      const id = String(data.runId);
      resetDeck();
      setRunId(id);
      setBusy(true);
      setAttached(null);
      connect(id);
      setRecent((r) => [{ runId: id, prompt, status: "running", createdAt: Date.now(), slides: [], renderedVersion: -1 }, ...r]);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const sendFollowUp = async (text: string, target?: { slide: number; name: string }) => {
    if (!runId) return;
    setNotice(null);
    try {
      await jsonOrError(
        await fetchWithUserAuthorization(`${API}/${runId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, ...(target ? { target } : {}) }),
        }),
      );
      setBusy(true);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const answer = async (text: string) => {
    if (!runId) return;
    try {
      await jsonOrError(
        await fetchWithUserAuthorization(`${API}/${runId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: text }),
        }),
      );
      setQuestion(null);
      setFeed((f) => [...f, { kind: "user", id: `a-${f.length}`, text }]);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const submitComposer = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (question) void answer(text);
    else if (!runId || !deckVersion) {
      if (busy) return;
      void startDeck(text);
    } else {
      if (busy) return;
      void sendFollowUp(text);
    }
    setInput("");
  };

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitComposer();
    }
  };

  const saveText = async () => {
    if (!runId || !selected) return;
    setSaving(true);
    setNotice(null);
    try {
      await jsonOrError(
        await fetchWithUserAuthorization(`${API}/${runId}/edits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide: active, name: selected.name, text: draft }),
        }),
      );
      setSelected(null);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const askAboutElement = async () => {
    if (!selected || !askText.trim()) return;
    await sendFollowUp(askText.trim(), { slide: active, name: selected.name });
    setAskText("");
    setSelected(null);
  };

  const toggleWatermark = async () => {
    if (!runId || !watermark?.canToggle) return;
    setTogglingMark(true);
    setNotice(null);
    try {
      await jsonOrError(
        await fetchWithUserAuthorization(`${API}/${runId}/watermark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !watermark.enabled }),
        }),
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setTogglingMark(false);
    }
  };

  const download = async () => {
    if (!runId) return;
    setDownloading(true);
    try {
      const res = await fetchWithUserAuthorization(`${API}/${runId}/files/deck.pptx`);
      if (!res.ok) throw new Error("The deck is not ready yet.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `octoslides-${runId.slice(0, 8)}.pptx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const present = async () => {
    if (!runId) return;
    setOpeningShow(true);
    setNotice(null);
    try {
      const res = await fetchWithUserAuthorization(`${API}/${runId}/files/deck.pptx`);
      if (!res.ok) throw new Error("The deck is not ready yet.");
      setSelected(null);
      setPresenting(await res.arrayBuffer());
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setOpeningShow(false);
    }
  };

  const loadDocs = async () => {
    setDocPickerOpen((o) => !o);
    if (docs) return;
    try {
      const data = await jsonOrError(await fetchWithUserAuthorization("/api/documents"));
      setDocs((data.documents as DocumentRow[]) ?? []);
    } catch {
      setDocs([]);
    }
  };

  // arrows switch slides, Esc deselects
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (presenting) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape") setSelected(null);
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      const slides = render?.slides ?? [];
      if (!slides.length) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setActive((a) => Math.min(slides[slides.length - 1], a + 1));
        setSelected(null);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setActive((a) => Math.max(slides[0], a - 1));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [render, presenting]);

  const slideElements = useMemo(() => {
    const els = layout?.slides.find((s) => s.slide === active)?.elements ?? [];
    // full-bleed backgrounds aren't useful targets; smaller elements on top so they stay clickable
    return [...els].filter((e) => e.w < 0.995 || e.h < 0.995).sort((a, b) => b.w * b.h - a.w * a.h);
  }, [layout, active]);

  const selectElement = (el: LayoutElement) => {
    setSelected(el);
    setDraft(el.text ?? "");
    setAskText("");
  };

  const slides = render?.slides ?? [];
  const hasDeck = deckVersion > 0;
  const canEdit = hasDeck && !busy && !!layout;
  const runningTool = [...feed].reverse().find((f): f is Extract<FeedItem, { kind: "tool" }> => f.kind === "tool" && f.status === "running");
  const composerMode = question ? "answer" : !runId || !hasDeck ? "new" : "change";

  const emptyFeed = !runId ? (
    <div className="osf-row space-y-5 px-1 pt-2">
      <div>
        <p className="text-[15px] font-semibold tracking-tight text-white">What are we presenting?</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">
          Say what the deck is for, who will see it and roughly how long it is. Attach one of your Octopilot documents to build it from your own essay and sources.
        </p>
      </div>
      {recent.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/25">Recent decks · kept 24 h</p>
          <div className="space-y-1.5">
            {recent.map((r) => (
              <button
                key={r.runId}
                type="button"
                onClick={() => openRun(r.runId)}
                className="group w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition duration-300 hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.05]"
              >
                <p className="truncate text-[12.5px] text-white/80">{r.prompt}</p>
                <p className="mt-0.5 text-[10.5px] text-white/30">
                  {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {r.slides.length ? `${r.slides.length} slides` : r.status}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a] text-white">
      <style>{`
        @keyframes os-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes os-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes os-pop { from { opacity: 0; transform: translateY(6px) scale(.97) } to { opacity: 1; transform: none } }
        @keyframes os-orbit { to { transform: rotate(360deg) } }
        @keyframes os-glow { 0%,100% { opacity: .35 } 50% { opacity: .7 } }
        .os-in { animation: os-in .3s ease-out both }
        .os-pop { animation: os-pop .22s cubic-bezier(.2,.8,.2,1) both }
        .os-shimmer { background: linear-gradient(90deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.03) 100%); background-size: 200% 100%; animation: os-shimmer 1.6s linear infinite }
        .os-orbit { animation: os-orbit 2.4s linear infinite }
        .os-glow { animation: os-glow 2.6s ease-in-out infinite }
        .os-el:hover { box-shadow: 0 0 0 calc(1.5px / var(--osc-k, 1)) rgba(56,189,248,.9); background: rgba(56,189,248,.05) }
        .os-el.sel { box-shadow: 0 0 0 calc(2px / var(--osc-k, 1)) #ef4444, 0 0 0 calc(6px / var(--osc-k, 1)) rgba(239,68,68,.18); background: rgba(239,68,68,.04) }
      `}</style>
      {presenting && <Presenter pptx={presenting} references={images} startSlide={Math.max(0, slides.indexOf(active))} onClose={() => setPresenting(null)} />}
      <AppHeader left={<BackToHome onClick={onBack} />} right={<MainHeaderActions />} />

      <div className="flex overflow-hidden" style={{ marginTop: 64, height: "calc(100vh - 64px)" }}>
        {/* ══ Sidebar ══ */}
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0d0d0d]">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/25 to-red-500/5 ring-1 ring-red-500/20">
              {busy && <span className="os-glow absolute inset-0 rounded-xl bg-red-500/20 blur-md" />}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-none tracking-tight">OctoSlides</p>
              <p className="mt-1.5 truncate text-[11px] leading-none text-white/35">
                {busy ? runningTool?.label ?? "Thinking…" : hasDeck ? `${slides.length || "…"} slides · click an element to edit` : "Your presentation designer"}
              </p>
            </div>
            {runId && (
              <button type="button" onClick={resetDeck} disabled={busy} className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-white/55 transition hover:border-white/20 hover:text-white disabled:opacity-30">
                New deck
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3.5 py-4">
            <StepFeed items={feed} instant={replaying} empty={emptyFeed} />
          </div>

          {question && (
            <div className="os-pop border-t border-white/[0.06] px-3.5 pt-3">
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-3.5">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/20">
                    <Image src="/OCTOPILOT.png" alt="" width={12} height={12} className="opacity-90" />
                  </div>
                  <p className="text-[13px] leading-snug text-white/90">{question.question}</p>
                </div>
                {!!question.suggestions?.length && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {question.suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => void answer(s)} className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left text-[12px] text-white/75 transition hover:border-red-500/40 hover:bg-red-500/[0.08] hover:text-white">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={submitComposer} className="border-t border-white/[0.06] px-3.5 py-3.5">
            {notice && <p className="os-in mb-2 rounded-xl bg-amber-400/[0.08] px-3 py-2 text-[11.5px] leading-snug text-amber-200/90">{notice}</p>}
            {composerMode === "new" && attached && (
              <div className="os-pop mb-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-red-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/75">{attached.title}</span>
                <button type="button" onClick={() => setAttached(null)} className="text-[11px] text-white/35 hover:text-white">
                  Remove
                </button>
              </div>
            )}
            {composerMode === "new" && docPickerOpen && (
              <div className="os-pop mb-2 max-h-56 overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#141414] p-1 shadow-2xl">
                {docs === null && <p className="px-3 py-2 text-[11.5px] text-white/40">Loading your documents…</p>}
                {docs?.length === 0 && <p className="px-3 py-2 text-[11.5px] text-white/40">No saved documents yet.</p>}
                {docs?.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setAttached(d);
                      setDocPickerOpen(false);
                      if (!input.trim()) setInput(`A presentation of my essay "${d.title}" for `);
                      textareaRef.current?.focus();
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    <p className="truncate text-[12px] text-white/85">{d.title}</p>
                    <p className="text-[10.5px] text-white/30">
                      {d.word_count} words · {new Date(d.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition-colors focus-within:border-red-500/35 focus-within:bg-white/[0.045]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKey}
                rows={composerMode === "new" ? 3 : 2}
                disabled={busy && !question}
                placeholder={
                  composerMode === "answer" ? "Type your answer…" : composerMode === "new" ? "A 10-slide pitch for… / A class presentation about…" : busy ? "Working on your deck…" : "Ask for a change to the deck…"
                }
                className="max-h-40 min-h-[22px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-white placeholder-white/25 outline-none disabled:opacity-40"
              />
              <div className="mt-1 flex items-center gap-2">
                {composerMode === "new" && (
                  <button type="button" onClick={() => void loadDocs()} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-white/45 transition hover:bg-white/[0.06] hover:text-white">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    Use my document
                  </button>
                )}
                <span className="flex-1" />
                <button
                  type="submit"
                  disabled={!input.trim() || (busy && !question)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 shadow-[0_6px_20px_-6px_rgba(239,68,68,.7)] transition hover:scale-105 hover:bg-red-400 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-25 disabled:shadow-none"
                  aria-label="Send"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </aside>

        {/* ══ Stage ══ */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#080808]">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-2.5">
            <p className="min-w-0 flex-1 truncate text-[12.5px] text-white/50">
              {hasDeck ? (
                <>
                  Slide <span className="text-white">{active}</span> <span className="text-white/30">of {slides.length || "…"}</span>
                </>
              ) : (
                "Preview"
              )}
            </p>
            {busy && hasDeck && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-white/45">
                <Spinner /> updating
              </span>
            )}
            {hasDeck && watermark && (
              <button
                type="button"
                onClick={() => void toggleWatermark()}
                disabled={!watermark.canToggle || togglingMark || busy}
                title={watermark.canToggle ? "Show or hide the Octopilot AI badge" : "Free plan decks carry the Octopilot AI badge. Upgrade to Pro to remove it."}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] text-white/65 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:text-white/65"
              >
                <span className={`relative h-4 w-7 rounded-full transition ${watermark.enabled ? "bg-red-500/80" : "bg-white/15"} ${watermark.canToggle ? "" : "opacity-60"}`}>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${watermark.enabled ? "left-3.5" : "left-0.5"}`} />
                </span>
                Octopilot badge
                {!watermark.canToggle && <span className="rounded bg-white/[0.07] px-1.5 py-px text-[9.5px] uppercase tracking-wider text-white/45">Free</span>}
                {togglingMark && <Spinner />}
              </button>
            )}
            <button
              type="button"
              onClick={() => void present()}
              disabled={!hasDeck || openingShow}
              title="Present full screen"
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_6px_20px_-8px_rgba(239,68,68,.8)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
            >
              {openingShow ? (
                <Spinner />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
                </svg>
              )}
              Present
            </button>
            <button
              type="button"
              onClick={() => void download()}
              disabled={!hasDeck || downloading}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-black shadow-[0_6px_20px_-8px_rgba(255,255,255,.4)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
            >
              {downloading ? (
                <Spinner />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
              )}
              Download .pptx
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {!images[active] ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="relative w-full max-w-[1000px] overflow-hidden rounded-2xl border border-white/[0.06]" style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
                  <div className="os-shimmer absolute inset-0" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
                    {runId ? (
                      <>
                        <span className="relative flex h-12 w-12 items-center justify-center">
                          <span className="os-orbit absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, transparent 0 60%, rgba(239,68,68,.9) 90%, transparent)", WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))" }} />
                          <Image src="/OCTOPILOT.png" alt="" width={20} height={20} className="opacity-80" />
                        </span>
                        <p className="text-[13.5px] text-white/65">{runningTool?.label ?? (busy ? "Designing…" : "Loading slides…")}</p>
                        <p className="max-w-sm text-[11.5px] leading-relaxed text-white/30">Slides appear here as soon as the designer renders them for review.</p>
                      </>
                    ) : (
                      <p className="text-[13px] text-white/35">Your slides will appear here</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <SlideCanvas slideKey={`${active}`} onBackgroundClick={() => setSelected(null)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[active]}
                  alt={`Slide ${active}`}
                  width={STAGE_W}
                  height={STAGE_H}
                  className="absolute inset-0 h-full w-full rounded-[6px] shadow-[0_40px_120px_-30px_rgba(0,0,0,.9),0_0_0_1px_rgba(255,255,255,.06)]"
                  draggable={false}
                />
                {canEdit &&
                  slideElements.map((el) => (
                    <button
                      key={el.id}
                      type="button"
                      aria-label={`Edit ${el.name}`}
                      onMouseEnter={() => setHovered(el.id)}
                      onMouseLeave={() => setHovered((h) => (h === el.id ? null : h))}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectElement(el);
                      }}
                      className={`os-el absolute rounded-[2px] transition-[box-shadow,background-color] duration-150 ${selected?.id === el.id ? "sel" : ""}`}
                      style={{
                        left: el.x * STAGE_W,
                        top: el.y * STAGE_H,
                        width: el.w * STAGE_W,
                        height: el.h * STAGE_H,
                        transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
                        cursor: "pointer",
                      }}
                    >
                      {hovered === el.id && selected?.id !== el.id && (
                        <span
                          className="pointer-events-none absolute left-0 top-0 -translate-y-full whitespace-nowrap rounded-t bg-sky-400 px-1.5 py-px text-[10px] font-medium text-black"
                          style={{ transform: `translateY(-100%) scale(calc(1 / var(--osc-k, 1)))`, transformOrigin: "bottom left" }}
                        >
                          {el.name}
                        </span>
                      )}
                    </button>
                  ))}
                {selected && canEdit && (
                  <ElementPopover
                    el={selected}
                    draft={draft}
                    setDraft={setDraft}
                    askText={askText}
                    setAskText={setAskText}
                    saving={saving}
                    onSave={() => void saveText()}
                    onAsk={() => void askAboutElement()}
                    onClose={() => setSelected(null)}
                  />
                )}
              </SlideCanvas>
            )}
          </div>

          {slides.length > 0 && (
            <div className="flex gap-3 overflow-x-auto border-t border-white/[0.06] bg-[#0b0b0b] px-5 py-3">
              {slides.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setActive(n);
                    setSelected(null);
                  }}
                  className={`os-pop group relative shrink-0 overflow-hidden rounded-lg transition duration-300 ${n === active ? "ring-2 ring-red-500 ring-offset-2 ring-offset-[#0b0b0b]" : "opacity-55 ring-1 ring-white/10 hover:-translate-y-0.5 hover:opacity-100"}`}
                  style={{ width: 136, height: (136 * STAGE_H) / STAGE_W, animationDelay: `${i * 50}ms` }}
                >
                  {images[n] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[n]} alt={`Slide ${n}`} className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <span className="os-shimmer block h-full w-full" />
                  )}
                  <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 text-[10px] tabular-nums text-white/85 backdrop-blur">{n}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ElementPopover(props: {
  el: LayoutElement;
  draft: string;
  setDraft: (v: string) => void;
  askText: string;
  setAskText: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  const { el, draft, setDraft, askText, setAskText, saving, onSave, onAsk, onClose } = props;
  // anchored to the element in slide space, counter-scaled so it stays readable at any zoom
  const below = el.y + el.h < 0.6;
  const anchorX = Math.min(Math.max(el.x, 0), 0.7) * STAGE_W;
  const anchorY = (below ? el.y + el.h : el.y) * STAGE_H;
  const kind = { text: "Text", shape: "Shape", image: "Image", chart: "Chart", table: "Table", group: "Group" }[el.kind];
  const changed = el.kind === "text" && draft !== (el.text ?? "");
  return (
    <div
      className="absolute z-20"
      style={{
        left: anchorX,
        top: anchorY,
        transform: `scale(calc(1 / var(--osc-k, 1))) translateY(${below ? "10px" : "calc(-100% - 10px)"})`,
        transformOrigin: "top left",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="os-pop w-[380px] rounded-2xl border border-white/10 bg-[#121212]/95 p-3.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/55">{kind}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/35">{el.name}</span>
          <button type="button" onClick={onClose} className="rounded-md p-0.5 text-white/35 transition hover:bg-white/[0.08] hover:text-white" aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {el.kind === "text" && (
          <>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && changed) onSave();
              }}
              rows={Math.min(6, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-white outline-none transition focus:border-red-500/40"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10.5px] text-white/30">Keeps the styling · free · Ctrl+Enter</p>
              <button type="button" onClick={onSave} disabled={!changed || saving} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-30">
                {saving && <Spinner />}
                Save text
              </button>
            </div>
            <div className="my-3 h-px bg-white/[0.07]" />
          </>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-1.5 transition focus-within:border-red-500/40">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-300/80">
            <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11l5.6-2 1.9-5.5Z" />
          </svg>
          <input
            autoFocus={el.kind !== "text"}
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && askText.trim()) onAsk();
            }}
            placeholder={el.kind === "image" ? "Swap for a city photo, crop tighter…" : "Make it bolder, move it left…"}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white placeholder-white/25 outline-none"
          />
          <button type="button" onClick={onAsk} disabled={!askText.trim()} className="rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-red-400 disabled:opacity-30">
            Ask AI
          </button>
        </div>
      </div>
    </div>
  );
}
