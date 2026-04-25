import { randomUUID } from "crypto";
import type { DeckState, SlidesSSEEvent } from "@/types/slides";

type PendingAnswer = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export type DeckRun = {
  runId: string;
  authToken: string;

  state: DeckState;

  buffered: SlidesSSEEvent[];
  subscriber: ((event: SlidesSSEEvent) => void) | null;
  pendingAnswers: Map<string, PendingAnswer>;
  finished: boolean;
};

const RUNS = new Map<string, DeckRun>();
const RUN_TTL_MS = 60 * 60 * 1000;

function gc(): void {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, run] of RUNS) {
    if (run.state.createdAt < cutoff && (run.finished || !run.subscriber)) {
      RUNS.delete(id);
    }
  }
}

export function createDeckRun(args: {
  userId: string;
  instruction: string;
  deckId?: string;
  authToken?: string;
}): DeckRun {
  gc();

  const runId = randomUUID();
  const deckId = args.deckId || `deck_${runId.slice(0, 8)}`;

  const state: DeckState = {
    deckId,
    runId,
    userId: args.userId,
    status: "idle",
    slides: [],
    sources: [],
    pendingQuestion: null,
    exportSnapshot: null,
    theme: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const run: DeckRun = {
    runId,
    authToken: args.authToken || "",
    state,
    buffered: [],
    subscriber: null,
    pendingAnswers: new Map(),
    finished: false,
  };

  RUNS.set(runId, run);
  return run;
}

export function getDeckRun(runId: string): DeckRun | null {
  return RUNS.get(runId) || null;
}

export function emit(run: DeckRun, event: SlidesSSEEvent): void {
  run.state.updatedAt = Date.now();
  if (run.subscriber) {
    run.subscriber(event);
    return;
  }
  run.buffered.push(event);
}

export function subscribe(run: DeckRun, handler: (event: SlidesSSEEvent) => void): () => void {
  for (const ev of run.buffered) handler(ev);
  run.buffered.length = 0;
  run.subscriber = handler;
  return () => {
    if (run.subscriber === handler) run.subscriber = null;
  };
}

export function waitForAnswer(run: DeckRun, field: string, timeoutMs: number): Promise<unknown> {
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

export function resolveAnswer(run: DeckRun, field: string, value: unknown): boolean {
  const pending = run.pendingAnswers.get(field);
  if (!pending) return false;
  run.pendingAnswers.delete(field);
  pending.resolve(value);
  return true;
}

export function finishRun(run: DeckRun, status: DeckState["status"]): void {
  run.state.status = status;
  run.finished = true;
  for (const [field, pending] of run.pendingAnswers) {
    pending.reject(new Error(`Run finished before "${field}" was answered`));
  }
  run.pendingAnswers.clear();
}

