import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getSystemPrompt(mode: string, requestedType?: string, customTitle?: string, count?: number): string {
    const basePrompt = `You are Lily, an academic outline generation agent for OctoPilot AI.
You must respond with ONLY valid JSON — no markdown, no explanation, no extra text.

Each outline item must have:
- "type": exactly one of "Introduction", "Body Paragraph", or "Conclusion"
- "title": a specific, descriptive title for this section
- "description": 2-3 sentences describing what this section should cover

Respond in exactly this JSON format:
{
  "outlines": [
    { "type": "...", "title": "...", "description": "..." }
  ]
}`;

    if (mode === "auto") {
        const total = Math.max(3, Math.min(20, Number(count) || 5));
        const bodyCount = Math.max(1, total - 2);
        return `${basePrompt}

Generate exactly ${total} outline items in this order:
1. One Introduction
2. ${bodyCount} Body Paragraph${bodyCount === 1 ? "" : "s"} (each covering a distinct aspect)
${total}. One Conclusion

The ${total} items must consist of exactly 1 Introduction, ${bodyCount} Body Paragraph${bodyCount === 1 ? "" : "s"}, and 1 Conclusion — in that order.

Make each section specific, detailed, and directly related to the assignment.`;
    }

    if (mode === "build") {
        return `${basePrompt}

Generate exactly 1 outline item of type "${requestedType}".
The user wants the section to focus on this topic: "${customTitle}"
Make it specific and directly related to both the assignment and the user's requested topic.`;
    }

    if (mode === "single") {
        return `${basePrompt}

Generate exactly 1 outline item of type "${requestedType}".
Make it specific, detailed, and directly related to the assignment.`;
    }

    return basePrompt;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) {
            return auth.response;
        }

        const body = await request.json();
        const { analysis, essayTopic, essayType, scope, structure, mode, requestedType, customTitle, count } = body;
        const { apiKey, model } = await getOpenRouterConfig("secondary");

        const systemPrompt = getSystemPrompt(mode, requestedType, customTitle, count);

        const userMessage = `
Essay Topic: ${essayTopic || "Not specified"}
Essay Type: ${essayType || "Not specified"}
Scope: ${scope || "Not specified"}
Structure: ${structure || "Not specified"}

Assignment Analysis:
${analysis || "No analysis available"}
`.trim();

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
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                temperature: 0.5,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Lily] OpenRouter error:", response.status, errorText);
            return NextResponse.json(
                { error: `OpenRouter API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return NextResponse.json(
                { error: "No response content from model" },
                { status: 500 }
            );
        }

        const parsed = JSON.parse(content);

        return NextResponse.json({
            outlines: (parsed.outlines || []).map((o: { type: string; title: string; description: string }) => ({
                type: o.type || "Body Paragraph",
                title: o.title || "",
                description: o.description || "",
            })),
        });
    } catch (error) {
        console.error("[Lily] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during outline generation" },
            { status: 500 }
        );
    }
}
