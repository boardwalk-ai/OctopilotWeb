import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Hein's system prompt
const SYSTEM_PROMPT = `You are Hein, an academic assignment analysis agent for OctoPilot AI.
Your job is to analyze the user's assignment instructions along with their selected major and essay type.
If images are attached, read them carefully — they may contain assignment sheets, rubrics, or visual prompts.
You must respond with ONLY valid JSON — no markdown, no explanation, no extra text.

Respond in exactly this JSON format:
{
  "analysis": "A 2-3 sentence summary of what the assignment is asking the student to do",
  "essayTopic": "The main topic/subject identified from the instructions",
  "essayType": "The type of essay (e.g., Informative, Argumentative, Analytical, Persuasive, etc.)",
  "scope": "What the essay should cover — the boundaries and focus area",
  "structure": "The recommended essay structure (e.g., introduction, body paragraphs, and conclusion)"
}`;

type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) {
            return auth.response;
        }

        const body = await request.json();
        const { major, essayType, instructions, imageDataUrls } = body as {
            major?: string;
            essayType?: string;
            instructions?: string;
            imageDataUrls?: string[];
        };

        const hasText = typeof instructions === "string" && instructions.trim().length > 0;
        const images: string[] = Array.isArray(imageDataUrls)
            ? imageDataUrls.filter((u) => typeof u === "string" && u.startsWith("data:"))
            : [];

        if (!hasText && images.length === 0) {
            return NextResponse.json(
                { error: "Missing required field: instructions or at least one image" },
                { status: 400 }
            );
        }

        const { apiKey, model } = await getOpenRouterConfig("secondary");

        const textBlock = `Major: ${major || "Not specified"}
Essay Type: ${essayType || "Not specified"}

Assignment Instructions:
${instructions?.trim() || "(No text — see attached image(s) above)"}`.trim();

        // Build vision-capable content array when images are present
        let userContent: string | ContentBlock[];
        if (images.length > 0) {
            const blocks: ContentBlock[] = images.map((url) => ({
                type: "image_url",
                image_url: { url },
            }));
            blocks.push({ type: "text", text: textBlock });
            userContent = blocks;
        } else {
            userContent = textBlock;
        }

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
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userContent },
                ],
                temperature: 0.3,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Hein] OpenRouter error:", response.status, errorText);
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

        const parsed = JSON.parse(content as string);

        return NextResponse.json({
            analysis: parsed.analysis || "",
            essayTopic: parsed.essayTopic || "",
            essayType: parsed.essayType || "",
            scope: parsed.scope || "",
            structure: parsed.structure || "",
        });
    } catch (error) {
        console.error("[Hein] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during analysis" },
            { status: 500 }
        );
    }
}
