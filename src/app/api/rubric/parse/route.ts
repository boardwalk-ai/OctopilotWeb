import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are a rubric parser for an academic essay writing tool.
Read the provided rubric document carefully — it may be an image, PDF text, or plain text.
Extract every grading criterion and return ONLY valid JSON with no markdown, no explanation, no extra text.

Respond in exactly this format:
{
  "criteria": [
    {
      "name": "Criterion name",
      "description": "What the student must do to earn full marks on this criterion",
      "points": 25
    }
  ]
}

Rules:
- Include ALL criteria listed in the rubric.
- "description" should be a concise actionable summary of what is expected.
- Include "points" only if the rubric specifies a numeric value for that criterion. Omit it otherwise.
- If the rubric has performance levels (Excellent/Good/Fair/Poor), summarise the Excellent/full-marks descriptor in "description".`;

type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) return auth.response;

        const body = await request.json() as {
            text?: string;
            imageDataUrl?: string;
        };

        const text = typeof body.text === "string" ? body.text.trim() : "";
        const imageDataUrl = typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:")
            ? body.imageDataUrl
            : "";

        if (!text && !imageDataUrl) {
            return NextResponse.json({ error: "Provide text or imageDataUrl" }, { status: 400 });
        }

        const { apiKey, model } = await getOpenRouterConfig("secondary");

        let userContent: string | ContentBlock[];
        if (imageDataUrl) {
            const blocks: ContentBlock[] = [
                { type: "image_url", image_url: { url: imageDataUrl } },
                { type: "text", text: text || "Parse the rubric shown in this image." },
            ];
            userContent = blocks;
        } else {
            userContent = `Rubric document:\n\n${text}`;
        }

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
                temperature: 0.1,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => "");
            console.error("[RubricParser] OpenRouter error:", response.status, err);
            return NextResponse.json({ error: `OpenRouter API error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            return NextResponse.json({ error: "No response from model" }, { status: 500 });
        }

        const parsed = JSON.parse(content as string) as { criteria?: unknown[] };
        return NextResponse.json({ criteria: parsed.criteria ?? [] });
    } catch (error) {
        console.error("[RubricParser] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
