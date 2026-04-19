// `humanize_essay` tool — sends ctx.essay through StealthGPT or
// UndetectableAI, stores the result in ctx.humanizedContent, and emits a
// context_update so the client can render the humanized text live.
//
// Provider selection: the orchestrator passes `provider` from the user's
// answer to the humanizerChoice question. Defaults to StealthGPT.
//
// UndetectableAI is asynchronous: the submit call returns a documentId and
// we have to poll until the output is ready (up to ~2 minutes).

import { getHumanizerApiKey } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { deductCredits, creditsFromWords, countWords } from "@/server/ghostwriter/shared/credits";

const STEALTHGPT_URL = "https://www.stealthgpt.ai/api/stealthify";
const UNDETECTABLE_SUBMIT_URL = "https://humanize.undetectable.ai/submit";
const UNDETECTABLE_DOCUMENT_URL = "https://humanize.undetectable.ai/document";

type HumanizeArgs = {
  provider?: "StealthGPT" | "UndetectableAI";
};

type HumanizeResult = {
  provider: string;
  outputLength: number;
};

export const humanizeEssayTool: Tool<HumanizeArgs, HumanizeResult> = {
  name: "humanize_essay",
  description:
    "Send the drafted essay through an AI-bypass humanizer (StealthGPT or UndetectableAI). Reads ctx.essay. Writes humanized text to ctx.humanizedContent. Ask the user for their provider preference with field=\"humanizerChoice\" before calling this. Defaults to StealthGPT if no provider is given.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      provider: {
        type: "string",
        enum: ["StealthGPT", "UndetectableAI"],
        description: "Which humanizer to use. Defaults to StealthGPT.",
      },
    },
  },
  timeoutMs: 180_000,
  stepTitle: (args) => `Humanizing with ${(args as HumanizeArgs).provider || "StealthGPT"}`,
  async execute(args, { run }) {
    const ctx = run.context;
    if (!ctx.essay?.trim()) {
      throw new Error("humanize_essay: essay is missing — run write_essay first.");
    }

    const provider = args.provider ?? "StealthGPT";
    let humanized: string;

    if (provider === "UndetectableAI") {
      humanized = await runUndetectable(ctx.essay);
    } else {
      humanized = await runStealthGPT(ctx.essay);
    }

    ctx.humanizedContent = humanized;
    ctx.humanizerProvider = provider;

    emit(run, {
      type: "context_update",
      patch: {
        humanizedContent: humanized,
        humanizeProvider: provider,
        humanizerProvider: provider,
      },
    });

    // Deduct humanizer credits based on the source essay word count —
    // matches HumanizerView's pattern of using the target/input word count.
    const essayWords = countWords(ctx.essay ?? "");
    if (essayWords > 0 && run.authToken) {
      await deductCredits(
        run.authToken,
        "humanizer",
        creditsFromWords(essayWords),
        `${run.id}:humanizer`,
      ).catch((err: unknown) => {
        emit(run, {
          type: "step_error",
          id: `${run.id}-credits-humanizer`,
          error: err instanceof Error ? err.message : "Humanizer credit deduction failed.",
          retryable: false,
        });
      });
    }

    return { provider, outputLength: humanized.length };
  },
};

// ─── StealthGPT ──────────────────────────────────────────────────────────────

async function runStealthGPT(essay: string): Promise<string> {
  const apiKey = await getHumanizerApiKey("stealthgpt");

  const response = await fetch(STEALTHGPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-token": apiKey,
    },
    body: JSON.stringify({
      prompt: essay,
      rephrase: false,
      tone: "Standard",
      mode: "Medium",
      detector: "GPTZero",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`StealthGPT ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { result?: string };
  const result = data.result?.trim();
  if (!result) throw new Error("StealthGPT returned an empty result.");
  return result;
}

// ─── UndetectableAI ──────────────────────────────────────────────────────────

async function runUndetectable(essay: string): Promise<string> {
  const apiKey = await getHumanizerApiKey("undetectable");

  // Submit
  const submitRes = await fetch(UNDETECTABLE_SUBMIT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      content: essay,
      readability: "University",
      purpose: "Essay",
      strength: "More Human",
      model: "v11",
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw new Error(`UndetectableAI submit ${submitRes.status}: ${text}`);
  }

  const submitted = (await submitRes.json()) as { output?: string; id?: string; documentId?: string };

  // Sometimes the output is returned immediately
  if (submitted.output?.trim()) return submitted.output.trim();

  const documentId = submitted.id || submitted.documentId;
  if (!documentId) {
    throw new Error("UndetectableAI did not return a document id.");
  }

  // Poll
  return pollUndetectable(apiKey, String(documentId));
}

async function pollUndetectable(apiKey: string, id: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }

    const res = await fetch(UNDETECTABLE_DOCUMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      if (attempt === 11) throw new Error(`UndetectableAI document poll failed: ${res.status}`);
      continue;
    }

    const data = (await res.json()) as { output?: string };
    if (data.output?.trim()) return data.output.trim();
  }

  throw new Error("UndetectableAI is still processing. Please try again.");
}
