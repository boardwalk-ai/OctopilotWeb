// The agent loop.
//
// Given a Tool registry and an AgentRun, drive an OpenRouter chat completion
// in a call → dispatch → call cycle until the orchestrator stops requesting
// tools, hits a safety limit, or the run is cancelled. Every meaningful
// transition emits an AgentEvent on the run's event bus so the SSE route can
// mirror progress to the client in real time.
//
// Milestone 2 uses non-streaming completions. Streaming `thought` deltas are
// deferred to a later milestone — they require per-model SSE parsing quirks
// that aren't worth debugging before the tool-dispatch path is solid.

import { getOpenRouterConfig } from "@/server/backendConfig";
import type { AgentEvent } from "./events";
import type {
  AgentContext,
  AgentDraftSettings,
  AgentFormatAnswers,
  HumanizeChoice,
  ParagraphSplitChoice,
} from "./context";
import { AGENT_LIMITS } from "./limits";
import { emit, finishRun, waitForAnswer, type AgentRun } from "./runs";
import { toOpenRouterToolSpec, type AnyTool } from "./tools";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatRole = "system" | "user" | "assistant" | "tool";

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: AssistantToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type AssistantToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      role: ChatRole;
      content: string | null;
      tool_calls?: AssistantToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

export type RunAgentOptions = {
  run: AgentRun;
  tools: AnyTool[];
  systemPrompt: string;
  userBrief: string;
};

export async function runAgent(options: RunAgentOptions): Promise<void> {
  const { run, tools, systemPrompt, userBrief } = options;
  const toolByName = new Map(tools.map((t) => [t.name, t]));
  const toolSpecs = tools.map(toOpenRouterToolSpec);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userBrief },
  ];

  // Dedup guard — block identical (name, argsHash) within DEDUP_WINDOW_MS.
  const recentCalls = new Map<string, number>();

  const { apiKey, model } = await getOpenRouterConfig("primary");

  run.status = "running";

  // Running cost estimate — accumulated across all orchestrator round-trips.
  let cumulativeCostUsd = 0;
  // How many consecutive text-only (no tool call) responses we've seen
  // mid-workflow. We nudge the model once before giving up.
  let textOnlyStreak = 0;

  for (let step = 0; step < AGENT_LIMITS.MAX_STEPS; step++) {
    // Honour a cancellation that arrived while a tool was executing.
    if (run.finished) return;

    const assistant = await callOpenRouter({
      apiKey,
      model,
      messages,
      toolSpecs,
    });

    // Surface token usage and check the cost cap.
    if (assistant.usage) {
      const promptTokens = assistant.usage.prompt_tokens ?? 0;
      const completionTokens = assistant.usage.completion_tokens ?? 0;
      const totalTokens = assistant.usage.total_tokens ?? 0;

      cumulativeCostUsd +=
        (promptTokens * AGENT_LIMITS.COST_PER_1M_INPUT_TOKENS +
          completionTokens * AGENT_LIMITS.COST_PER_1M_OUTPUT_TOKENS) /
        1_000_000;

      emit(run, { type: "token_usage", promptTokens, completionTokens, totalTokens });

      if (cumulativeCostUsd > AGENT_LIMITS.MAX_COST_USD) {
        const costError = `Run stopped: estimated cost ($${cumulativeCostUsd.toFixed(3)}) exceeded cap ($${AGENT_LIMITS.MAX_COST_USD}).`;
        emit(run, { type: "fatal", error: costError });
        finishRun(run, "error");
        return;
      }
    }

    // Surface any free-form reasoning the model produced before/alongside its
    // tool calls. The UI displays these inline with each workflow step.
    if (assistant.content && assistant.content.trim().length > 0) {
      emit(run, { type: "thought", text: assistant.content });
    }

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // The model gave a text-only response (no tool calls).
      //
      // If finalize_export already ran and the export doc is ready, the agent
      // legitimately finished — emit done.
      //
      // Otherwise it stopped mid-workflow (e.g., gave up after a scraper
      // failure). Nudge it once with an explicit "continue" turn; if it still
      // produces no tools after the nudge, surface a fatal error instead of
      // silently completing a half-built essay.
      if (run.context.humanizedExportDoc) {
        emit(run, { type: "done", exportDoc: null });
        finishRun(run, "finished");
        return;
      }

      if (run.context.exportDoc && run.context.humanizeChoice === "Skip") {
        emit(run, { type: "done", exportDoc: run.context.exportDoc });
        finishRun(run, "finished");
        return;
      }

      textOnlyStreak += 1;
      if (textOnlyStreak <= 2) {
        // Push the model's reasoning as an assistant turn, then inject a
        // user nudge so it doesn't see an abrupt bare user message.
        messages.push({ role: "assistant", content: assistant.content ?? "" });
        messages.push({
          role: "user",
          content:
            "Continue the workflow — call the next required tool. Do not respond with text only.",
        });
        continue;
      }

      // Three consecutive text-only turns without completing → fatal.
      const stuckError =
        "Agent stopped mid-workflow after multiple attempts. Please try again.";
      emit(run, { type: "fatal", error: stuckError });
      finishRun(run, "error");
      return;
    }

    // Reset streak whenever the model actually calls a tool.
    textOnlyStreak = 0;

    messages.push({
      role: "assistant",
      content: assistant.content,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const toolResultMessage = await dispatchToolCall({
        run,
        tc,
        toolByName,
        recentCalls,
      });
      messages.push(toolResultMessage);
    }
  }

  // Fell out of the loop without a stop — kill the run so we don't quietly
  // burn tokens in the background.
  const limitError = `Agent exceeded MAX_STEPS=${AGENT_LIMITS.MAX_STEPS}`;
  emit(run, { type: "fatal", error: limitError });
  finishRun(run, "error");
}

