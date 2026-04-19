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
import type { AgentContext, AgentDraftSettings, AgentFormatAnswers } from "./context";
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

  for (let step = 0; step < AGENT_LIMITS.MAX_STEPS; step++) {
    const assistant = await callOpenRouter({
      apiKey,
      model,
      messages,
      toolSpecs,
    });

    // Surface token usage so the client can display a running counter.
    if (assistant.usage) {
      emit(run, {
        type: "token_usage",
        promptTokens: assistant.usage.prompt_tokens ?? 0,
        completionTokens: assistant.usage.completion_tokens ?? 0,
        totalTokens: assistant.usage.total_tokens ?? 0,
      });
    }

    // Surface any free-form reasoning the model produced before/alongside its
    // tool calls. The UI appends these to its live "thinking" panel.
    if (assistant.content && assistant.content.trim().length > 0) {
      emit(run, { type: "thought", text: assistant.content });
    }

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Model chose to stop calling tools. That's our terminal signal.
      emit(run, { type: "done", exportDoc: run.context.exportDoc ?? null });
      finishRun(run, "finished");
      return;
    }

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
      emit(run, { type: "step_done", id: stepId });
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
    const result = await withTimeout(
      tool.execute(parsedArgs, { run }),
      timeoutMs,
      `${tool.name} exceeded ${timeoutMs}ms`,
    );
    emit(run, { type: "step_done", id: stepId });
    return toolResultFrame(tc.id, result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emit(run, { type: "step_error", id: stepId, error: errorMsg, retryable: true });
    return toolResultFrame(tc.id, { error: errorMsg });
  }
}

// ────────────────── helpers ─────────────────────────────────────────────────

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
