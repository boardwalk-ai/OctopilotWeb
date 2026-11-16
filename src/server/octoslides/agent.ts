import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { memoryBlock } from "@/server/octoslides/memory";
import { buildOctoSlidesSystemPrompt } from "@/server/octoslides/prompt";
import {
  emit,
  finishRun,
  type ChatMessage,
  type ContentPart,
  type EditTarget,
  type OctoSlidesRun,
  type ToolCall,
} from "@/server/octoslides/runs";
import { OCTOSLIDES_TOOLS, toOpenRouterTool, type OctoTool, type ToolOutput } from "@/server/octoslides/tools";

/**
 * The OctoSlides loop: the model plans, writes build.js, runs it in the sandbox,
 * validates, reads the text back and looks at rendered slides, then fixes and
 * repeats until it calls finish. The conversation stays on the run, so the user
 * can ask for changes afterwards (optionally pointing at one element).
 * Provider: OpenRouter (OpenAI-style tool calls), with Anthropic prompt caching.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FIRST_TURN = {
  maxSteps: Number(process.env.OCTOSLIDES_MAX_STEPS || 60),
  maxCostUsd: Number(process.env.OCTOSLIDES_MAX_COST_USD || 3),
};
const FOLLOW_UP = {
  maxSteps: Number(process.env.OCTOSLIDES_FOLLOWUP_MAX_STEPS || 30),
  maxCostUsd: Number(process.env.OCTOSLIDES_FOLLOWUP_MAX_COST_USD || 1.5),
};
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_TEXT_ONLY_TURNS = 2;
const MAX_OUTPUT_TOKENS = 16_000;

type Completion = {
  choices?: Array<{ message?: { content: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
};

const TOOL_BY_NAME = new Map<string, OctoTool>(OCTOSLIDES_TOOLS.map((t) => [t.name, t]));
const TOOL_SPECS = OCTOSLIDES_TOOLS.map(toOpenRouterTool);

function shortArgs(name: string, args: Record<string, unknown>): string {
  if (name === "write_file") return `${args.path} (${String(args.content ?? "").length} chars)`;
  if (name === "edit_file") return String(args.path ?? "");
  if (name === "render_slides" || name === "critique_slides") return Array.isArray(args.slides) ? `slides ${args.slides.join(", ")}` : "all slides";
  if (name === "fetch_image" || name === "generate_image") return String(args.name ?? "");
  if (name === "search_images") return String(args.query ?? "");
  if (name === "run_script") return String(args.path ?? "build.js");
  if (name === "read_file") return String(args.path ?? "");
  if (name === "read_document") return String(args.part ?? "");
  if (name === "search_document") return String(args.query ?? "").slice(0, 60);
  if (name === "remember" || name === "forget") return `${args.predicate}${args.object ? `: ${args.object}` : ""}`;
  return "";
}

/** Keeps only the newest set of images in the context; older ones become a text stub. */
function pruneOldImages(messages: ChatMessage[]) {
  let seenLatest = false;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "user" || typeof m.content === "string") continue;
    if (!m.content.some((p) => p.type === "image_url")) continue;
    if (!seenLatest) {
      seenLatest = true;
      continue;
    }
    const text = m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n");
    m.content = `${text}\n[images removed to save context]`;
  }
}

/**
 * Before a follow-up turn: shrink what earlier turns left behind. Old file bodies
 * (build.js is rewritten whole every time) and long tool outputs go; the model
 * re-reads files it needs.
 */
function compactHistory(messages: ChatMessage[]) {
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const call of m.tool_calls) {
        if (call.function.name !== "write_file" || call.function.arguments.length < 600) continue;
        try {
          const args = JSON.parse(call.function.arguments) as { path?: string };
          call.function.arguments = JSON.stringify({ path: args.path, content: `[omitted from history; read_file ${args.path} for the current version]` });
        } catch {
          // leave it
        }
      }
    } else if (m.role === "tool" && m.content.length > 1200) {
      m.content = `${m.content.slice(0, 600)}\n…[trimmed from history]`;
    }
  }
}

/**
 * Request copy with cache breakpoints on the system prompt and the newest message,
 * so each step re-reads the long, unchanged prefix from Anthropic's prompt cache.
 */
function withCacheBreakpoints(messages: ChatMessage[]): unknown[] {
  const out: unknown[] = messages.map((m) => m);
  const mark = (i: number) => {
    const m = messages[i] as { role: string; content: unknown };
    if (m.content === null || m.content === undefined) return;
    const parts: Array<Record<string, unknown>> =
      typeof m.content === "string" ? [{ type: "text", text: m.content || " " }] : (m.content as ContentPart[]).map((p) => ({ ...p }));
    const last = parts[parts.length - 1];
    parts[parts.length - 1] = { ...last, cache_control: { type: "ephemeral" } };
    out[i] = { ...m, content: parts };
  };
  mark(0);
  if (messages.length > 1) mark(messages.length - 1);
  return out;
}

/**
 * One model call, streamed. Streaming lets a steer or Stop cut the call short, and
 * tells us when the model is in the middle of writing a long file (worth letting finish).
 */
