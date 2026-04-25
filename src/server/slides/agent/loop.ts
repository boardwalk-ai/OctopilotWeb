import { getOpenRouterConfig } from "@/server/backendConfig";
import type { SlidesSSEEvent } from "@/types/slides";
import { buildSlidesSystemPrompt } from "./systemPrompt";
import { SLIDES_AGENT_LIMITS } from "./limits";
import { emit, finishRun, waitForAnswer, type DeckRun } from "./runs";
import { toOpenRouterToolSpec, type AnyTool } from "./tools";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatRole = "system" | "user" | "assistant" | "tool";

type AssistantToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AssistantToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenRouterResponse = {
  choices?: Array<{
    message?: { role: ChatRole; content: string | null; tool_calls?: AssistantToolCall[] };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
};

export type RunSlidesAgentOptions = {
  run: DeckRun;
  tools: AnyTool[];
  instruction: string;
};

export async function runSlidesAgent(options: RunSlidesAgentOptions): Promise<void> {
  const { run, tools, instruction } = options;
  const toolByName = new Map(tools.map((t) => [t.name, t]));
  const toolSpecs = tools.map(toOpenRouterToolSpec);

  const { apiKey, model } = await getOpenRouterConfig("primary");

  run.state.status = "running";

  const systemPrompt = buildSlidesSystemPrompt({
    deckTheme: run.state.theme,
    designVoice: run.state.designVoice,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: instruction },
  ];

  const recentCalls = new Map<string, number>();
  let cumulativeCostUsd = 0;
  let textOnlyStreak = 0;

  for (let step = 0; step < SLIDES_AGENT_LIMITS.MAX_STEPS; step++) {
    if (run.finished) return;

    const assistant = await callOpenRouter({ apiKey, model, messages, toolSpecs });

    if (assistant.usage) {
      const promptTokens = assistant.usage.prompt_tokens ?? 0;
      const completionTokens = assistant.usage.completion_tokens ?? 0;
      cumulativeCostUsd +=
        (promptTokens * SLIDES_AGENT_LIMITS.COST_PER_1M_INPUT_TOKENS +
          completionTokens * SLIDES_AGENT_LIMITS.COST_PER_1M_OUTPUT_TOKENS) /
        1_000_000;

      if (cumulativeCostUsd > SLIDES_AGENT_LIMITS.MAX_COST_USD) {
        emit(run, { type: "error", message: `Run stopped: cost cap exceeded ($${cumulativeCostUsd.toFixed(3)}).` });
        finishRun(run, "error");
        return;
      }
    }

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Agent can legitimately finish only once compose ran.
      if (run.state.exportSnapshot) {
        emit(run, { type: "workflow_complete", deckId: run.state.deckId });
        finishRun(run, "complete");
        return;
      }

      textOnlyStreak += 1;
      if (textOnlyStreak <= 2) {
        messages.push({ role: "assistant", content: assistant.content ?? "" });
        messages.push({
          role: "user",
          content: "Continue — call the next required tool. Do not respond with text only.",
        });
        continue;
      }

      emit(run, { type: "error", message: "Agent stopped mid-workflow. Please try again." });
      finishRun(run, "error");
      return;
    }

    textOnlyStreak = 0;
    messages.push({ role: "assistant", content: assistant.content, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const toolResult = await dispatchToolCall({ run, tc, toolByName, recentCalls });
      messages.push(toolResult);
    }
  }

  emit(run, { type: "error", message: `Agent exceeded MAX_STEPS=${SLIDES_AGENT_LIMITS.MAX_STEPS}` });
  finishRun(run, "error");
}

async function dispatchToolCall(args: {
  run: DeckRun;
  tc: AssistantToolCall;
  toolByName: Map<string, AnyTool>;
  recentCalls: Map<string, number>;
}): Promise<ChatMessage> {
  const { run, tc, toolByName, recentCalls } = args;
  const tool = toolByName.get(tc.function.name);

  if (!tool) {
    emit(run, { type: "error", message: `Unknown tool: ${tc.function.name}` });
    return toolResultFrame(tc.id, { error: `Unknown tool: ${tc.function.name}` });
  }

  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
  } catch (err) {
    const errorMsg = `Invalid JSON arguments for ${tool.name}: ${err instanceof Error ? err.message : String(err)}`;
    emit(run, { type: "error", message: errorMsg });
    return toolResultFrame(tc.id, { error: errorMsg });
  }

  // Dedup guard: identical (tool, args) within window.
  const dedupKey = `${tool.name}:${stableStringify(parsedArgs)}`;
  const lastSeen = recentCalls.get(dedupKey);
  const now = Date.now();
  if (lastSeen && now - lastSeen < SLIDES_AGENT_LIMITS.DEDUP_WINDOW_MS) {
    const errorMsg = `Duplicate tool call blocked: ${tool.name}.`;
    emit(run, { type: "error", message: errorMsg });
    return toolResultFrame(tc.id, { error: errorMsg });
  }
  recentCalls.set(dedupKey, now);

  // Emit a workflow step marker (client renders these as the left-side timeline).
  emit(run, {
    type: "workflow_step",
    stepId: tc.id,
    status: "running",
    detail: tool.stepTitle(parsedArgs as never),
  });

  // ask_user: pause run + wait for POST /answer.
  if (tool.isUserQuestion) {
    const field = String((parsedArgs as Record<string, unknown>).field ?? "");
    const question = String((parsedArgs as Record<string, unknown>).question ?? "");
    const inputType = (parsedArgs as Record<string, unknown>).inputType as "text" | "choice" | "number" | undefined;
    const suggestions = Array.isArray((parsedArgs as Record<string, unknown>).suggestions)
      ? ((parsedArgs as Record<string, unknown>).suggestions as unknown[]).map(String)
      : undefined;

    if (!field || !question) {
      const errorMsg = "ask_user requires `field` and `question`";
      emit(run, { type: "error", message: errorMsg });
      return toolResultFrame(tc.id, { error: errorMsg });
    }

    run.state.status = "waiting_for_user";
    run.state.pendingQuestion = {
      field,
      question,
      inputType: inputType ?? "text",
      suggestions,
    };

    emit(run, { type: "ask_user", question: run.state.pendingQuestion });

    try {
      const answer = await waitForAnswer(run, field, SLIDES_AGENT_LIMITS.ASK_USER_TIMEOUT_MS);
      run.state.status = "running";
      run.state.pendingQuestion = null;

      // Store some well-known answers on state for Phase 1.
      if (field === "deckTheme" && typeof answer === "string") {
        // Tool implementation also usually sets this, but keep a safety net.
        // Theme parsing lives in the update_deck_theme tool.
      }

      emit(run, { type: "workflow_step", stepId: tc.id, status: "done", detail: String(answer) });
      return toolResultFrame(tc.id, { answer });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emit(run, { type: "error", message: errorMsg });
      return toolResultFrame(tc.id, { error: errorMsg });
    }
  }

  const timeoutMs = tool.timeoutMs ?? SLIDES_AGENT_LIMITS.DEFAULT_TOOL_TIMEOUT_MS;
  try {
    const result = await withTimeout(tool.execute(parsedArgs, { run }), timeoutMs, `${tool.name} exceeded ${timeoutMs}ms`);
    emit(run, { type: "workflow_step", stepId: tc.id, status: "done" });
    return toolResultFrame(tc.id, result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emit(run, { type: "workflow_step", stepId: tc.id, status: "error", detail: errorMsg });
    emit(run, { type: "error", message: errorMsg });
    return toolResultFrame(tc.id, { error: errorMsg });
  }
}

function toolResultFrame(toolCallId: string, payload: unknown): ChatMessage {
  return { role: "tool", tool_call_id: toolCallId, content: JSON.stringify(payload ?? {}) };
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
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

async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  toolSpecs: ReturnType<typeof toOpenRouterToolSpec>[];
}): Promise<{ content: string | null; tool_calls?: AssistantToolCall[]; usage?: OpenRouterResponse["usage"] }> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
      "HTTP-Referer": "https://octopilotai.com",
      "X-Title": "OctoPilot AI",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      tools: args.toolSpecs,
      tool_choice: "auto",
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${text || response.statusText}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message || "unknown"}`);

  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("OpenRouter returned no assistant message");
  return { content: msg.content ?? null, tool_calls: msg.tool_calls, usage: data.usage };
}

// Silence unused import lint in some TS configs.
export type { SlidesSSEEvent };

