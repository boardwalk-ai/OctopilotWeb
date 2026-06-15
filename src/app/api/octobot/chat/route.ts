import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";

export const runtime = "nodejs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── Tone flavor ───────────────────────────────────────────────────────────────
const TONE_FLAVOR: Record<string, string> = {
  positive:    "Be warm and encouraging. Celebrate strengths. When pointing out flaws, be gentle and constructive.",
  sweet:       "Be balanced — genuine praise where due, honest but gentle about problems.",
  neutral:     "Be objective and calm. No forced positivity or negativity.",
  direct:      "Be plain and direct. No sugarcoating. Blunt but not cruel.",
  no_nonsense: "Be brutally efficient. Zero tolerance for weak writing. Short and sharp.",
  roast:       "ROAST the essay mercilessly. Use 💀, 😂, lmao, savage sarcasm. The user asked for it — go all in.",
};

// ── Main structured prompt ────────────────────────────────────────────────────
function buildStructuredPrompt(tone: string, essay?: string, mode?: "chat" | "criticism"): string {
  const flavor = TONE_FLAVOR[tone] ?? TONE_FLAVOR.roast;

  const modeDirective =
    mode === "criticism"
      ? `\nThe user has explicitly selected CRITICISM mode — ALWAYS return the full critique JSON below, even for short prompts. Do not return a chat response.\n`
      : mode === "chat"
      ? `\nThe user has explicitly selected CHAT mode — ALWAYS respond conversationally as {"type":"chat","message":"..."}. Do NOT return a critique unless they paste an essay and clearly ask for one.\n`
      : "";

  const base = `You are Octo, an essay critique bot at Octopilot AI. ${flavor}
${modeDirective}
Read the user's message carefully:

— If the user is CHATTING (greeting, question, casual comment, off-topic) →
  Respond naturally in plain text. Be brief and friendly. Do NOT critique.
  Return: {"type":"chat","message":"your response here"}

— If the user wants CRITIQUE, ANALYSIS, FEEDBACK, or REVIEW of their essay →
  Analyze the essay deeply and return the full critique JSON below.

For CRITIQUE, return ONLY valid JSON — no markdown fences, no extra text:
{
  "type": "critique",
  "grammar": [
    {
      "title": "Short label (e.g. Run-on sentence in ¶2)",
      "issue": "Exact location + quote the problematic text. e.g. 'Paragraph 2, line 3: \\"The economy grew but inflation also rose and workers all suffered\\""  — explain specifically what is wrong.",
      "fix": "The corrected version or exactly what to change.",
      "quote": "VERBATIM copy of the problematic text from the essay — character-for-character identical, 3 to 20 words, no paraphrasing, no added quotation marks. Used to highlight the text in the editor."
    }
  ],
  "style": [
    {
      "title": "Short label (e.g. Passive voice overuse in ¶3)",
      "observation": "Exact location + quote the text. State clearly whether it's good or bad and why.",
      "suggestion": "If bad: rewrite it. If good: explain what makes it effective.",
      "quote": "VERBATIM copy of the relevant text from the essay — character-for-character identical, 3 to 20 words, no paraphrasing, no added quotation marks. Used to highlight the text in the editor."
    }
  ],
  "ratings": {
    "vocabulary": <integer 1-10>,
    "grammar": <integer 1-10>,
    "thinking": <integer 1-10>,
    "ideas": <integer 1-10>
  }
}

RULES for critique:
- grammar: 2–4 items. ALWAYS cite exact paragraph/line and QUOTE the actual text.
- style: 2–4 items. ALWAYS cite exact paragraph/line and QUOTE the actual text.
- quote: MUST be copied verbatim from the essay text (exact characters, exact spelling — even if misspelled). If you paraphrase, highlighting breaks.
- ratings: integers 1–10 reflecting the actual essay quality. Be honest.
- Address the essay directly — no generic advice. Reference what is actually written.
- Respond in the user's language.`;

  return essay?.trim()
    ? `${base}\n\nEssay to critique:\n\n${essay.trim().slice(0, 8000)}`
    : base;
}

// ── Streaming prompt for per-bullet follow-up chats ───────────────────────────
const FOLLOW_UP_PROMPTS: Record<string, string> = {
  positive:    "You are Octo at Octopilot AI. Be warm and helpful. Give a concise response. Reply in the user's language.",
  sweet:       "You are Octo at Octopilot AI. Be warm and constructive. Reply in the user's language.",
  neutral:     "You are Octo at Octopilot AI. Be objective and concise. Reply in the user's language.",
  direct:      "You are Octo at Octopilot AI. Be direct and brief. Reply in the user's language.",
  no_nonsense: "You are Octo at Octopilot AI. Efficient and sharp. No fluff. Reply in the user's language.",
  roast:       "You are Octo at Octopilot AI. Concise and savage. 💀 Reply in the user's language.",
};

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
      tone?: string;
      context?: string;      // essay text
      structured?: boolean;  // false = streaming follow-up
      mode?: "chat" | "criticism";  // explicit mode overrides auto-detect
    };

    const { messages, tone = "roast", context, structured = true, mode } = body;

    if (!messages?.length) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    // ── JSON mode: main Octo responses ───────────────────────────────────────
    if (structured) {
      const systemPrompt = buildStructuredPrompt(tone, context, mode);

      const res = await fetch(OPENROUTER_API_URL, {
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
          max_tokens: 1600,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("[OctoBot] Error:", res.status, err);
        return NextResponse.json({ error: `API error: ${res.status}` }, { status: res.status });
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      const raw = (data.choices?.[0]?.message?.content ?? "").trim()
        .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      try {
        const parsed = JSON.parse(raw) as { type?: string };
        return NextResponse.json(parsed);
      } catch {
        return NextResponse.json({ type: "chat", message: raw });
      }
    }

    // ── Streaming mode: per-bullet follow-up chats ───────────────────────────
    const base = FOLLOW_UP_PROMPTS[tone] ?? FOLLOW_UP_PROMPTS.roast;
    const systemPrompt = context?.trim()
      ? `${base}\n\nEssay context:\n\n${context.trim().slice(0, 4000)}`
      : base;

    const res = await fetch(OPENROUTER_API_URL, {
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

    if (!res.ok || !res.body) {
      return NextResponse.json({ error: `API error: ${res.status}` }, { status: res.status });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const reader = res.body.getReader();

    const readable = new ReadableStream({
      async start(controller) {
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data: ")) continue;
              const chunk = t.slice(6);
              if (chunk === "[DONE]") { controller.close(); return; }
              try {
                const p = JSON.parse(chunk) as { choices?: { delta?: { content?: string } }[] };
                const text = p.choices?.[0]?.delta?.content ?? "";
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* skip malformed */ }
            }
          }
        } catch (e) { console.error("[OctoBot] stream error:", e); }
        finally { controller.close(); }
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
    console.error("[OctoBot]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
