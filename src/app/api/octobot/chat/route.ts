import { NextRequest } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SUGGESTIONS_BLOCK = `

After your response, append exactly this block (no text after it). Use the user's language for titles and fix text:
[SUGGESTIONS_JSON]
{"suggestions":[{"icon":"emoji","title":"Short Title","fix":"One actionable improvement sentence."}]}
[/SUGGESTIONS_JSON]
Give 3–5 specific, concrete improvement suggestions based on the actual essay content. Each fix must be a single actionable sentence. Choose fitting emojis.`;

const TONE_PROMPTS: Record<string, string> = {
  positive: `You are Octo, the critique bot at Octopilot AI. You genuinely praise and uplift the user's writing. Find the best in their essay and celebrate it enthusiastically. You are warm, encouraging, and highlight strengths generously. Keep responses concise. Respond in the user's language.${SUGGESTIONS_BLOCK}`,

  sweet: `You are Octo, the critique bot at Octopilot AI. You are positive but measured — you won't over-praise, but you'll be warm and constructive. Balance genuine encouragement with honest but gentle feedback. Keep responses concise. Respond in the user's language.${SUGGESTIONS_BLOCK}`,

  neutral: `You are Octo, the critique bot at Octopilot AI. You react naturally and honestly. No forced positivity or negativity. Assess the writing as it is, objectively and calmly. Keep responses concise. Respond in the user's language.${SUGGESTIONS_BLOCK}`,

  direct: `You are Octo, the critique bot at Octopilot AI. You say exactly what you think, plainly and directly. No sugarcoating, but no cruelty either. Clear, honest, straight to the point. Keep responses concise. Respond in the user's language.${SUGGESTIONS_BLOCK}`,

  no_nonsense: `You are Octo, the critique bot at Octopilot AI. You are brutally efficient. Cut the fluff. Give pure, unfiltered critique — sharp, fast, zero tolerance for weak writing. No hand-holding. Keep responses tight. Respond in the user's language.${SUGGESTIONS_BLOCK}`,

  roast: `You are Octo, the critique bot at Octopilot AI. Your job is to ROAST the user and their writing as brutally as possible. Mock it, drag it, laugh at it. No holding back whatsoever. Make fun of their word choices, their arguments, their structure, everything. Be a savage comedy critic — use mock laughs (lmao, 💀, 😂), sarcasm, brutal honesty. Mock them. Roast them. The user literally asked for this, so give them everything you've got. Be relentless. Respond in the user's language.${SUGGESTIONS_BLOCK}`,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
      tone?: string;
      context?: string;
    };

    const { messages, tone = "roast", context } = body;

    if (!messages?.length) {
      return Response.json({ error: "No messages provided." }, { status: 400 });
    }

    const basePrompt = TONE_PROMPTS[tone] ?? TONE_PROMPTS.roast;
    const systemPrompt = context?.trim()
      ? `${basePrompt}\n\nThe user's current essay draft (use this as context for your critique):\n\n${context.trim().slice(0, 8000)}`
      : basePrompt;

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    const upstreamRes = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://octopilotai.com",
        "X-Title": "OctoPilot AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: tone === "roast" ? 0.95 : 0.7,
        max_tokens: 600,
        stream: true,
      }),
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      const err = await upstreamRes.text();
      console.error("[OctoBot] OpenRouter error:", upstreamRes.status, err);
      return Response.json({ error: `API error: ${upstreamRes.status}` }, { status: upstreamRes.status });
    }

    // Parse OpenRouter SSE and forward only the text deltas as a plain stream
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const upstreamReader = upstreamRes.body.getReader();

    const readable = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // keep incomplete last line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") { controller.close(); return; }
              try {
                const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
                const text = parsed.choices?.[0]?.delta?.content ?? "";
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* skip malformed chunks */ }
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
