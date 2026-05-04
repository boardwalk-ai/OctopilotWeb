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

import { fetchFreshOpenRouterKey, getOpenRouterConfigForRun } from "@/server/backendConfig";
import type { AgentEvent } from "./events";
import type {
  AgentContext,
  AgentDraftSettings,
  AgentFormatAnswers,
  HumanizeChoice,
  ParagraphSplitChoice,
} from "./context";
import { AGENT_LIMITS } from "./limits";
import { emit, finishRun, waitForAnswer, waitForUserMessage, type AgentRun } from "./runs";
import { toOpenRouterToolSpec, type AnyTool } from "./tools";
import { classifyUserDirective } from "./directives";

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

  // Assign a fresh LRU-rotated key to this run. Done once here so:
  // - Concurrent runs spread across the key pool.
  // - All tool calls within this run share the same key (consistent rate-limit bucket).
  // - Key never leaves the server (never in SSE events or API responses).
  if (!run.openRouterKey) {
    run.openRouterKey = await fetchFreshOpenRouterKey();
  }

  const { apiKey, model } = await getOpenRouterConfigForRun(run.openRouterKey, "ghostwriter_orchestrator");

  run.status = "running";

  // Running cost estimate — accumulated across all orchestrator round-trips.
  let cumulativeCostUsd = 0;

  // Revision mode: entered after finalize_export succeeds. The loop keeps
  // running so the user can request changes without starting a new run.
  // `revisionMode` is set when we see `exportReady` become true.
  let revisionMode = false;

  for (let step = 0; step < AGENT_LIMITS.MAX_STEPS; step++) {
    if (run.finished) return;

    // ── drain queued user messages into conversation ─────────────────────────
    // Messages that arrived while tools were executing are injected here so
    // the model sees them before its next response.
    while (run.messageQueue.length > 0) {
      const queued = run.messageQueue.shift()!;
      messages.push({ role: "user", content: queued });
    }

    // ── soft pause (user clicked Pause button) ───────────────────────────────
    if (run.pauseRequested) {
      run.pauseRequested = false;
      run.status = "waiting_for_user";

      emit(run, {
        type: "question",
        field: "userDirective",
        question: "Paused. What should I change or skip?",
        inputType: "text",
        allowCustom: true,
        options: [
          { label: "Skip critique + revision", value: "Skip critique and revision" },
          { label: "Skip humanizer", value: "Skip humanizer" },
          { label: "Skip extra research", value: "Skip search/scrape/compact and continue" },
        ],
      });

      try {
        const directive = await waitForAnswer(run, "userDirective", AGENT_LIMITS.ASK_USER_TIMEOUT_MS);
        run.status = "running";
        const directiveText = typeof directive === "string" ? directive.trim() : String(directive ?? "").trim();
        if (directiveText) {
          run.context.userDirectiveLog = run.context.userDirectiveLog || [];
          run.context.userDirectiveLog.push(directiveText);
          const decision = await classifyUserDirective({ directive: directiveText, context: run.context });
          run.context.userOverrides = { disabledTools: decision.disabledTools, notes: decision.notes || directiveText };
          emit(run, { type: "context_update", patch: { userOverrides: run.context.userOverrides, userDirectiveLog: run.context.userDirectiveLog } });
          messages.push({ role: "user", content: `USER OVERRIDE (apply now)\n${run.context.userOverrides.notes || directiveText}\n\nDisabled tools: ${run.context.userOverrides.disabledTools.join(", ") || "(none)"}` });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        emit(run, { type: "step_error", id: `${run.id}-pause`, error: errorMsg, retryable: false });
        run.status = "running";
      }
    }

    // ── call the model ───────────────────────────────────────────────────────
    const assistant = await callOpenRouter({
      apiKey,
      model,
      messages,
      toolSpecs,
      onDelta: (text) => {
        emit(run, { type: "thought", text });
        emit(run, { type: "assistant_delta", chunk: text });
      },
    });

    // Token usage + cost cap.
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
        emit(run, { type: "fatal", error: `Run stopped: cost cap exceeded ($${cumulativeCostUsd.toFixed(3)}).` });
        finishRun(run, "error");
        return;
      }
    }

    const assistantText = (assistant.content ?? "").trim();
    const toolCalls = assistant.tool_calls ?? [];

    // Always emit plain text as a chat bubble so the client commits streaming
    // deltas before any tool cards appear. This also clears the streaming cursor.
    if (assistantText) {
      emit(run, { type: "assistant_message", text: assistantText });
    }

    // ── no tool calls → conversational turn ─────────────────────────────────
    if (toolCalls.length === 0) {
      messages.push({ role: "assistant", content: assistant.content ?? "" });

      // Check if we've just entered or are already in revision mode.
      if (run.context.exportReady && !revisionMode) {
        revisionMode = true;
        // Emit done so the UI shows the export card, but keep the loop alive.
        emit(run, {
          type: "done",
          exportDoc: run.context.humanizedExportDoc ? null : (run.context.exportDoc ?? null),
        });
      }

      // Wait for the user to reply — either a revision request or "done".
      run.status = revisionMode ? "revision_mode" : "waiting_for_user";

      try {
        const userMsg = await waitForUserMessage(run, AGENT_LIMITS.ASK_USER_TIMEOUT_MS);

        // Sentinel emitted by finishRun (cancelled/error) — stop cleanly.
        if (userMsg === "__run_ended__") return;

        // Explicit exit in revision mode.
        if (revisionMode && isExitMessage(userMsg)) {
          finishRun(run, "finished");
          return;
        }

        run.status = "running";
        messages.push({ role: "user", content: userMsg });
        continue;
      } catch {
        // Timeout — if export is ready just finish, otherwise fatal.
        if (run.context.exportReady) {
          finishRun(run, "finished");
          return;
        }
        emit(run, { type: "fatal", error: "Timed out waiting for your response." });
        finishRun(run, "error");
        return;
      }
    }

    // ── has tool calls → execute them ────────────────────────────────────────
    run.status = "running";

    messages.push({
      role: "assistant",
      content: assistant.content,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const toolResultMessage = await dispatchToolCall({ run, tc, toolByName, recentCalls });
      messages.push(toolResultMessage);
    }

    // After tools run, check if export just became ready to enter revision mode.
    if (run.context.exportReady && !revisionMode) {
      revisionMode = true;
    }
  }

  const limitError = `Agent exceeded MAX_STEPS=${AGENT_LIMITS.MAX_STEPS}`;
  emit(run, { type: "fatal", error: limitError });
  finishRun(run, "error");
}

