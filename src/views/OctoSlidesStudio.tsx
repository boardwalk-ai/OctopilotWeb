"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";
import dynamic from "next/dynamic";
import SlideCanvas, { STAGE_H, STAGE_W } from "@/components/octoslides/SlideCanvas";
import ChatFeed, { type FeedItem } from "@/components/octoslides/ChatFeed";
import "@/components/octoslides/m3.css";
import MemoryPanel from "@/components/octoslides/MemoryPanel";
import ThemePicker from "@/components/octoslides/ThemePicker";
import GeneratingSlide, { GeneratingField, GeneratingStyles } from "@/components/octoslides/GeneratingSlide";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";
import FullEditor from "@/components/octoslides/FullEditor";

/**
 * OctoSlides studio for the pptxgenjs designer (/api/octoslides).
 * Left: the designer's activity (a paced, animated timeline) and a composer.
 * Right: the slide on a pan/zoom canvas; click any element to edit its text
 * directly (free) or ask the designer to change it.
 */

type Props = { onBack: () => void; initialRunId?: string | null };

const SIDE_KEY = "octoslides.sidebarWidth";
const SIDE_MIN = 300;
const SIDE_MAX = 640;
const SIDE_DEFAULT = 360;

/** Each deck has its own address, so reload, back and new tabs keep it. */
const STUDIO_PATH = "/octopilot-slides";
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function runIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/octopilot-slides\/([^/]+)\/?$/);
  return m && RUN_ID.test(m[1]) ? m[1].toLowerCase() : null;
}
function setPath(path: string, replace = false) {
  if (typeof window === "undefined" || window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
}

type ServerEvent =
  | { type: "run_started"; runId: string }
  | { type: "turn_started"; text: string; target?: { slide: number; name: string } }
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "thinking_started"; id: string; step: number }
  | { type: "thinking_progress"; id: string; text: string }
  | { type: "thinking_finished"; id: string }
  | { type: "code_progress"; id: string; path: string; chars: number }
  | { type: "code_finished"; id: string; interrupted: boolean }
  | { type: "tool_started"; id: string; name: string; summary: string }
  | { type: "tool_progress"; id: string; elapsedMs: number }
  | { type: "tool_finished"; id: string; name: string; ok: boolean; summary: string }
  | { type: "slides_rendered"; slides: number[]; version: number }
  | { type: "deck_ready"; bytes: number; version: number }
  | { type: "ask_user"; question: string; kind?: "slide_count" | "color_theme" | "other"; suggestions?: string[] }
  | { type: "usage"; costUsd: number; steps: number }
  | { type: "watermark"; enabled: boolean; canToggle: boolean; reason: "free" | "pro" | "admin" }
  | { type: "outline"; slides: Array<{ title: string }> }
  | { type: "steer"; text: string; applied: boolean }
  | { type: "answered"; text: string }
  | { type: "stopped"; message: string }
  | { type: "complete"; summary: string }
  | { type: "error"; message: string };

type LayoutElement = { id: string; name: string; kind: "text" | "shape" | "image" | "chart" | "table" | "group"; x: number; y: number; w: number; h: number; rot?: number; text?: string; animations?: Array<{ effect: string; trigger?: string; durationMs?: number; delayMs?: number }>; format?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: string; color?: string; size?: number; font?: string } };
type Layout = { slides: Array<{ slide: number; elements: LayoutElement[]; transition?: string }> };
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
  search_document: "Searching your document",
  remember: "Remembering this for next time",
  forget: "Forgetting an old preference",
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


