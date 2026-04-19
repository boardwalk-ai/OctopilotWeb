// POST /api/ghostwriter/start
//
// Allocates an AgentRun and kicks off a background driver. Two drivers exist:
//
//   - `dummy`   (default until milestone 3 lands real tools): emits a scripted
//               sequence of events to exercise the SSE + answer round-trip
//               without touching OpenRouter.
//   - `agentic` (milestone 2+): runs the real OpenRouter tool-use loop with
//               the current tool registry. In milestone 2 the registry is
//               just `echo` + `ask_user`, which is enough to prove that
//               thoughts and tool calls stream end-to-end.
//
// Selection rules:
//   1. `?mode=agentic|dummy` query param wins (easy per-request toggle in dev).
//   2. Otherwise `process.env.GHOSTWRITER_MODE` ("agentic" or "legacy"/"dummy").
//   3. Otherwise `dummy`.
//
// Response: `{ runId: string, mode: "dummy" | "agentic" }`.

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { runAgent } from "@/server/ghostwriter/agent/loop";
import {
  buildSystemPrompt,
  buildUserBrief,
} from "@/server/ghostwriter/agent/systemPrompt";
import {
  AgentRun,
  createRun,
  emit,
  finishRun,
  waitForAnswer,
} from "@/server/ghostwriter/agent/runs";
import { askUserTool } from "@/server/ghostwriter/tools/ask";
import { compactSourcesTool } from "@/server/ghostwriter/tools/compact";
import { echoTool } from "@/server/ghostwriter/tools/echo";
import { finalizeExportTool } from "@/server/ghostwriter/tools/finalize";
import { humanizeEssayTool } from "@/server/ghostwriter/tools/humanize";
import { generateOutlinesTool } from "@/server/ghostwriter/tools/outlines";
import { planEssayTool } from "@/server/ghostwriter/tools/plan";
import { scrapeSourcesTool } from "@/server/ghostwriter/tools/scrape";
import { searchSourcesTool } from "@/server/ghostwriter/tools/search";
import { splitParagraphsTool } from "@/server/ghostwriter/tools/splitParagraphs";
import { writeEssayTool } from "@/server/ghostwriter/tools/write";

type StartMode = "dummy" | "agentic";

function resolveMode(request: NextRequest): StartMode {
  const queryMode = request.nextUrl.searchParams.get("mode");
  if (queryMode === "agentic") return "agentic";
  if (queryMode === "dummy") return "dummy";

  const envMode = (process.env.GHOSTWRITER_MODE || "").toLowerCase();
  if (envMode === "agentic") return "agentic";
  return "dummy";
}

// ────────────────── dummy driver (milestone 1) ──────────────────────────────
async function runDummyAgent(run: AgentRun): Promise<void> {
  try {
    run.status = "running";
    emit(run, { type: "thought", text: "Spinning up dummy agent loop..." });
    emit(run, {
      type: "step_start",
      id: "dummy-1",
      title: "Analyzing draft",
      tool: "plan_essay",
    });
    await sleep(400);
    emit(run, { type: "step_done", id: "dummy-1", summary: "Plan drafted." });

    run.status = "waiting_for_user";
    emit(run, {
      type: "question",
      field: "dummyChoice",
      question: "This is the scaffolding check. Pick anything to continue.",
      suggestions: ["Option A", "Option B"],
    });

    const answer = await waitForAnswer(run, "dummyChoice", 30 * 60 * 1000);
    run.status = "running";
    emit(run, { type: "thought", text: `User picked: ${String(answer)}. Wrapping up.` });

    emit(run, {
      type: "step_start",
      id: "dummy-2",
      title: "Finalizing (dummy)",
      tool: "finalize_export",
    });
    await sleep(300);
    emit(run, { type: "step_done", id: "dummy-2" });

    emit(run, { type: "done", exportDoc: null });
    finishRun(run, "finished");
  } catch (err) {
    emit(run, {
      type: "fatal",
      error: err instanceof Error ? err.message : String(err),
    });
    finishRun(run, "error");
  }
}

// ────────────────── agentic driver (milestone 2) ────────────────────────────
async function runAgenticDriver(run: AgentRun): Promise<void> {
  try {
    await runAgent({
      run,
      tools: [
        planEssayTool,
        generateOutlinesTool,
        searchSourcesTool,
        scrapeSourcesTool,
        compactSourcesTool,
        writeEssayTool,
        finalizeExportTool,
        humanizeEssayTool,
        splitParagraphsTool,
        askUserTool,
        echoTool,
      ],
      systemPrompt: buildSystemPrompt(),
      userBrief: buildUserBrief(run.draft),
    });
    // `runAgent` emits its own terminal event (`done` or `fatal`) and calls
    // `finishRun`, so we don't duplicate here.
  } catch (err) {
    emit(run, {
      type: "fatal",
      error: err instanceof Error ? err.message : String(err),
    });
    finishRun(run, "error");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const draft =
    body && typeof body === "object" && "draft" in body
      ? ((body as { draft: unknown }).draft as Record<string, unknown>)
      : {};

  const mode = resolveMode(request);
  const run = createRun(draft);

  // Fire and forget — the driver pushes events through the runs bus and the
  // SSE route relays them to the client. Unhandled rejections are trapped
  // inside each driver so an error never tears down the request handler.
  if (mode === "agentic") {
    void runAgenticDriver(run);
  } else {
    void runDummyAgent(run);
  }

  return NextResponse.json({ runId: run.id, mode });
}