async function complete(apiKey: string, model: string, messages: ChatMessage[], run: OctoSlidesRun, signal: AbortSignal): Promise<Completion> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://octopilotai.app",
      "X-Title": "OctoSlides",
    },
    body: JSON.stringify({
      model,
      messages: model.startsWith("anthropic/") ? withCacheBreakpoints(messages) : messages,
      tools: TOOL_SPECS,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      usage: { include: true },
      stream: true,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 300)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const calls: Array<{ id: string; name: string; args: string }> = [];
  let usage: Completion["usage"];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // ": OPENROUTER PROCESSING" keep-alives
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let chunk: {
        error?: { message?: string };
        usage?: Completion["usage"];
        choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`OpenRouter: ${chunk.error.message ?? "unknown error"}`);
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) content += delta.content;
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0;
        calls[i] ??= { id: "", name: "", args: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
        run.writingChars = calls[i].name === "write_file" ? calls[i].args.length : 0;
      }
    }
  }
  const toolCalls: ToolCall[] = calls
    .filter(Boolean)
    .map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, type: "function" as const, function: { name: c.name, arguments: c.args } }));
  return { choices: [{ message: { content: content || null, tool_calls: toolCalls.length ? toolCalls : undefined } }], usage };
}

class Stopped extends Error {}

/** Messages the user sent while the designer was working, folded in before the next model call. */
function applyInbox(run: OctoSlidesRun, messages: ChatMessage[]) {
  if (!run.inbox.length) return;
  const notes = run.inbox.splice(0);
  messages.push({
    role: "user",
    content: `While you were working, the user added:\n${notes.map((n) => `- ${n}`).join("\n")}\nFold this into the work in progress. Keep what is already built unless this requires changing it; do not start over. Then continue.`,
  });
  for (const text of notes) emit(run, { type: "steer", text, applied: true });
}

