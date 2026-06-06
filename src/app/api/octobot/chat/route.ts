import { NextRequest } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── Structured JSON prompts ───────────────────────────────────────────────────
const TONE_FLAVOR: Record<string, string> = {
  positive:     "You are warm, encouraging, and celebrate strengths enthusiastically. Find the best in the essay.",
  sweet:        "You are warm and constructive — balance genuine encouragement with honest, gentle feedback.",
  neutral:      "You are objective and calm. Assess the writing honestly without forced positivity or negativity.",
  direct:       "You are plain and direct. No sugarcoating, no cruelty. Clear, honest, straight to the point.",
  no_nonsense:  "You are brutally efficient. Cut the fluff. Sharp, fast, zero tolerance for weak writing.",
  roast:        "You ROAST the user's writing mercilessly. Mock it, drag it, be a savage comedy critic. Use 💀, 😂, lmao, brutal sarcasm. Be relentless — the user asked for it.",
};

function buildStructuredPrompt(tone: string, essay?: string): string {
  const flavor = TONE_FLAVOR[tone] ?? TONE_FLAVOR.roast;

  const base = `You are Octo, the essay critique bot at Octopilot AI. ${flavor}

Return ONLY valid JSON — no markdown fences, no explanation, nothing before or after the JSON object.

Schema (strict):
{
  "sections": [
    {
      "heading": "Section Title",
      "items": [
        { "title": "Short punchy bullet title", "detail": "2–3 sentences specific to the actual essay. Not generic advice." }
      ]
    }
  ]
}

Rules:
- Two sections: first = observations/critique, second = actionable suggestions
- 3–5 items per section
- Bullet titles must be punchy and specific to the essay content (not generic like "Improve your intro")
- Detail must reference actual content from the essay — be specific
- Respond in the user's language
- Output ONLY the JSON object`;

  return essay?.trim()
    ? `${base}\n\nEssay to critique:\n\n${essay.trim().slice(0, 8000)}`
    : base;
}

// ── Streaming prompts (for per-bullet follow-up chats) ────────────────────────
const STREAMING_PROMPTS: Record<string, string> = {
  positive:    "You are Octo at Octopilot AI. You are warm and encouraging. Give a concise, helpful response. Respond in the user's language.",
  sweet:       "You are Octo at Octopilot AI. You are warm and constructive. Give a concise response. Respond in the user's language.",
  neutral:     "You are Octo at Octopilot AI. You are objective and calm. Give a concise, honest response. Respond in the user's language.",
  direct:      "You are Octo at Octopilot AI. You are direct and plain. Respond concisely. Respond in the user's language.",
  no_nonsense: "You are Octo at Octopilot AI. Brutally efficient. Short, sharp, no fluff. Respond in the user's language.",
  roast:       "You are Octo at Octopilot AI. Be a concise savage. 💀 Respond in the user's language.",
};

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
      tone?: string;
      context?: string;
      structured?: boolean;
    };

    const { messages, tone = "roast", context, structured = true } = body;

    if (!messages?.length) {
      return Response.json({ error: "No messages provided." }, { status: 400 });
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    // ── Structured JSON mode (main Octo critique) ─────────────────────────────
    if (structured) {
      const systemPrompt = buildStructuredPrompt(tone, context);

      const upstreamRes = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://octopilotai.com",
          "X-Title": "OctoPilot AI",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          temperature: tone === "roast" ? 0.9 : 0.7,
          max_tokens: 1200,
        }),
      });

      if (!upstreamRes.ok) {
        const err = await upstreamRes.text();
        console.error("[OctoBot] OpenRouter error:", upstreamRes.status, err);
        return Response.json({ error: `API error: ${upstreamRes.status}` }, { status: upstreamRes.status });
      }

      const data = await upstreamRes.json() as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content ?? "";

      try {
        const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const parsed = JSON.parse(cleaned) as { sections?: unknown[] };
        return Response.json(parsed);
      } catch {
        // Fallback: treat as plain text
        return Response.json({ fallbackText: raw });
      }
    }

    // ── Streaming mode (per-bullet follow-up chats) ───────────────────────────
    const base = STREAMING_PROMPTS[tone] ?? STREAMING_PROMPTS.roast;
    const systemPrompt = context?.trim()
      ? `${base}\n\nEssay context:\n\n${context.trim().slice(0, 4000)}`
      : base;

    const upstreamRes = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://octopilotai.com",
        "X-Title": "OctoPilot AI",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: tone === "roast" ? 0.95 : 0.7,
        max_tokens: 400,
        stream: true,
      }),
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      const err = await upstreamRes.text();
      console.error("[OctoBot] Stream error:", upstreamRes.status, err);
      return Response.json({ error: `API error: ${upstreamRes.status}` }, { status: upstreamRes.status });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const reader = upstreamRes.body.getReader();

    const readable = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const chunk = trimmed.slice(6);
              if (chunk === "[DONE]") { controller.close(); return; }
              try {
                const parsed = JSON.parse(chunk) as { choices?: { delta?: { content?: string } }[] };
                const text = parsed.choices?.[0]?.delta?.content ?? "";
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* skip malformed */ }
            }
          }
        } catch (err) {
          console.error("[OctoBot] Stream read error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[OctoBot] Error:", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
