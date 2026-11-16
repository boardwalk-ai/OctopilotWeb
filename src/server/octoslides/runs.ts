import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@/server/db";
import { WORK_ROOT, createWorkspace, deckInfo, removeWorkspace } from "@/server/octoslides/workspace";

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
  | { type: "steer"; text: string; applied: boolean }
  | { type: "stopped"; message: string }
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
  /** cancels the model request and any sandbox job of the current step */
  abort: AbortController | null;
  /** aborted only by Stop: kills sandbox jobs (steering lets a running build finish) */
  stopCtl: AbortController | null;
  /** messages the user sent while the designer was working (steering) */
  inbox: string[];
  stopRequested: boolean;
  /** characters of a write_file the model is streaming right now (0 = not writing a file) */
  writingChars: number;
  lastActivityAt: number;
};

const RUNS = new Map<string, OctoSlidesRun>();
/** Idle runs leave memory after this; they are reloaded from the DB when opened again. */
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;
/** Work folders nobody saved (a crash before the first turn ended) are swept after this. */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
/** Saved decks are kept this long after their last change. */
const KEEP_DAYS = 30;
const MAX_ACTIVE_PER_USER = 2;

const RUN_ID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let lastSweep = 0;
function gc() {
  const now = Date.now();
  for (const [id, run] of RUNS) {
    if (!run.active && run.listeners.size === 0 && run.lastActivityAt < now - MEMORY_TTL_MS) RUNS.delete(id);
  }
  if (now - lastSweep < 30 * 60 * 1000) return;
  lastSweep = now;
  void (async () => {
    // expired decks: row and folder
    const expired = await query<{ run_id: string }>(
      "DELETE FROM octoslides_decks WHERE updated_at < now() - make_interval(days => $1) RETURNING run_id",
      [KEEP_DAYS],
    ).catch(() => []);
    for (const row of expired) {
      RUNS.delete(row.run_id);
      await removeWorkspace(join(WORK_ROOT, row.run_id));
    }
    // folders nobody saved
    const saved = new Set((await query<{ run_id: string }>("SELECT run_id FROM octoslides_decks").catch(() => [])).map((r) => r.run_id));
    const entries = await readdir(WORK_ROOT, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !RUN_ID_DIR.test(entry.name) || RUNS.has(entry.name) || saved.has(entry.name)) continue;
      const dir = join(WORK_ROOT, entry.name);
      const info = await stat(dir).catch(() => null);
      if (info && info.mtimeMs < now - ORPHAN_TTL_MS) await removeWorkspace(dir);
    }
  })().catch(() => undefined);
}

// ── persistence ──────────────────────────────────────────────────────────────
/** Images matter to the model only in the moment; they would bloat the saved conversation. */
function savableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" || typeof m.content === "string") return m;
    if (!m.content.some((p) => p.type === "image_url")) return m;
    const text = m.content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
    return { role: "user" as const, content: `${text} [images not kept]` };
  });
}

export async function saveRun(run: OctoSlidesRun): Promise<void> {
  await query(
    `INSERT INTO octoslides_decks (run_id, owner_id, data_user_id, email, is_pro, prompt, status, deck_version, rendered_version,
        validated_version, cost_usd, steps, watermark_opt_out, generated_images, credits, messages, events, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, to_timestamp($18 / 1000.0), now())
     ON CONFLICT (run_id) DO UPDATE SET status = $7, deck_version = $8, rendered_version = $9, validated_version = $10,
        cost_usd = $11, steps = $12, watermark_opt_out = $13, generated_images = $14, credits = $15, messages = $16,
        events = $17, updated_at = now()`,
    [
      run.runId,
      run.ownerId,
      run.dataUserId,
      run.email,
      run.isPro,
      run.prompt,
      run.status,
      run.deckVersion,
      run.renderedVersion,
      run.lastValidatedVersion,
      run.costUsd,
      run.steps,
      run.watermarkOptOut,
      run.generatedImages,
      JSON.stringify(run.credits),
      JSON.stringify(savableMessages(run.messages)),
      JSON.stringify(run.events.slice(-600)),
      run.createdAt,
    ],
  );
}

type DeckRow = {
  run_id: string;
  owner_id: string;
  data_user_id: string | null;
  email: string;
  is_pro: boolean;
  prompt: string;
  status: string;
  deck_version: number;
  rendered_version: number;
  validated_version: number;
  cost_usd: string;
  steps: number;
  watermark_opt_out: boolean;
  generated_images: number;
  credits: ImageCredit[];
  messages: ChatMessage[];
  events: OctoSlidesEvent[];
  created_at: Date;
};