async function runTool(run: OctoSlidesRun, call: ToolCall): Promise<{ output: ToolOutput; finished: boolean }> {
  const tool = TOOL_BY_NAME.get(call.function.name);
  if (!tool) {
    return { output: { ok: false, content: JSON.stringify({ error: `Unknown tool ${call.function.name}` }), summary: "Unknown tool" }, finished: false };
  }
  let args: Record<string, unknown>;
  try {
    args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
  } catch (error) {
    return { output: { ok: false, content: JSON.stringify({ error: `Arguments were not valid JSON: ${(error as Error).message}` }), summary: "Bad arguments" }, finished: false };
  }

  emit(run, { type: "tool_started", id: call.id, name: tool.name, summary: shortArgs(tool.name, args) });
  let output: ToolOutput;
  try {
    const timeout = tool.timeoutMs ?? 60_000;
    output = await Promise.race([
      tool.execute(args, { run }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${tool.name} took longer than ${timeout / 1000}s`)), timeout)),
    ]);
  } catch (error) {
    output = { ok: false, content: JSON.stringify({ error: (error as Error).message }), summary: (error as Error).message.slice(0, 120) };
  }
  emit(run, { type: "tool_finished", id: call.id, name: tool.name, ok: output.ok, summary: output.summary });
  return { output, finished: tool.name === "finish" && output.ok };
}

async function runTurn(run: OctoSlidesRun, limits: { maxSteps: number; maxCostUsd: number }): Promise<void> {
  const { apiKey, model } = await getOpenRouterConfig("octoslides");
  emit(run, { type: "status", text: `Designing with ${model}` });
  const messages = run.messages;
  const turnStartCost = run.costUsd;
  let textOnlyTurns = 0;

  for (let step = 1; step <= limits.maxSteps; step += 1) {
    if (run.stopRequested) throw new Stopped();
    applyInbox(run, messages);
    pruneOldImages(messages);

    const ctl = new AbortController();
    run.abort = ctl;
    let data: Completion;
    try {
      data = await complete(apiKey, model, messages, run, ctl.signal);
    } catch (error) {
      if (run.stopRequested) throw new Stopped();
      // a steer cut the call short: fold the new message in and ask again
      if (ctl.signal.aborted) continue;
      throw error;
    } finally {
      run.abort = null;
      run.writingChars = 0;
    }
    run.costUsd += data.usage?.cost ?? 0;
    run.steps += 1;
    emit(run, { type: "usage", costUsd: Math.round(run.costUsd * 10000) / 10000, steps: run.steps });
    if (run.costUsd - turnStartCost > limits.maxCostUsd) {
      throw new Error(`Stopped: this request reached its $${limits.maxCostUsd} cost limit.`);
    }

    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("The model returned no message.");
    const calls = message.tool_calls ?? [];
    if (message.content?.trim()) emit(run, { type: "thinking", text: message.content.trim().slice(0, 2000) });

    if (calls.length === 0) {
      textOnlyTurns += 1;
      messages.push({ role: "assistant", content: message.content ?? "" });
      if (textOnlyTurns > MAX_TEXT_ONLY_TURNS) throw new Error("The designer stopped without finishing.");
      messages.push({ role: "user", content: "Continue with the next tool call. When the deck validates and you have reviewed the slides you changed, call finish." });
      continue;
    }
    textOnlyTurns = 0;
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });

    const imageParts: ContentPart[] = [];
    let finishedSummary: string | null = null;
    for (const [index, call] of calls.entries()) {
      if (run.stopRequested || run.inbox.length) {
        // every tool call needs a result; the rest of this batch is not run
        const why = run.stopRequested ? "Cancelled: the user stopped the designer." : "Skipped: the user added a request before this ran. Re-plan with it.";
        for (const rest of calls.slice(index)) messages.push({ role: "tool", tool_call_id: rest.id, content: JSON.stringify({ skipped: true, reason: why }) });
        break;
      }
      const { output, finished } = await runTool(run, call);
      messages.push({ role: "tool", tool_call_id: call.id, content: output.content });
      for (const image of output.images ?? []) {
        imageParts.push({ type: "text", text: `${image.label}:` });
        imageParts.push({ type: "image_url", image_url: { url: image.dataUrl } });
      }
      if (finished) {
        try {
          finishedSummary = String((JSON.parse(output.content) as { summary?: string }).summary ?? "");
        } catch {
          finishedSummary = "";
        }
      }
    }

    if (run.stopRequested) throw new Stopped();
    // a message that arrived during the last step is handled before handing over
    if (finishedSummary !== null && run.inbox.length) finishedSummary = null;
    if (finishedSummary !== null) {
      emit(run, { type: "complete", summary: finishedSummary });
      finishRun(run, "idle");
      return;
    }

    if (imageParts.length) {
      // Tool messages carry text only; images follow as a user turn.
      messages.push({ role: "user", content: [{ type: "text", text: "Images from the tool results above." }, ...imageParts] });
    }
  }
  throw new Error(`Stopped after ${limits.maxSteps} steps without finishing.`);
}

function launch(run: OctoSlidesRun, limits: { maxSteps: number; maxCostUsd: number }) {
  run.stopCtl = new AbortController();
  void runTurn(run, limits).catch((error: unknown) => {
    if (error instanceof Stopped || run.stopRequested) {
      emit(run, { type: "stopped", message: run.deckVersion > 0 ? "Stopped. The deck is as it was after the last build." : "Stopped before the first build." });
      finishRun(run, "idle");
      return;
    }
    emit(run, { type: "error", message: error instanceof Error ? error.message : String(error) });
    finishRun(run, "error");
  });
}

/** First turn. `attachedDocument` is a document the user picked (already ownership-checked). */
export async function startOctoSlidesRun(run: OctoSlidesRun, attachedDocument?: { id: string; title: string } | null) {
  const memory = await memoryBlock(run.dataUserId).catch(() => "");
  const attach = attachedDocument
    ? `\n\n[The user attached their Octopilot document "${attachedDocument.title}" (id ${attachedDocument.id}). Build the deck from it: read_document its text, outline and sources first; take facts only from it.]`
    : "";
  run.messages = [
    { role: "system", content: memory ? `${buildOctoSlidesSystemPrompt()}\n\n${memory}` : buildOctoSlidesSystemPrompt() },
    { role: "user", content: run.prompt + attach },
  ];
  emit(run, { type: "run_started", runId: run.runId });
  emit(run, { type: "turn_started", text: run.prompt });
  launch(run, FIRST_TURN);
}

type LayoutElement = { id: string; name: string; kind: string; x: number; y: number; w: number; h: number; text?: string };

async function describeTarget(run: OctoSlidesRun, target: EditTarget): Promise<string> {
  const layout = await readFile(join(run.dir, "out", "layout.json"), "utf8")
    .then((t) => JSON.parse(t) as { slides: Array<{ slide: number; elements: LayoutElement[] }> })
    .catch(() => null);
  const el = layout?.slides.find((s) => s.slide === target.slide)?.elements.find((e) => e.name === target.name);
  if (!el) return `The user pointed at element "${target.name}" on slide ${target.slide}.`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return `The user pointed at slide ${target.slide}, ${el.kind} element objectName "${el.name}" (x ${pct(el.x)}, y ${pct(el.y)}, w ${pct(el.w)}, h ${pct(el.h)} of the slide)${el.text ? `, current text: ${JSON.stringify(el.text.slice(0, 500))}` : ""}.`;
}

/** A follow-up request on an idle run (the caller has claimed the run). */
export async function continueOctoSlidesRun(run: OctoSlidesRun, text: string, target?: EditTarget) {
  compactHistory(run.messages);
  const where = target ? `${await describeTarget(run, target)}\n` : "";
  const edits = await readFile(join(run.dir, "edits.json"), "utf8").catch(() => "");
  const editsNote = edits && edits.includes('"text"') ? "\n(edits.json holds the user's manual text edits; they are re-applied after every build. If this request changes one of those elements, update or remove its entry in edits.json too.)" : "";
  run.messages.push({
    role: "user",
    content: `Change request for the existing deck (build.js and the other files are still in the workspace):\n${where}${text}${editsNote}\nMake the change in build.js (or motion.json), rebuild, validate, render the slides you changed and check them, then call finish.`,
  });
  emit(run, { type: "turn_started", text, ...(target ? { target } : {}) });
  launch(run, FOLLOW_UP);
}