export default function OctoSlidesStudio({ onBack, initialRunId = null }: Props) {
  const [runId, setRunId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<{ question: string; kind?: "slide_count" | "color_theme" | "other"; suggestions?: string[] } | null>(null);
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
  const [docs, setDocs] = useState<DocumentRow[] | null | "error">(null);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [attached, setAttached] = useState<DocumentRow | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [editorMode, setEditorMode] = useState(false);
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [togglingMark, setTogglingMark] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [recentError, setRecentError] = useState(false);
  /** narrow screens show one pane at a time */
  const [mobilePane, setMobilePane] = useState<"chat" | "slides">("chat");
  // the chat panel's width: dragged by the user, remembered on this device
  const [sideW, setSideW] = useState(SIDE_DEFAULT);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDE_KEY));
      if (saved >= SIDE_MIN && saved <= SIDE_MAX) {
        const t = setTimeout(() => setSideW(saved), 0);
        return () => clearTimeout(t);
      }
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  const saveSide = useCallback((w: number) => {
    const next = Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)));
    setSideW(next);
    try {
      localStorage.setItem(SIDE_KEY, String(next));
    } catch {
      // storage unavailable
    }
  }, []);
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = sideW;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => setSideW(Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, startW + ev.clientX - startX))));
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      saveSide(startW + ev.clientX - startX);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  // the site header wraps to two rows on narrow screens: sit below whatever height it has
  const [headerH, setHeaderH] = useState(64);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const ro = new ResizeObserver(() => setHeaderH(Math.max(56, Math.round(header.getBoundingClientRect().bottom))));
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  const [outline, setOutline] = useState<string[]>([]);

  // two clicks to delete: the first arms the button for a few seconds
  const removeDeck = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete((c) => (c === id ? null : c)), 3500);
      return;
    }
    setConfirmDelete(null);
    setRecent((r) => r.filter((x) => x.runId !== id));
    try {
      await jsonOrError(await fetchWithUserAuthorization(`${API}/${id}`, { method: "DELETE" }));
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const [presenting, setPresenting] = useState<ArrayBuffer | null>(null);
  const [openingShow, setOpeningShow] = useState(false);

  const streamAbort = useRef<AbortController | null>(null);
  const imageUrls = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // a failed load says so; it is never shown as "no decks"
  const loadRecent = useCallback(() => {
    setRecentError(false);
    fetchWithUserAuthorization(API)
      .then(jsonOrError)
      .then((d) => setRecent((d.runs as RunRow[]) ?? []))
      .catch(() => setRecentError(true));
  }, []);
  useEffect(() => {
    const t = setTimeout(loadRecent, 0);
    return () => clearTimeout(t);
  }, [loadRecent]);

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
          setFeed((f) => [...f, { kind: "thinking", id: `t-${f.length}`, text: ev.text, status: "done" }]);
          break;
        case "thinking_started":
          setFeed((f) => [...f, { kind: "thinking", id: ev.id, text: "", status: "running", startedAt: Date.now() }]);
          break;
        case "thinking_progress":
          setFeed((f) => f.some((row) => row.id === ev.id)
            ? f.map((row) => row.kind === "thinking" && row.id === ev.id ? { ...row, text: ev.text } : row)
            : [...f, { kind: "thinking", id: ev.id, text: ev.text, status: "running", startedAt: Date.now() }]);
          break;
        case "thinking_finished":
          setFeed((f) => f.flatMap((row) => row.kind === "thinking" && row.id === ev.id
            ? row.text ? [{ ...row, status: "done" as const }] : []
            : [row]));
          break;
        case "code_progress":
          setFeed((f) => f.some((row) => row.id === ev.id)
            ? f.map((row) => row.kind === "tool" && row.id === ev.id
              ? { ...row, label: `Generating ${ev.path}`, detail: `${ev.chars.toLocaleString()} chars` }
              : row)
            : [...f, { kind: "tool", id: ev.id, name: "write_file", label: `Generating ${ev.path}`, detail: `${ev.chars.toLocaleString()} chars`, status: "running" }]);
          break;
        case "code_finished":
          setFeed((f) => f.map((row) => row.kind === "tool" && row.id === ev.id
            ? { ...row, status: ev.interrupted ? "error" : "done", detail: ev.interrupted ? `${row.detail} · interrupted` : row.detail }
            : row));
          break;
        case "tool_started":
          setFeed((f) => [...f, { kind: "tool", id: ev.id, name: ev.name, label: TOOL_LABELS[ev.name] ?? ev.name, detail: ev.summary, status: "running" }]);
          if (ev.name === "manual_edit") setBusy(true);
          break;
        case "tool_progress":
          setFeed((f) => f.map((row) => row.kind === "tool" && row.id === ev.id ? { ...row, elapsedMs: ev.elapsedMs } : row));
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
          setFeed((f) => [...f, { kind: "question", id: `q-${f.length}`, text: ev.question }]);
          setQuestion({
            question: ev.question,
            // a color question always gets the theme picker, even if the event's kind is off
            kind: ev.kind === "color_theme" || (ev.kind !== "slide_count" && /\b(colou?rs?|theme|palette)\b/i.test(ev.question)) ? "color_theme" : ev.kind,
            suggestions: ev.suggestions,
          });
          break;
        case "answered":
          setFeed((f) => [...f, { kind: "user", id: `a-${f.length}`, text: ev.text }]);
          break;
        case "deck_ready":
          setDeckVersion(ev.version);
          break;
        case "watermark":
          setWatermark({ enabled: ev.enabled, canToggle: ev.canToggle, reason: ev.reason });
          break;
        case "slides_rendered":
          setRender({ version: ev.version, slides: ev.slides });
          setRecent((rows) => rows.map((row) => row.runId === id
            ? { ...row, slides: ev.slides, renderedVersion: ev.version }
            : row));
          void loadRender(id, ev.slides, ev.version);
          break;
        case "outline":
          setOutline(ev.slides.map((sl) => sl.title));
          break;
        case "steer":
          setFeed((f) =>
            ev.applied
              ? [...f, { kind: "tool", id: `s-${f.length}`, name: "steer", label: "Folding in your note", detail: "", status: "done" }]
              : [...f, { kind: "user", id: `n-${f.length}`, text: ev.text, steer: true }],
          );
          break;
        case "stopped":
          setBusy(false);
          setQuestion(null);
          setStopping(false);
          setRecent((rows) => rows.map((row) => row.runId === id ? { ...row, status: "idle" } : row));
          setFeed((f) => [...f.map((x) => (x.kind === "tool" && x.status === "running" ? { ...x, status: "error" as const, detail: "Stopped" } : x)), { kind: "notice", id: `x-${f.length}`, text: ev.message }]);
          break;
        case "complete":
          setStopping(false);
          setBusy(false);
          setQuestion(null);
          setRecent((rows) => rows.map((row) => row.runId === id ? { ...row, status: "idle" } : row));
          setFeed((f) => [...f, { kind: "complete", id: `c-${f.length}`, text: ev.summary }]);
          break;
        case "error":
          setBusy(false);
          setQuestion(null);
          setRecent((rows) => rows.map((row) => row.runId === id ? { ...row, status: "error" } : row));
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
        try {
          const res = await fetchWithUserAuthorization(`${API}/${id}/events`, { signal: controller.signal, headers: { Accept: "text/event-stream" } });
          if (res.status === 404) {
            setNotice("That deck is no longer available. It may have been deleted, or it belongs to another account.");
            setRunId(null);
            setPath(STUDIO_PATH, true);
            return;
          }
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let lastRender: { slides: number[]; version: number } | null = null;
          let inReplay = true;
          const replayTimer = setTimeout(() => {
            inReplay = false;
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
        } catch {
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
    setEditorMode(false);
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
    setOutline([]);
  };

  const openRun = (id: string, push = true) => {
    resetDeck();
    setRunId(id);
    connect(id);
    if (push) setPath(`${STUDIO_PATH}/${id}`);
  };

  const newDeck = () => {
    resetDeck();
    setPath(STUDIO_PATH);
  };

  // open the deck in the address on arrival, and follow back / forward
  const openRunRef = useRef(openRun);
  const newDeckRef = useRef(resetDeck);
  useEffect(() => {
    openRunRef.current = openRun;
    newDeckRef.current = resetDeck;
  });
  useEffect(() => {
    if (initialRunId && RUN_ID.test(initialRunId)) openRunRef.current(initialRunId.toLowerCase(), false);
    else if (window.location.pathname === "/") setPath(STUDIO_PATH);
    const onPop = () => {
      const id = runIdFromPath(window.location.pathname);
      if (id) openRunRef.current(id, false);
      else if (window.location.pathname.startsWith(STUDIO_PATH)) newDeckRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [initialRunId]);

  const startDeck = async (prompt: string) => {
    setNotice(null);
    try {
      const upload = uploadedFiles.length > 0;
      const form = new FormData();
      if (upload) {
        form.set("prompt", prompt);
        if (attached) form.set("documentId", attached.id);
        uploadedFiles.forEach((file) => form.append("files", file));
      }
      const data = await jsonOrError(
        await fetchWithUserAuthorization(API, {
          method: "POST",
          ...(upload ? {} : { headers: { "Content-Type": "application/json" } }),
          body: upload ? form : JSON.stringify({ prompt, ...(attached ? { documentId: attached.id } : {}) }),
        }),
      );
      const id = String(data.runId);
      resetDeck();
      setRunId(id);
      setBusy(true);
      setAttached(null);
      setUploadedFiles([]);
      connect(id);
      setPath(`${STUDIO_PATH}/${id}`);
      setRecent((r) => [{ runId: id, prompt, status: "running", createdAt: Date.now(), slides: [], renderedVersion: -1 }, ...r]);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const sendFollowUp = async (text: string, target?: { slide: number; name: string }, editorSlide?: number) => {
    if (!runId) return;
    setNotice(null);
    try {
      await jsonOrError(
        await fetchWithUserAuthorization(`${API}/${runId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, ...(target ? { target } : {}), ...(editorSlide ? { editor: true, slide: editorSlide } : {}) }),
        }),
      );
      setBusy(true);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const stop = async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await jsonOrError(await fetchWithUserAuthorization(`${API}/${runId}/stop`, { method: "POST" }));
    } catch (e) {
      setStopping(false);
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
      // the server echoes the answer as an `answered` event, which adds it to the chat
      setQuestion(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const submitComposer = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (question) void answer(text);
    else if (runId && busy) {
      // steering: the designer folds this into the work in progress
      if (stopping) return;
      void sendFollowUp(text);
    } else if (!runId || !deckVersion) void startDeck(text);
    else void sendFollowUp(text);
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

  const saveElement = async (edit: Record<string, unknown>) => {
    if (!runId || !selected) return;
    setSaving(true);
    setNotice(null);
    try {
      await jsonOrError(await fetchWithUserAuthorization(`${API}/${runId}/edits`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: active, name: selected.name, ...edit }),
      }));
      setSelected(null);
    } catch (error) { setNotice((error as Error).message); }
    finally { setSaving(false); }
  };

  const editorEdit = async (name: string, edit: Record<string, unknown>) => {
    if (!runId) return;
    setSaving(true);
    setNotice(null);
    try {
      await jsonOrError(await fetchWithUserAuthorization(`${API}/${runId}/edits`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: active, name, ...edit }),
      }));
      if (edit.deleted) setSelected(null);
    } catch (error) { setNotice((error as Error).message); }
    finally { setSaving(false); }
  };

  const saveTransition = async (transition: string) => {
    if (!runId) return;
    const slide = active;
    setSaving(true);
    setNotice(null);
    try {
      await jsonOrError(await fetchWithUserAuthorization(`${API}/${runId}/edits`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide, transition }),
      }));
    } catch (error) {
      setNotice((error as Error).message);
    } finally { setSaving(false); }
  };

  const addElement = async (kind: "text" | "shape") => {
    if (!runId) return;
    setSaving(true);
    setNotice(null);
    try {
      await jsonOrError(await fetchWithUserAuthorization(`${API}/${runId}/edits`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: active, add: kind }),
      }));
    } catch (error) { setNotice((error as Error).message); }
    finally { setSaving(false); }
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

  const loadDocs = async (retry = false) => {
    if (!retry) setDocPickerOpen((o) => !o);
    if (Array.isArray(docs) && !retry) return;
    setDocs(null);
    try {
      const data = await jsonOrError(await fetchWithUserAuthorization("/api/documents"));
      setDocs((data.documents as DocumentRow[]) ?? []);
    } catch {
      setDocs("error");
    }
  };

  // arrows switch slides, Esc deselects
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (presenting) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // Escape only closes things; stopping the designer is the Stop button's job
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        else if (docPickerOpen) setDocPickerOpen(false);
        else if (memoryOpen) setMemoryOpen(false);
      }
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
  }, [render, presenting, selected, docPickerOpen, memoryOpen]);

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
  const editorSelected = selected ? layout?.slides.find((slide) => slide.slide === active)?.elements.find((element) => element.name === selected.name) ?? null : null;

  const slides = render?.slides ?? [];
  // planned slides show up (as "being designed") before the first render exists
  const thumbs = Array.from({ length: Math.max(outline.length, slides.length ? Math.max(...slides) : 0) }, (_, i) => i + 1);
  const hasDeck = deckVersion > 0;
  const canEdit = hasDeck && !busy && !!layout;
  const runningTool = [...feed].reverse().find((f): f is Extract<FeedItem, { kind: "tool" }> => f.kind === "tool" && f.status === "running");
  const composerMode = question ? "answer" : runId && busy ? "steer" : !runId || !hasDeck ? "new" : "change";

  const emptyFeed = !runId ? (
    <div className="enter space-y-6">
      <div>
        <h2 className="t-title-m">What are we presenting?</h2>
        <p className="t-body-m on-variant mt-2">
          Say what the deck is for, who will see it and roughly how long it is. Attach one of your Octopilot documents to build it from your own essay and sources.
        </p>
      </div>
      {recentError ? (
        <div className="flex items-center gap-3 rounded-[var(--md-shape-m)] px-4 py-3" style={{ background: "var(--md-error-container)", color: "var(--md-on-error-container)" }}>
          <p className="t-body-m flex-1">Couldn&apos;t load your decks.</p>
          <button type="button" onClick={loadRecent} className="state btn btn-text" style={{ color: "var(--md-on-error-container)" }}>
            Retry
          </button>
        </div>
      ) : (
        recent.length > 0 && (
          <section aria-labelledby="your-decks">
            <h3 id="your-decks" className="t-title-s mb-1 px-1">
              Your decks <span className="t-body-s on-variant">· kept 30 days</span>
            </h3>
            <ul className="-mx-2">
              {recent.map((r) => (
                <li key={r.runId} className="group flex items-center rounded-[var(--md-shape-m)]">
                  <button type="button" onClick={() => openRun(r.runId)} className="state flex min-w-0 flex-1 flex-col rounded-[var(--md-shape-m)] px-3 py-2.5 text-left">
                    <span className="t-body-m truncate">{r.prompt}</span>
                    <span className="t-body-s on-variant">
                      {new Date(r.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })},{" "}
                      {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {r.slides.length ? `${r.slides.length} slides` : r.status}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={confirmDelete === r.runId ? "Confirm: delete this deck for good" : "Delete deck"}
                    title={confirmDelete === r.runId ? "Click again to delete for good" : "Delete deck"}
                    onClick={() => void removeDeck(r.runId)}
                    className={`state ${confirmDelete === r.runId ? "btn btn-filled !h-8 !px-3" : "icon-btn opacity-0 focus-visible:opacity-100 group-hover:opacity-100"}`}
                  >
                    {confirmDelete === r.runId ? (
                      "Delete"
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  ) : null;

  const sendIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.4 19.4 21 12 4.4 4.6l.02 5.77L16 12 4.42 13.63 4.4 19.4Z" />
    </svg>
  );

  return (
    <div className="m3 fixed inset-0 flex flex-col overflow-hidden">
      <style>{`
        @keyframes os-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes os-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes os-pop { from { opacity: 0; transform: translateY(6px) scale(.97) } to { opacity: 1; transform: none } }
        @keyframes os-orbit { to { transform: rotate(360deg) } }
        @keyframes os-glow { 0%,100% { opacity: .35 } 50% { opacity: .7 } }
        @keyframes os-sidebar-exit { to { transform: translateX(-105%); opacity: 0 } }
        @keyframes os-editor-enter { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        .os-sidebar-exit { animation: os-sidebar-exit .34s cubic-bezier(.2,.8,.2,1) both }
        .os-full-editor { animation: os-editor-enter .35s .22s cubic-bezier(.2,.8,.2,1) both }
        .os-in { animation: os-in .3s ease-out both }
        .os-pop { animation: os-pop .22s cubic-bezier(.2,.8,.2,1) both }
        .os-shimmer { background: linear-gradient(90deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.03) 100%); background-size: 200% 100%; animation: os-shimmer 1.6s linear infinite }
        .os-orbit { animation: os-orbit 2.4s linear infinite }
        .os-glow { animation: os-glow 2.6s ease-in-out infinite }
        .os-el:hover { box-shadow: 0 0 0 calc(1.5px / var(--osc-k, 1)) rgba(56,189,248,.9); background: rgba(56,189,248,.05) }
        .os-el.sel { box-shadow: 0 0 0 calc(2px / var(--osc-k, 1)) #ef4444, 0 0 0 calc(6px / var(--osc-k, 1)) rgba(239,68,68,.18); background: rgba(239,68,68,.04) }
      `}</style>
      {presenting && <Presenter pptx={presenting} references={images} startSlide={Math.max(0, slides.indexOf(active))} onClose={() => setPresenting(null)} />}
      <GeneratingStyles />
      <AppHeader left={<BackToHome onClick={onBack} />} right={<MainHeaderActions />} />

      <div className="relative mt-[var(--os-header)] flex min-h-0 flex-1 overflow-hidden" style={{ ["--os-header" as string]: `${headerH}px` }}>
        {/* ══ Sidebar ══ */}
        <aside
          className={`relative flex w-full shrink-0 flex-col md:w-[var(--os-side)] ${mobilePane === "slides" ? "hidden md:flex" : "flex"} ${editorMode ? "os-sidebar-exit" : ""}`}
          style={{ background: "var(--md-surface)", borderRight: "1px solid var(--md-outline-variant)", ["--os-side" as string]: `${sideW}px` }}
          aria-label="Designer chat"
        >
          {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}
          <header className="flex h-16 shrink-0 items-center gap-2 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              <h1 className="t-title-m truncate">OctoSlides</h1>
              <p className="t-body-s on-variant truncate">
                {busy ? runningTool?.label ?? "Thinking…" : hasDeck ? `${slides.length || "…"} slides · select an element to edit it` : "Your presentation designer"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMemoryOpen((v) => !v)}
              title="What OctoSlides remembers about you"
              aria-label="Memory"
              aria-pressed={memoryOpen}
              className={`state icon-btn ${memoryOpen ? "selected" : ""}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3ZM9.5 20h5" />
              </svg>
            </button>
            {runId && (
              <button type="button" onClick={newDeck} disabled={busy} className="state btn btn-tonal has-icon !h-9">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New deck
              </button>
            )}
          </header>

          <div data-chat-scroll className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
            <ChatFeed
              items={feed}
              empty={emptyFeed}
              busy={busy}
              actions={
                hasDeck ? (
                  <>
                    <button type="button" onClick={() => void present()} className="state chip has-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                      </svg>
                      Present
                    </button>
                    <button type="button" onClick={() => void download()} className="state chip has-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
                      </svg>
                      Download .pptx
                    </button>
                    <button type="button" onClick={() => setMobilePane("slides")} className="state chip md:hidden">
                      View slides
                    </button>
                  </>
                ) : null
              }
            />
          </div>

          {question && question.kind !== "color_theme" && !!question.suggestions?.length && (
            <div className="enter flex flex-wrap gap-2 px-4 pb-2" role="group" aria-label="Suggested answers">
              {question.suggestions.map((sug) => (
                <button key={sug} type="button" onClick={() => void answer(sug)} className="state chip">
                  {sug}
                </button>
              ))}
            </div>
          )}
          {question?.kind === "color_theme" && (
            <p className="t-body-s on-variant px-5 pb-2">Choose a theme on the right, or type your own colors below.</p>
          )}

          <form onSubmit={submitComposer} className="shrink-0 px-3 pb-3">
            {notice && (
              <div className="enter mb-2 flex items-start gap-3 rounded-[var(--md-shape-m)] px-4 py-3" role="alert" style={{ background: "var(--md-error-container)", color: "var(--md-on-error-container)" }}>
                <p className="t-body-m flex-1">{notice}</p>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="state icon-btn !h-6 !w-6" style={{ color: "var(--md-on-error-container)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {composerMode === "new" && docPickerOpen && (
              <div className="menu enter mb-2 max-h-64 overflow-y-auto" role="listbox" aria-label="Your documents">
                {docs === null && <p className="t-body-m on-variant px-4 py-3">Loading your documents…</p>}
                {docs === "error" && (
                  <div className="flex items-center gap-2 px-4 py-2">
                    <p className="t-body-m flex-1" style={{ color: "var(--md-error)" }}>
                      Couldn&apos;t load your documents.
                    </p>
                    <button type="button" onClick={() => void loadDocs(true)} className="state btn btn-text">
                      Retry
                    </button>
                  </div>
                )}
                {Array.isArray(docs) && docs.length === 0 && <p className="t-body-m on-variant px-4 py-3">No saved documents yet. Save an essay in Octopilot first.</p>}
                {Array.isArray(docs) &&
                  docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      role="option"
                      aria-selected={attached?.id === d.id}
                      onClick={() => {
                        setAttached(d);
                        setDocPickerOpen(false);
                        if (!input.trim()) setInput(`A presentation of my essay "${d.title}" for `);
                        textareaRef.current?.focus();
                      }}
                      className="state menu-item"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="t-body-m block truncate">{d.title}</span>
                        <span className="t-body-s on-variant block">
                          {d.word_count} words · {new Date(d.updated_at).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            )}
            <div className="composer rounded-[var(--md-shape-xl)] px-2 pb-2 pt-1" style={{ background: "var(--md-surface-container-high)" }}>
              {composerMode === "new" && attached && (
                <div className="enter px-2 pt-2">
                  <span className="chip selected has-icon !pr-1">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
                      <path d="M14 3v5h5" />
                    </svg>
                    <span className="max-w-[200px] truncate">{attached.title}</span>
                    <button type="button" onClick={() => setAttached(null)} aria-label="Remove document" className="state icon-btn !h-6 !w-6">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                </div>
              )}
              {composerMode === "new" && uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1 px-2 pt-2">
                  {uploadedFiles.map((file, index) => <span key={`${file.name}-${index}`} className="chip selected !pr-1">
                    <span className="max-w-[160px] truncate">{file.name}</span>
                    <button type="button" className="state icon-btn !h-6 !w-6" aria-label={`Remove ${file.name}`} onClick={() => setUploadedFiles((files) => files.filter((_, i) => i !== index))}>×</button>
                  </span>)}
                </div>
              )}
              <label htmlFor="octoslides-composer" className="sr-only">
                {composerMode === "answer" ? "Your answer" : composerMode === "steer" ? "Add to the request" : composerMode === "new" ? "Describe your deck" : "Ask for a change"}
              </label>
              <textarea
                id="octoslides-composer"
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKey}
                rows={composerMode === "new" ? 3 : 2}
                placeholder={
                  composerMode === "answer"
                    ? "Type your answer"
                    : composerMode === "steer"
                      ? "Forgot something? Add it and the designer folds it in"
                      : composerMode === "new"
                        ? "A 10-slide pitch for…  /  A class presentation about…"
                        : "Ask for a change to the deck"
                }
                className="t-body-m block max-h-48 min-h-[24px] w-full resize-none bg-transparent px-3 pt-3 focus:outline-none focus-visible:outline-none"
                style={{ color: "var(--md-on-surface)" }}
              />
              <div className="mt-1 flex items-center gap-1">
                {composerMode === "new" && (
                  <>
                  <button type="button" onClick={() => void loadDocs()} aria-expanded={docPickerOpen} className="state btn btn-text neutral has-icon !h-9 !pl-2.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    Use my document
                  </button>
                  <label className="state btn btn-text neutral has-icon !h-9 !pl-2.5 cursor-pointer">
                    Add files
                    <input type="file" className="sr-only" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.avif" onChange={(event) => {
                      const next = [...uploadedFiles, ...Array.from(event.target.files ?? [])];
                      event.target.value = "";
                      if (next.length > 3) { setNotice("Attach at most 3 files."); return; }
                      if (next.some((file) => file.size > 20 * 1024 * 1024) || next.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024) { setNotice("Each file must be 20 MB or smaller; 40 MB total."); return; }
                      setUploadedFiles(next);
                      setNotice(null);
                    }} />
                  </label>
                  </>
                )}
                <span className="flex-1" />
                {busy && !question && (
                  <button type="button" onClick={() => void stop()} disabled={stopping} title="Stop the designer" aria-label="Stop the designer" className="state icon-btn tonal">
                    {stopping ? <span className="progress-circular" /> : <span className="block h-3.5 w-3.5 rounded-[3px] bg-current" />}
                  </button>
                )}
                <button type="submit" disabled={!input.trim() || stopping} aria-label={composerMode === "steer" ? "Add to the request" : "Send"} className="state icon-btn filled">
                  {sendIcon}
                </button>
              </div>
            </div>
            <p className="t-body-s on-variant mt-1.5 px-3">Enter to send · Shift+Enter for a new line</p>
          </form>
          {/* drag (or arrow keys) to resize; double-click resets */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the chat panel"
            aria-valuemin={SIDE_MIN}
            aria-valuemax={SIDE_MAX}
            aria-valuenow={sideW}
            tabIndex={0}
            onPointerDown={startResize}
            onDoubleClick={() => saveSide(SIDE_DEFAULT)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") saveSide(sideW - 24);
              if (e.key === "ArrowRight") saveSide(sideW + 24);
            }}
            className="os-resize absolute -right-[5px] top-0 z-20 hidden h-full w-[10px] cursor-col-resize md:block"
          />
        </aside>

        {/* ══ Stage ══ */}
        <main className={`min-w-0 flex-1 flex-col ${mobilePane === "chat" ? "hidden md:flex" : "flex"}`} style={{ background: "var(--md-surface-dim)" }} aria-label="Slides">
          <div className="flex h-16 shrink-0 items-center gap-2 px-3 md:px-5" style={{ borderBottom: "1px solid var(--md-outline-variant)" }}>
            <button type="button" onClick={() => setMobilePane("chat")} aria-label="Back to the chat" className="state icon-btn md:hidden">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <p className="t-title-s min-w-0 flex-1 truncate">
              {hasDeck ? (
                <>
                  Slide {active} <span className="on-variant">of {slides.length || "…"}</span>
                </>
              ) : (
                <span className="on-variant">Preview</span>
              )}
            </p>
            {hasDeck && <button type="button" onClick={() => setEditorMode(true)} disabled={busy} className="state btn btn-tonal">Edit</button>}
            {busy && hasDeck && (
              <span className="t-label-m on-variant hidden items-center gap-2 sm:flex">
                <span className="progress-circular" /> Updating
              </span>
            )}
            {hasDeck && watermark && (
              <label
                className={`hidden items-center gap-3 rounded-full py-1 pl-3 pr-1 sm:flex ${watermark.canToggle ? "cursor-pointer" : ""}`}
                title={watermark.canToggle ? "Show or hide the Octopilot AI badge" : "Free plan decks carry the Octopilot AI badge. Upgrade to Pro to remove it."}
              >
                <span className="t-label-l">
                  Octopilot badge{!watermark.canToggle && <span className="t-label-s on-variant ml-1.5">Free plan</span>}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={watermark.enabled}
                  aria-label="Octopilot badge"
                  onClick={() => void toggleWatermark()}
                  disabled={!watermark.canToggle || togglingMark || busy}
                  className={`switch ${watermark.enabled ? "on" : ""} ${watermark.canToggle ? "" : "locked"}`}
                />
              </label>
            )}
            <button type="button" onClick={() => void download()} disabled={!hasDeck || downloading} className="state btn btn-outlined has-icon hidden sm:inline-flex">
              {downloading ? (
                <span className="progress-circular" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
                </svg>
              )}
              Download
            </button>
            <button type="button" onClick={() => void present()} disabled={!hasDeck || openingShow} title="Present full screen" className="state btn btn-filled has-icon">
              {openingShow ? (
                <span className="progress-circular" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              )}
              Present
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {question?.kind === "color_theme" && <ThemePicker question={question.question} onPick={answer} />}
            {!images[active] && outline.length > 0 && active <= outline.length ? (
              <GeneratingSlide
                key={`gen-${active}`}
                index={active - 1}
                total={outline.length}
                title={outline[active - 1]}
                status={runningTool?.label ?? "Designing"}
              />
            ) : !images[active] ? (
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
                  key={images[active]}
                  src={images[active]}
                  alt={`Slide ${active}`}
                  width={STAGE_W}
                  height={STAGE_H}
                  className="os-reveal absolute inset-0 h-full w-full rounded-[6px] shadow-[0_40px_120px_-30px_rgba(0,0,0,.9),0_0_0_1px_rgba(255,255,255,.06)]"
                  draggable={false}
                />
                {canEdit && editorMode &&
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
                {selected && canEdit && editorMode && (
                  <ElementPopover
                    key={`${active}-${selected.id}`}
                    el={selected}
                    draft={draft}
                    setDraft={setDraft}
                    askText={askText}
                    setAskText={setAskText}
                    saving={saving}
                    onSave={() => void saveText()}
                    onSaveElement={(edit) => void saveElement(edit)}
                    onAsk={() => void askAboutElement()}
                    onClose={() => setSelected(null)}
                  />
                )}
              </SlideCanvas>
            )}
          </div>

          {thumbs.length > 0 && (
            <nav className="flex shrink-0 gap-3 overflow-x-auto px-3 py-3 md:px-5" style={{ borderTop: "1px solid var(--md-outline-variant)", background: "var(--md-surface)" }} aria-label="Slides">
              {thumbs.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Slide ${n}${outline[n - 1] ? `: ${outline[n - 1]}` : ""}`}
                  aria-current={n === active ? "true" : undefined}
                  onClick={() => {
                    setActive(n);
                    setSelected(null);
                  }}
                  className="enter group relative shrink-0 rounded-[var(--md-shape-m)] p-1 transition-colors"
                  style={{ animationDelay: `${i * 40}ms`, background: n === active ? "var(--md-secondary-container)" : "transparent" }}
                >
                  <span
                    className="relative block overflow-hidden rounded-[var(--md-shape-s)]"
                    style={{ width: 144, height: (144 * STAGE_H) / STAGE_W, outline: n === active ? "2px solid var(--md-primary)" : "1px solid var(--md-outline-variant)", outlineOffset: n === active ? 0 : -1 }}
                  >
                    {images[n] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={images[n]} src={images[n]} alt="" className="os-reveal h-full w-full object-cover" style={{ animationDelay: `${(n - 1) * 90}ms` }} draggable={false} />
                    ) : (
                      <span className="relative block h-full w-full">
                        <GeneratingField seed={n - 1} compact />
                        {outline[n - 1] && <span className="t-label-s absolute inset-x-2 top-1.5 truncate text-left text-white/90">{outline[n - 1]}</span>}
                      </span>
                    )}
                  </span>
                  <span className="t-label-m mt-1 block text-left" style={{ color: n === active ? "var(--md-on-secondary-container)" : "var(--md-on-surface-variant)" }}>
                    {n}
                  </span>
                </button>
              ))}
            </nav>
          )}
        </main>
        {editorMode && hasDeck && <FullEditor version={deckVersion} images={images} slides={slides} layout={layout} active={active} setActive={setActive}
          selected={editorSelected} onSelect={(element) => element ? selectElement(element as LayoutElement) : setSelected(null)}
          onEdit={editorEdit} onAdd={addElement} onTransition={saveTransition}
          onAsk={(text, target) => sendFollowUp(text, target, active)} question={question?.question ?? null} onAnswer={answer}
          onClose={() => { setEditorMode(false); setSelected(null); }} onDownload={() => void download()} onPresent={() => void present()}
          busy={busy} saving={saving} notice={notice} />}
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
  onSaveElement: (edit: Record<string, unknown>) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  const { el, draft, setDraft, askText, setAskText, saving, onSave, onSaveElement, onAsk, onClose } = props;
  const [box, setBox] = useState({ x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot ?? 0 });
  const [fill, setFill] = useState("");
  const [animation, setAnimation] = useState("none");
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
      <div className="m3 enter w-[380px] rounded-[var(--md-shape-l)] p-4" style={{ background: "var(--md-surface-container-high)", boxShadow: "var(--md-elev-3)" }} role="dialog" aria-label={`Edit ${kind.toLowerCase()} ${el.name}`}>
        <div className="mb-3 flex items-center gap-2">
          <span className="chip selected !h-7 !px-3">{kind}</span>
          <span className="t-body-s on-variant min-w-0 flex-1 truncate font-mono">{el.name}</span>
          <button type="button" onClick={onClose} className="state icon-btn !h-8 !w-8" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
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
              aria-label="Text"
              className="t-body-l w-full resize-none rounded-t-[var(--md-shape-xs)] border-b-2 px-3 py-2 focus:outline-none"
              style={{ background: "var(--md-surface-container-highest)", borderColor: "var(--md-primary)", color: "var(--md-on-surface)" }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="t-body-s on-variant">Keeps the styling · free · Ctrl+Enter</p>
              <button type="button" onClick={onSave} disabled={!changed || saving} className="state btn btn-filled !h-9 !px-4">
                {saving && <span className="progress-circular" />}
                Save text
              </button>
            </div>
            <div className="divider my-4" />
          </>
        )}
        <div className="grid grid-cols-5 gap-2">
          {(["x", "y", "w", "h", "rot"] as const).map((key) => <label key={key} className="t-body-s on-variant">{key.toUpperCase()}
            <input type="number" step={key === "rot" ? 1 : 0.1} min={key === "rot" ? -360 : 0} max={key === "rot" ? 360 : 100}
              value={key === "rot" ? box.rot : Math.round(box[key] * 1000) / 10}
              onChange={(event) => setBox((current) => ({ ...current, [key]: Number(event.target.value) / (key === "rot" ? 1 : 100) }))}
              className="mt-1 w-full rounded px-1 py-1 text-center" style={{ background: "var(--md-surface-container-highest)", color: "var(--md-on-surface)" }} />
          </label>)}
        </div>
        <div className="mt-3 flex items-end gap-2">
          {(el.kind === "shape" || el.kind === "text") && <label className="t-body-s on-variant">Fill<br /><input aria-label="Fill color" type="color" value={fill || "#ffffff"} onChange={(event) => setFill(event.target.value)} /></label>}
          <label className="t-body-s on-variant flex-1">Animation
            <select value={animation} onChange={(event) => setAnimation(event.target.value)} className="mt-1 block w-full rounded px-2 py-1" style={{ background: "var(--md-surface-container-highest)", color: "var(--md-on-surface)" }}>
              {["none", "fade", "rise", "fly", "wipe", "zoom", "pulse", "spin", "grow", "fadeOut"].map((effect) => <option key={effect} value={effect}>{effect}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-between gap-2">
          <button type="button" disabled={saving} onClick={() => onSaveElement({ deleted: true })} className="state btn btn-text" style={{ color: "var(--md-error)" }}>Delete</button>
          <button type="button" disabled={saving} onClick={() => onSaveElement({ ...box, ...(fill ? { fill: fill.slice(1) } : {}), animation })} className="state btn btn-filled">Save element</button>
        </div>
        <div className="divider my-4" />
        <div className="flex items-center gap-2 rounded-full py-1 pl-4 pr-1" style={{ background: "var(--md-surface-container-highest)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--md-primary)" }} aria-hidden="true">
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
            aria-label="Ask the designer to change this"
            className="t-body-m min-w-0 flex-1 bg-transparent focus:outline-none"
            style={{ color: "var(--md-on-surface)" }}
          />
          <button type="button" onClick={onAsk} disabled={!askText.trim()} className="state btn btn-filled !h-9 !px-4">
            Ask AI
          </button>
        </div>
      </div>
    </div>
  );
}