async function loadRun(runId: string, ownerId: string): Promise<OctoSlidesRun | null> {
  if (!RUN_ID_DIR.test(runId)) return null;
  const rows = await query<DeckRow>("SELECT * FROM octoslides_decks WHERE run_id = $1 AND owner_id = $2", [runId, ownerId]).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const dir = join(WORK_ROOT, runId);
  if (!(await stat(dir).catch(() => null))) return null;
  const existing = RUNS.get(runId); // a concurrent request may have loaded it meanwhile
  if (existing) return existing.ownerId === ownerId ? existing : null;
  const run: OctoSlidesRun = {
    runId,
    ownerId: row.owner_id,
    dataUserId: row.data_user_id,
    email: row.email,
    isPro: row.is_pro,
    watermarkOptOut: row.watermark_opt_out,
    dir,
    prompt: row.prompt,
    status: row.status === "error" ? "error" : "idle",
    createdAt: new Date(row.created_at).getTime(),
    events: Array.isArray(row.events) ? row.events : [],
    listeners: new Set(),
    pendingAnswer: null,
    messages: Array.isArray(row.messages) ? row.messages : [],
    deckVersion: row.deck_version,
    lastValidatedVersion: row.validated_version,
    renderedVersion: row.rendered_version,
    lastBuildHash: null,
    costUsd: Number(row.cost_usd) || 0,
    steps: row.steps,
    generatedImages: row.generated_images,
    searchResults: new Map(),
    credits: Array.isArray(row.credits) ? row.credits : [],
    active: false,
    abort: null,
    stopCtl: null,
    inbox: [],
    stopRequested: false,
    writingChars: 0,
    lastActivityAt: Date.now(),
  };
  // the deck file decides whether anything was built
  if (!(await deckInfo(dir)).exists) run.deckVersion = 0;
  RUNS.set(runId, run);
  return run;
}

export async function deleteRun(runId: string, ownerId: string): Promise<boolean> {
  const run = await getRun(runId, ownerId);
  if (!run) return false;
  if (run.active) {
    run.stopRequested = true;
    run.abort?.abort(new Error("stop"));
    run.stopCtl?.abort(new Error("stop"));
  }
  RUNS.delete(runId);
  await query("DELETE FROM octoslides_decks WHERE run_id = $1 AND owner_id = $2", [runId, ownerId]).catch(() => undefined);
  await removeWorkspace(run.dir);
  return true;
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
    abort: null,
    stopCtl: null,
    inbox: [],
    stopRequested: false,
    writingChars: 0,
    lastActivityAt: Date.now(),
  };
  RUNS.set(runId, run);
  return run;
}

/** Returns the run only to its owner. */
export async function getRun(runId: string, ownerId: string): Promise<OctoSlidesRun | null> {
  gc();
  const run = RUNS.get(runId);
  if (run) return run.ownerId === ownerId ? run : null;
  // a saved deck that has left memory (idle for hours, or the server restarted)
  return loadRun(runId, ownerId);
}

/** Marks an idle run busy again (follow-up request or manual edit). False if it is already busy. */
export function claimRun(run: OctoSlidesRun): boolean {
  if (run.active) return false;
  run.active = true;
  run.status = "running";
  run.stopRequested = false;
  run.inbox = [];
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
  run.abort = null;
  run.stopCtl = null;
  run.writingChars = 0;
  run.lastActivityAt = Date.now();
  void saveRun(run).catch((error) => console.warn(`[octoslides] could not save ${run.runId}:`, (error as Error).message));
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

/** The owner's decks: live ones from memory, the rest from the DB (newest first). */
export async function listRuns(ownerId: string): Promise<RunSummary[]> {
  const live = [...RUNS.values()].filter((r) => r.ownerId === ownerId).map(summarizeRun);
  const seen = new Set(live.map((r) => r.runId));
  const rows = await query<{
    run_id: string;
    prompt: string;
    status: string;
    created_at: Date;
    deck_version: number;
    rendered_version: number;
    cost_usd: string;
    renders: Array<{ slides?: number[] }>;
  }>(
    `SELECT run_id, prompt, status, created_at, deck_version, rendered_version, cost_usd,
            (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(events) e WHERE e->>'type' = 'slides_rendered') AS renders
       FROM octoslides_decks WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 30`,
    [ownerId],
  ).catch(() => []);
  for (const r of rows) {
    if (seen.has(r.run_id)) continue;
    const renders = Array.isArray(r.renders) ? r.renders : [];
    live.push({
      runId: r.run_id,
      prompt: r.prompt.slice(0, 200),
      status: r.status === "error" ? "error" : "idle",
      createdAt: new Date(r.created_at).getTime(),
      deckVersion: r.deck_version,
      renderedVersion: r.rendered_version,
      slides: renders[renders.length - 1]?.slides ?? [],
      costUsd: Number(r.cost_usd) || 0,
    });
  }
  return live.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
}

/** Long file writes are cheaper to let finish and then patch than to throw away and regenerate. */
const LET_FINISH_CHARS = 1500;

/**
 * The user added something while the designer is working. Queued for the next step;
 * the model request in flight is cut short unless it is writing a long file.
 */
export function steerRun(run: OctoSlidesRun, text: string): { interrupted: boolean } {
  run.inbox.push(text);
  run.lastActivityAt = Date.now();
  if (run.pendingAnswer) {
    // the designer asked a question: this is the answer
    const answer = run.inbox.splice(0).join("\n\n");
    run.pendingAnswer(answer);
    emit(run, { type: "steer", text, applied: true });
    return { interrupted: false };
  }
  emit(run, { type: "steer", text, applied: false });
  const interrupt = run.writingChars < LET_FINISH_CHARS;
  if (interrupt) run.abort?.abort(new Error("steer"));
  return { interrupted: interrupt };
}

/** Stops the current turn: cancels the model request, kills a running sandbox job, drops a pending question. */
export function stopRun(run: OctoSlidesRun) {
  run.stopRequested = true;
  run.inbox = [];
  run.abort?.abort(new Error("stop"));
  run.stopCtl?.abort(new Error("stop"));
  if (run.pendingAnswer) run.pendingAnswer("");
}
