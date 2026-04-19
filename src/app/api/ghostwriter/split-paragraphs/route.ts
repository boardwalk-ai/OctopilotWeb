import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type OutlineSpec = { type?: string; title?: string };

function buildSystemPrompt(outlines: OutlineSpec[]): string {
    const total = outlines.length;
    return `You are a paragraph-splitting agent for OctoPilot AI.

You will receive an academic essay that was recently passed through an AI-humanizer. The humanizer merged every paragraph into one block of continuous text. Your job is to split that text back into exactly ${total} paragraphs that match the intended structure — without changing any wording.

Hard rules:
- Preserve EVERY sentence and EVERY word from the input, in the exact same order. Do NOT rewrite, paraphrase, or reorder.
- Do NOT add any new sentences, transitions, headings, or section titles.
- Only decide where one paragraph ends and the next begins.
- The final output must have exactly ${total} paragraphs matching the provided structure (Introduction → Body Paragraphs → Conclusion).
- If the input obviously contains a References / Bibliography / Works Cited section at the end, leave it attached to the final Conclusion paragraph — do not split citations.

Respond with ONLY valid JSON — no markdown, no commentary — in this exact shape:
{
  "paragraphs": [
    { "type": "Introduction" | "Body Paragraph" | "Conclusion", "text": "..." }
  ]
}`;
}

function buildUserMessage(humanizedText: string, outlines: OutlineSpec[]): string {
    const plan = outlines
        .map((o, i) => `${i + 1}. ${o.type || "Body Paragraph"} — ${o.title || "(no title)"}`)
        .join("\n");
    return `Target paragraph structure (in order):
${plan}

Essay text (merged into one block by the humanizer):
${humanizedText}

Split the text into exactly ${outlines.length} paragraphs matching the structure above. Preserve all wording verbatim.`;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) return auth.response;

        const body = await request.json();
        const humanizedText = String(body.humanizedText || "").trim();
        const outlines = Array.isArray(body.outlines) ? (body.outlines as OutlineSpec[]) : [];

        if (!humanizedText) {
            return NextResponse.json({ error: "humanizedText is required" }, { status: 400 });
        }
        if (outlines.length < 2) {
            return NextResponse.json({ error: "At least 2 outline sections are required" }, { status: 400 });
        }

        const { apiKey, model } = await getOpenRouterConfig("secondary");

        const response = await fetch(OPENROUTER_API_URL, {
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
                    { role: "system", content: buildSystemPrompt(outlines) },
                    { role: "user", content: buildUserMessage(humanizedText, outlines) },
                ],
                temperature: 0.2,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("[SplitParagraphs] OpenRouter error:", response.status, errText);
            return NextResponse.json({ error: `OpenRouter API error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            return NextResponse.json({ error: "No response content from model" }, { status: 500 });
        }

        const parsed = JSON.parse(content) as { paragraphs?: Array<{ type?: string; text?: string }> };
        const paragraphs = (parsed.paragraphs || [])
            .map((p) => ({ type: String(p.type || "Body Paragraph"), text: String(p.text || "").trim() }))
            .filter((p) => p.text.length > 0);

        return NextResponse.json({ paragraphs });
    } catch (error) {
        console.error("[SplitParagraphs] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during paragraph splitting" },
            { status: 500 }
        );
    }
}
