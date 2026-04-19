// Small helper for JSON-mode OpenRouter calls shared across agent tools.
//
// Centralises the retry + JSON-mode fallback dance that otherwise gets
// copy-pasted into every tool: if the provider returns 429/5xx, retry with
// backoff; if it rejects `response_format`, strip it and retry. The tools
// (plan, outlines, search, compact, critique…) all need the same shape,
// so keep it here.

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type CallJsonOptions = {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  // Defaults true. Set to false for providers/models that refuse
  // `response_format` outright.
  jsonMode?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stripCodeFence(raw: string): string {
  const text = (raw || "").trim();
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

// Loose JSON parsing — tolerates code fences and surrounding prose. Returns
// either a parsed object/array or throws.
export function parseJsonLoose(raw: string): unknown {
  const cleaned = stripCodeFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: first JSON object or array substring.
    const objStart = cleaned.indexOf("{");
    const objEnd = cleaned.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      try {
        return JSON.parse(cleaned.slice(objStart, objEnd + 1));
      } catch {
        /* fall through */
      }
    }
    const arrStart = cleaned.indexOf("[");
    const arrEnd = cleaned.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    }
    throw new Error("Could not parse model response as JSON");
  }
}

// Call OpenRouter expecting a JSON response. Retries on transient failures
// and transparently drops `response_format` once if the provider rejects
// it (some models 400 on unknown fields).
export async function callJson(options: CallJsonOptions): Promise<string> {
  const { apiKey, model, messages, temperature = 0.3 } = options;
  const useJsonMode = options.jsonMode !== false;

  let payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  let allowNoFormatFallback = useJsonMode;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://octopilotai.com",
          "X-Title": "OctoPilot AI",
        },
        body: JSON.stringify(payload),
      });

      lastResponse = response;

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const content = data.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("OpenRouter returned empty content");
        return content;
      }

      if (allowNoFormatFallback && response.status === 400 && "response_format" in payload) {
        allowNoFormatFallback = false;
        payload = { ...payload };
        delete payload.response_format;
        continue;
      }

      if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenRouter ${response.status}: ${text || response.statusText}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;
    }
    await sleep(400 * (attempt + 1));
  }

  if (lastResponse && !lastResponse.ok) {
    const text = await lastResponse.text().catch(() => "");
    throw new Error(`OpenRouter ${lastResponse.status}: ${text || lastResponse.statusText}`);
  }
  throw lastError instanceof Error ? lastError : new Error("OpenRouter request failed");
}