// ────────────────── dispatch one tool call ──────────────────────────────────
async function dispatchToolCall(args: {
  run: AgentRun;
  tc: AssistantToolCall;
  toolByName: Map<string, AnyTool>;
  recentCalls: Map<string, number>;
}): Promise<ChatMessage> {
  const { run, tc, toolByName, recentCalls } = args;
  const stepId = `${tc.id}`; // The OpenRouter tool_call id doubles as our UI id.
  const tool = toolByName.get(tc.function.name);

  if (!tool) {
    const errorMsg = `Unknown tool: ${tc.function.name}`;
    emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: false });
    return toolResultFrame(tc.id, { error: errorMsg });
  }

  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
  } catch (err) {
    const errorMsg = `Invalid JSON arguments for ${tool.name}: ${err instanceof Error ? err.message : String(err)}`;
    emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: true });
    return toolResultFrame(tc.id, { error: errorMsg });
  }

  // Dedup: identical (name, args) within the window is almost always a loop
  // bug — surface it to the model as a soft error so it picks a different move.
  const dedupKey = `${tool.name}:${stableStringify(parsedArgs)}`;
  const lastSeen = recentCalls.get(dedupKey);
  const now = Date.now();
  if (lastSeen && now - lastSeen < AGENT_LIMITS.DEDUP_WINDOW_MS) {
    const errorMsg = `Duplicate tool call blocked: ${tool.name} with identical args within ${AGENT_LIMITS.DEDUP_WINDOW_MS}ms. Try a different approach.`;
    emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: false });
    return toolResultFrame(tc.id, { error: errorMsg });
  }
  recentCalls.set(dedupKey, now);

  const title = safeStepTitle(tool, parsedArgs);
  emit(run, {
    type: "step_start",
    id: stepId,
    title,
    tool: tool.name,
    args: parsedArgs,
  });

  // ── ask_user: special path ───────────────────────────────────────────────
  if (tool.isUserQuestion) {
    const field = String((parsedArgs as Record<string, unknown>).field ?? "");
    const question = String((parsedArgs as Record<string, unknown>).question ?? "");
    const suggestions = Array.isArray((parsedArgs as Record<string, unknown>).suggestions)
      ? ((parsedArgs as Record<string, unknown>).suggestions as unknown[]).map(String)
      : undefined;
    const inputType = (parsedArgs as Record<string, unknown>).inputType as
      | "text"
      | "number"
      | "select"
      | undefined;

    if (!field || !question) {
      const errorMsg = "ask_user requires `field` and `question`";
      emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: false });
      return toolResultFrame(tc.id, { error: errorMsg });
    }

    run.status = "waiting_for_user";
    emit(run, {
      type: "question",
      field,
      question,
      suggestions,
      inputType,
    });

    try {
      const answer = await waitForAnswer(run, field, AGENT_LIMITS.ASK_USER_TIMEOUT_MS);
      run.status = "running";
      applyAnswerToContext(run.context, field, answer);
      emit(run, { type: "step_done", id: stepId, summary: `${String(answer)}` });
      return toolResultFrame(tc.id, { answer });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: false });
      return toolResultFrame(tc.id, { error: errorMsg });
    }
  }

  // ── regular tool path ────────────────────────────────────────────────────
  const timeoutMs = tool.timeoutMs ?? AGENT_LIMITS.DEFAULT_TOOL_TIMEOUT_MS;
  try {
    let result = await withTimeout(
      tool.execute(parsedArgs, { run }),
      timeoutMs,
      `${tool.name} exceeded ${timeoutMs}ms`,
    );
    result = await maybeCollectFollowUpAnswer(run, stepId, tool.name, result);
    emit(run, { type: "step_done", id: stepId, summary: extractSummary(result) });
    return toolResultFrame(tc.id, result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: true });
    return toolResultFrame(tc.id, { error: errorMsg });
  }
}

