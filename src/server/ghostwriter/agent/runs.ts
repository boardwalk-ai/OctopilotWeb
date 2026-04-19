// AgentRun — in-memory store + event bus for a single Ghostwriter agent run.
//
// Milestone 1 scope: no persistence. If the server restarts mid-run, the run
// is lost and the SSE connection drops. That's acceptable for the scaffolding
// iteration; iteration 2 will snapshot `messages[]` and `context` to Postgres
// so cold loads can resume. See docs/AGENTIC_GHOSTWRITER.md §6.
//
// Responsibilities:
//   - Allocate run IDs and store run state keyed by id.
//   - Fan events out to at most one active SSE subscriber per run.
//   - Provide `waitForAnswer(field)` / `resolveAnswer(field, value)` so the
//     agent loop can pause on `ask_user` and resume when the client POSTs to
//     `/api/ghostwriter/answer`.

import { randomUUID } from "crypto";
import type { AgentEvent } from "./events";

// Draft shape — intentionally untyped at this layer. Milestone 3 will plug in
// the real `GhostwriterDraftInput` once tools are ported.
export type AgentDraftInput = Record<string, unknown>;

type PendingAnswer = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export type AgentRun = {
  id: string;
  draft: AgentDraftInput;
  createdAt: number;
  status: "pending" | "running" | "waiting_for_user" | "finished" | "error" | "cancelled";

  // Event queue — events produced before a subscriber connects are buffered
  // here so we never lose the prologue. The SSE route drains this on connect,
  // then switches to live push via `emit()`.
  buffered: AgentEvent[];
  subscriber: ((event: AgentEvent) => void) | null;

  // Outstanding `ask_user` calls keyed by field name.
  pendingAnswers: Map<string, PendingAnswer>;

  // Set when the loop exits (success, fatal, or cancel). The SSE route uses
  // this to close the stream after draining any trailing events.
  finished: boolean;
};

const RUNS = new Map<string, AgentRun>();

// Runs older than this with no activity are garbage-collected to stop an
// abandoned tab from pinning memory forever. 1 hour is generous for an essay.
const RUN_TTL_MS = 60 * 60 * 1000;

function gc() {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, run] of RUNS) {
    if (run.createdAt < cutoff && (run.finished || !run.subscriber)) {
      RUNS.delete(id);
    }
  }
}

export function createRun(draft: AgentDraftInput): AgentRun {
  gc();
  const run: AgentRun = {
    id: randomUUID(),
    draft,
    createdAt: Date.now(),
    status: "pending",
    buffered: [],
    subscriber: null,
    pendingAnswers: new Map(),
    finished: false,
  };
  RUNS.set(run.id, run);
  return run;
}

export function getRun(id: string): AgentRun | null {
  return RUNS.get(id) || null;
}

// Push an event to the run's subscriber, or buffer it if no one's listening
// yet. The SSE route flushes `buffered` on connect, so early events survive.
export function emit(run: AgentRun, event: AgentEvent): void {
  if (run.subscriber) {
    run.subscriber(event);
    return;
  }
  run.buffered.push(event);
}

// Subscribe to a run's events. Returns an unsubscribe function. If a previous
// subscriber was attached (e.g. the client reconnected), it's replaced — the
// buffer ensures no events are dropped at the handoff.
export function subscribe(run: AgentRun, handler: (event: AgentEvent) => void): () => void {
  // Drain buffered events first, in order.
  for (const ev of run.buffered) handler(ev);
  run.buffered.length = 0;

  run.subscriber = handler;
  return () => {
    if (run.subscriber === handler) run.subscriber = null;
  };
}

// Pause the agent loop on an `ask_user` tool call. Resolves when the client
// POSTs to `/api/ghostwriter/answer` with a matching field.
export function waitForAnswer(run: AgentRun, field: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      run.pendingAnswers.delete(field);
      reject(new Error(`Timed out waiting for answer to "${field}"`));
    }, timeoutMs);

    run.pendingAnswers.set(field, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

// Resolve an outstanding `ask_user`. Returns false if no one was waiting on
// this field — the caller should surface that as a 409-ish "no pending
// question" error to the client.
export function resolveAnswer(run: AgentRun, field: string, value: unknown): boolean {
  const pending = run.pendingAnswers.get(field);
  if (!pending) return false;
  run.pendingAnswers.delete(field);
  pending.resolve(value);
  return true;
}

export function finishRun(run: AgentRun, status: "finished" | "error" | "cancelled"): void {
  run.status = status;
  run.finished = true;
  // Reject any pending answers so the loop doesn't hang after cancel.
  for (const [field, pending] of run.pendingAnswers) {
    pending.reject(new Error(`Run ${status} before "${field}" was answered`));
  }
  run.pendingAnswers.clear();
}
