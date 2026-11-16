import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { WORK_ROOT, createWorkspace, removeWorkspace } from "@/server/octoslides/workspace";

export type OctoSlidesEvent =
  | { type: "run_started"; runId: string }
  | { type: "turn_started"; text: string; target?: EditTarget }
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

/** An element the user clicked in the preview. */
export type EditTarget = { slide: number; name: string };

/** idle = the designer finished its turn; the user can edit or ask for changes. */
export type RunStatus = "running" | "waiting_for_user" | "idle" | "error";

/** OpenAI-style chat messages, kept on the run so follow-up requests continue the same conversation. */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ImageCredit = { path: string; credit: string };

export type OctoSlidesRun = {
  runId: string;
  ownerId: string;
  /** users.id in the Octopilot DB (for the document tools); null if it could not be resolved. */
  dataUserId: string | null;
  email: string;
  /** paid plan: may switch the visible watermark off */
  isPro: boolean;
  /** the owner switched the badge off (honoured only when allowed) */
  watermarkOptOut: boolean;
  dir: string;
  prompt: string;
  status: RunStatus;
  createdAt: number;
  events: OctoSlidesEvent[];
  listeners: Set<(event: OctoSlidesEvent) => void>;
  pendingAnswer: ((answer: string) => void) | null;
  messages: ChatMessage[];
  deckVersion: number;
  lastValidatedVersion: number;
  renderedVersion: number;
  /** inputs fingerprint of the last successful build (skip identical rebuilds) */
  lastBuildHash: string | null;
  costUsd: number;
  steps: number;
  generatedImages: number;
  /** Openverse results by id, so fetch_image can record the attribution. */
  searchResults: Map<string, { url: string; credit: string }>;
  credits: ImageCredit[];
  /** true while the designer (or a manual edit) is working on the deck. */
  active: boolean;
  lastActivityAt: number;
};

const RUNS = new Map<string, OctoSlidesRun>();
const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_PER_USER = 2;

const RUN_ID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function gc() {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, run] of RUNS) {
    if (!run.active && run.lastActivityAt < cutoff) {
      RUNS.delete(id);
      void removeWorkspace(run.dir);
    }
  }
  // Runs live in memory, so a restart forgets them; sweep their old folders from disk too.
  void readdir(WORK_ROOT, { withFileTypes: true })
    .then(async (entries) => {
      for (const entry of entries) {
        if (!entry.isDirectory() || !RUN_ID_DIR.test(entry.name) || RUNS.has(entry.name)) continue;
        const dir = join(WORK_ROOT, entry.name);
        const info = await stat(dir).catch(() => null);
        if (info && info.mtimeMs < cutoff) await removeWorkspace(dir);
      }
    })
    .catch(() => undefined);
}

function activeCount(ownerId: string) {
  return [...RUNS.values()].filter((r) => r.ownerId === ownerId && r.active).length;
}

export async function createRun(
  ownerId: string,
  prompt: string,
  account: { dataUserId: string | null; email: string; isPro: boolean },
): Promise<OctoSlidesRun> {
  gc();
  if (activeCount(ownerId) >= MAX_ACTIVE_PER_USER) throw new Error("You already have two decks in progress. Wait for one to finish.");
  const runId = randomUUID();
  const run: OctoSlidesRun = {
    runId,
    ownerId,
    dataUserId: account.dataUserId,
    email: account.email,
    isPro: account.isPro,
    watermarkOptOut: false,
    dir: await createWorkspace(runId),
    prompt,
    status: "running",
    createdAt: Date.now(),
    events: [],
    listeners: new Set(),
    pendingAnswer: null,
    messages: [],
    deckVersion: 0,
    lastValidatedVersion: -1,
    renderedVersion: -1,
    lastBuildHash: null,
    costUsd: 0,
    steps: 0,
    generatedImages: 0,
    searchResults: new Map(),
    credits: [],
    active: true,
    lastActivityAt: Date.now(),
  };
  RUNS.set(runId, run);
  return run;
}

/** Returns the run only to its owner. */
export function getRun(runId: string, ownerId: string): OctoSlidesRun | null {
  const run = RUNS.get(runId);
  return run && run.ownerId === ownerId ? run : null;
}

/** Marks an idle run busy again (follow-up request or manual edit). False if it is already busy. */
export function claimRun(run: OctoSlidesRun): boolean {
  if (run.active) return false;
  run.active = true;
  run.status = "running";
  run.lastActivityAt = Date.now();
  return true;
}

export function emit(run: OctoSlidesRun, event: OctoSlidesEvent) {
  run.events.push(event);
  run.lastActivityAt = Date.now();
  if (run.events.length > 3000) run.events.splice(0, run.events.length - 3000);
  for (const listener of run.listeners) {
    try {
      listener(event);
    } catch {
      // a broken listener must not stop the run
    }
  }
}

/** Replays past events, then streams new ones. */
export function subscribe(run: OctoSlidesRun, listener: (event: OctoSlidesEvent) => void): () => void {
  for (const event of run.events) listener(event);
  run.listeners.add(listener);
  return () => run.listeners.delete(listener);
}

export function waitForAnswer(run: OctoSlidesRun, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      run.pendingAnswer = null;
      reject(new Error("No answer within the time limit."));
    }, timeoutMs);
    run.pendingAnswer = (answer) => {
      clearTimeout(timer);
      run.pendingAnswer = null;
      resolve(answer);
    };
  });
}

/** Ends the current turn. The run stays available for edits and follow-ups until it expires. */
export function finishRun(run: OctoSlidesRun, status: "idle" | "error") {
  run.status = status;
  run.active = false;
  run.pendingAnswer = null;
  run.lastActivityAt = Date.now();
}

export type RunSummary = {
  runId: string;
  prompt: string;
  status: RunStatus;
  createdAt: number;
  deckVersion: number;
  renderedVersion: number;
  slides: number[];
  costUsd: number;
};

function lastRenderedSlides(run: OctoSlidesRun): number[] {
  for (let i = run.events.length - 1; i >= 0; i -= 1) {
    const e = run.events[i];
    if (e.type === "slides_rendered") return e.slides;
  }
  return [];
}

export function summarizeRun(run: OctoSlidesRun): RunSummary {
  return {
    runId: run.runId,
    prompt: run.prompt.slice(0, 200),
    status: run.status,
    createdAt: run.createdAt,
    deckVersion: run.deckVersion,
    renderedVersion: run.renderedVersion,
    slides: lastRenderedSlides(run),
    costUsd: Math.round(run.costUsd * 10000) / 10000,
  };
}

export function listRuns(ownerId: string): RunSummary[] {
  return [...RUNS.values()]
    .filter((r) => r.ownerId === ownerId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map(summarizeRun);
}