// ────────────────── helpers ─────────────────────────────────────────────────

// Build a short human-readable summary from a tool's return value.
// Used to populate the step card's result line in the UI.
function extractSummary(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  if (typeof r.wordCount === "number") return `${r.wordCount} words drafted`;
  if (typeof r.scraped === "number") return `${r.scraped} scraped · ${r.failed ?? 0} failed`;
  if (typeof r.compacted === "number") return `${r.compacted} sources compacted`;
  if (typeof r.totalResults === "number") return `${r.totalResults} results found`;
  if (typeof r.totalInContext === "number" && typeof r.compacted !== "number")
    return `${r.totalInContext} in context`;
  if (typeof r.paragraphCount === "number") return `${r.paragraphCount} paragraphs`;
  if (typeof r.count === "number") return `${r.count} outlines`;
  if (typeof r.sufficient === "boolean")
    return r.sufficient
      ? "Sources sufficient"
      : String(r.recommendation ?? "Insufficient coverage");
  if (typeof r.overallScore === "number")
    return `Quality ${r.overallScore}/10 · ${r.issueCount ?? 0} issues`;
  if (typeof r.outputLength === "number") return `${r.outputLength} chars`;
  if (typeof r.provider === "string") return `Humanized with ${r.provider}`;
  if (typeof r.humanizeChoice === "string") return `Humanizer: ${r.humanizeChoice}`;
  if (typeof r.paragraphSplitChoice === "string") return `Split: ${r.paragraphSplitChoice}`;
  if (typeof r.revisionRounds === "number") return `Revision round ${r.revisionRounds}`;
  return undefined;
}

async function maybeCollectFollowUpAnswer(
  run: AgentRun,
  stepId: string,
  toolName: string,
  result: unknown,
): Promise<unknown> {
  if (!result || typeof result !== "object") return result;
  const payload = { ...(result as Record<string, unknown>) };

  if (toolName === "finalize_export" && !run.context.humanizeChoice) {
    const answer = await askFollowUpQuestion(run, stepId, {
      field: "humanizerChoice",
      question: "Would you like to humanize your essay to bypass AI detectors?",
      suggestions: ["StealthGPT", "UndetectableAI", "Skip"],
      inputType: "text",
    });
    payload.humanizeChoice = answer;
  }

  if (
    toolName === "humanize_essay" &&
    String(payload.provider || "") === "StealthGPT" &&
    !run.context.paragraphSplitChoice
  ) {
    const answer = await askFollowUpQuestion(run, stepId, {
      field: "paragraphSplitChoice",
      question: "StealthGPT merged the essay into one block. How should I handle paragraph breaks?",
      suggestions: ["AI split", "Manual", "Skip split"],
      inputType: "text",
    });
    payload.paragraphSplitChoice = answer;
  }

  return payload;
}