// Returns true when the user wants to end the session (revision mode only).
function isExitMessage(text: string): boolean {
  const t = text.toLowerCase().trim();
  return t === "done" || t === "exit" || t === "finish" || t === "stop" ||
    t === "that's all" || t === "thats all" || t === "no more changes" ||
    t === "all done" || t === "finished";
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

  // Respect user overrides: block disabled tools deterministically.
  const disabled = run.context.userOverrides?.disabledTools || [];
  if (disabled.includes(tool.name)) {
    const errorMsg = `Tool disabled by user directive: ${tool.name}`;
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
    const rawOptions = (parsedArgs as Record<string, unknown>).options;
    const options =
      Array.isArray(rawOptions)
        ? rawOptions
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const e = entry as Record<string, unknown>;
              const label = typeof e.label === "string" ? e.label.trim() : "";
              const value = typeof e.value === "string" ? e.value.trim() : "";
              if (!label || !value) return null;
              return { label, value };
            })
            .filter((entry): entry is { label: string; value: string } => entry !== null)
        : undefined;
    const suggestions = Array.isArray((parsedArgs as Record<string, unknown>).suggestions)
      ? ((parsedArgs as Record<string, unknown>).suggestions as unknown[]).map(String)
      : undefined;
    let inputType = (parsedArgs as Record<string, unknown>).inputType as
      | "text"
      | "number"
      | "select"
      | "multiselect"
      | "sourceReview"
      | undefined;
    // Fallback: infer inputType from field name in case the model omits it.
    if (field === "sourceReview") inputType = "sourceReview";
    if (field === "essayFocus") inputType = "multiselect";
    const allowCustomRaw = (parsedArgs as Record<string, unknown>).allowCustom;
    const allowCustom =
      typeof allowCustomRaw === "boolean"
        ? allowCustomRaw
        : inputType === "select" || inputType === "sourceReview"
          ? false
          : true;

    // Auto-inject scraped sources when rendering the source review panel.
    const sources =
      inputType === "sourceReview"
        ? run.context.scrapedSources.map((s) => ({
            url: s.url,
            title: s.title,
            publisher: s.publisher,
            contentPreview: s.fullContent?.slice(0, 6000) ?? "",
          }))
        : undefined;

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
      options: options && options.length > 0 ? options : undefined,
      suggestions,
      inputType,
      allowCustom,
      sources,
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
    const result = await withTimeout(
      tool.execute(parsedArgs, { run }),
      timeoutMs,
      `${tool.name} exceeded ${timeoutMs}ms`,
    );
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

