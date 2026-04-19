// `plan_essay` tool — the agent's opening move.
//
// Takes the user's raw instruction and returns a structured plan the rest
// of the tools can consult: thesis, how many paragraphs to target, what
// research queries to run, and a short topic/type classification the old
// Hein service used to produce.
//
// Implementation calls the secondary model (cheap, JSON-mode friendly) and
// writes the result into `AgentContext` so downstream tools don't need to
// pass it around in their args.

import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import type { EssayPlan } from "@/server/ghostwriter/agent/context";
import { emit } from "@/server/ghostwriter/agent/runs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type PlanArgs = {
  // Optional orchestrator hints. The model may pass specific guidance for
  // the planner (e.g. "user asked for argumentative framing"). Free-form;
  // the planner sub-agent treats this as extra context, not instructions.
  notes?: string;
};

type PlanResult = {
  essayTopic: string;
  essayType: string;
  plan: EssayPlan;
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

const SYSTEM_PROMPT = `You are the planning sub-agent for the OctoPilot Ghostwriter.

Given a user's essay instruction, produce a concise JSON plan the orchestrator
can use to drive outline generation and research. Respond with ONLY valid
JSON — no markdown, no commentary.

Required shape:
{
  "essayTopic": "short noun phrase naming the topic",
  "essayType": "one of: Argumentative | Analytical | Expository | Narrative | Compare-Contrast | Research | Essay",
  "thesis": "one-sentence thesis the essay should argue or explain",
  "paragraphCount": integer between 3 and 12 inclusive,
  "searchQueries": [3-6 short search queries that would surface citable sources],
  "notes": "one or two sentences of additional guidance for the writer (optional)"
}

Rules:
- Pick essayType from the enumerated list; do not invent new values.
- paragraphCount must include the introduction and conclusion (so the body
  count is paragraphCount - 2).
- searchQueries must be phrased as web queries, not questions. No quotes.
- thesis must be a single declarative sentence.`;

export const planEssayTool: Tool<PlanArgs, PlanResult> = {
  name: "plan_essay",
  description:
    "Produce the essay plan (topic, type, thesis, paragraph count, search queries). Call this FIRST, before any other tool. The plan is stored in run context and consulted by subsequent tools.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      notes: {
        type: "string",
        description:
          "Optional extra guidance for the planner (e.g. framing constraints the user mentioned). Leave empty if there's nothing specific.",
      },
    },
  },
  stepTitle: () => "Planning essay strategy",
  async execute(args, { run }) {
    const instruction = run.context.instruction.trim();
    if (!instruction) {
      throw new Error("Cannot plan: no instruction was provided with the draft.");
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    const userContent =
      `User instruction:\n${instruction}` +
      (args.notes ? `\n\nOrchestrator notes:\n${args.notes}` : "");

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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`plan_essay: OpenRouter ${response.status} ${text}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    if (data.error) throw new Error(`plan_essay: ${data.error.message || "error"}`);

    const content = data.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(content);

    const essayTopic = String(parsed?.essayTopic || "").trim() || "Untitled topic";
    const essayType = String(parsed?.essayType || "Essay").trim();
    const thesis = String(parsed?.thesis || "").trim();
    const paragraphCount = clampInt(Number(parsed?.paragraphCount), 3, 12, 5);
    const searchQueries = Array.isArray(parsed?.searchQueries)
      ? (parsed.searchQueries as unknown[]).map((q) => String(q).trim()).filter(Boolean).slice(0, 6)
      : [];
    const notes = parsed?.notes ? String(parsed.notes) : undefined;

    const plan: EssayPlan = { thesis, paragraphCount, searchQueries, notes };

    // Commit to run context + mirror a slice to the client.
    run.context.essayTopic = essayTopic;
    run.context.essayType = essayType;
    run.context.plan = plan;

    emit(run, {
      type: "context_update",
      patch: { essayTopic, essayType, plan },
    });

    return { essayTopic, essayType, plan };
  },
};

function safeJsonParse(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