async function askFollowUpQuestion(
  run: AgentRun,
  stepId: string,
  args: {
    field: "humanizerChoice" | "paragraphSplitChoice";
    question: string;
    suggestions: string[];
    inputType: "text";
  },
): Promise<string> {
  run.status = "waiting_for_user";
  emit(run, {
    type: "question",
    field: args.field,
    question: args.question,
    suggestions: args.suggestions,
    inputType: args.inputType,
  });

  try {
    const answer = await waitForAnswer(run, args.field, AGENT_LIMITS.ASK_USER_TIMEOUT_MS);
    run.status = "running";
    applyAnswerToContext(run.context, args.field, answer);
    emit(run, { type: "step_progress", id: stepId, detail: `${args.field}: ${String(answer)}` });
    return String(answer);
  } catch (err) {
    run.status = "running";
    throw err;
  }
}

function toolResultFrame(toolCallId: string, payload: unknown): ChatMessage {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: JSON.stringify(payload ?? {}),
  };
}

function safeStepTitle(tool: AnyTool, args: Record<string, unknown>): string {
  try {
    return tool.stepTitle(args as never);
  } catch {
    return tool.name;
  }
}

// Stable key for dedup. Not crypto — just needs to round-trip equivalent
// args to the same string.
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ────────────────── OpenRouter HTTP ─────────────────────────────────────────
async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  toolSpecs: ReturnType<typeof toOpenRouterToolSpec>[];
}): Promise<{ content: string | null; tool_calls?: AssistantToolCall[]; usage?: OpenRouterResponse["usage"] }> {
  const { apiKey, model, messages, toolSpecs } = args;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://octopilotai.com",
      "X-Title": "OctoPilot AI",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: toolSpecs,
      tool_choice: "auto",
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${text || response.statusText}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message || "unknown"}`);
  }

  const msg = data.choices?.[0]?.message;
  if (!msg) {
    throw new Error("OpenRouter returned no assistant message");
  }

  return {
    content: msg.content ?? null,
    tool_calls: msg.tool_calls,
    usage: data.usage,
  };
}

// Silence unused-import lint on AgentEvent — it's the contract this module
// produces, even though we don't construct the union directly here.
export type { AgentEvent };

function applyAnswerToContext(ctx: AgentContext, field: string, value: unknown): void {
  const stringValue = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!stringValue) return;

  if (field === "wordCount") {
    const parsed = Number(stringValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      ctx.draftSettings.wordCount = Math.round(parsed);
      return;
    }
  }

  if (isDraftSettingsField(field)) {
    ctx.draftSettings[field] = stringValue;
    return;
  }

  if (field === "humanizerChoice") {
    if (stringValue === "StealthGPT" || stringValue === "UndetectableAI" || stringValue === "Skip") {
      ctx.humanizeChoice = stringValue as HumanizeChoice;
    }
    return;
  }

  if (field === "paragraphSplitChoice") {
    if (stringValue === "AI split" || stringValue === "Manual" || stringValue === "Skip split") {
      ctx.paragraphSplitChoice = stringValue as ParagraphSplitChoice;
    }
    return;
  }

  if (isFormatAnswersField(field)) {
    ctx.formatAnswers[field] = stringValue;
  }
}

function isDraftSettingsField(field: string): field is Exclude<keyof AgentDraftSettings, "wordCount"> {
  return field === "citationStyle" || field === "tone" || field === "keywords";
}

function isFormatAnswersField(field: string): field is keyof AgentFormatAnswers {
  return (
    field === "finalEssayTitle" ||
    field === "studentName" ||
    field === "instructorName" ||
    field === "institutionName" ||
    field === "courseInfo" ||
    field === "subjectCode" ||
    field === "essayDate"
  );
}