// ────────────────── OpenRouter HTTP (streaming) ──────────────────────────────
//
// Uses `stream: true` so orchestrator reasoning tokens are forwarded to the
// client in real-time via `onDelta`. Tool call arguments are accumulated from
// delta fragments and returned assembled, matching the non-streaming contract.
async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  toolSpecs: ReturnType<typeof toOpenRouterToolSpec>[];
  onDelta?: (text: string) => void;
}): Promise<{ content: string | null; tool_calls?: AssistantToolCall[]; usage?: OpenRouterResponse["usage"] }> {
  const { apiKey, model, messages, toolSpecs, onDelta } = args;

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
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${text || response.statusText}`);
  }
  if (!response.body) {
    throw new Error("OpenRouter returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let fullContent = "";
  let usage: OpenRouterResponse["usage"] | undefined;

  // Tool call fragments: index → { id, name, accumulated args string }
  const tcMap = new Map<number, { id: string; name: string; args: string }>();

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });

    let lineEnd: number;
    while ((lineEnd = sseBuffer.indexOf("\n")) !== -1) {
      const line = sseBuffer.slice(0, lineEnd).trimEnd();
      sseBuffer = sseBuffer.slice(lineEnd + 1);

      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break outer;
      if (!payload) continue;

      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: OpenRouterResponse["usage"];
        error?: { message?: string };
      };
      try {
        chunk = JSON.parse(payload) as typeof chunk;
      } catch {
        continue;
      }

      if (chunk.error) {
        throw new Error(`OpenRouter stream error: ${chunk.error.message || "unknown"}`);
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // ── text delta ────────────────────────────────────────────────────────
      if (typeof delta.content === "string" && delta.content) {
        fullContent += delta.content;
        onDelta?.(delta.content);
      }

      // ── tool call deltas (arguments stream as fragments) ──────────────────
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!tcMap.has(idx)) {
            tcMap.set(idx, { id: "", name: "", args: "" });
          }
          const entry = tcMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }
  }

  // Assemble tool calls in index order.
  const toolCalls: AssistantToolCall[] = [];
  for (let i = 0; tcMap.has(i); i++) {
    const tc = tcMap.get(i)!;
    if (tc.id && tc.name) {
      toolCalls.push({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
      });
    }
  }

  return {
    content: fullContent || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
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

  if (field === "sourceReview") {
    try {
      const parsed = JSON.parse(stringValue);
      if (Array.isArray(parsed)) {
        ctx.sourceReviewNotes = parsed as Array<{ url: string; focusNote?: string; rejected?: boolean }>;
      }
    } catch {
      // Malformed JSON — ignore, compact_sources will proceed without notes.
    }
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
