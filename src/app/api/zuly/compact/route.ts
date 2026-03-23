import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterMessage =
    | { role: "system" | "user"; content: string }
    | {
        role: "user";
        content: Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
        >;
    };

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) {
            return auth.response;
        }

        const body = await request.json();
        const { task, fullContent, sourceTitle, sourceType, fileName, extractedText, pageImages } = body;

        const activeTask = task === "writing_style_analysis" ? "writing_style_analysis" : "source_compaction";

        if (activeTask === "source_compaction" && !fullContent) {
            return NextResponse.json(
                { error: "Missing required field: fullContent" },
                { status: 400 }
            );
        }

        const hasPdfPages = Array.isArray(pageImages) && pageImages.some((item) => typeof item === "string" && item.trim().length > 0);

        if (activeTask === "writing_style_analysis" && !extractedText && !hasPdfPages) {
            return NextResponse.json(
                { error: "Missing required field: extractedText or pageImages" },
                { status: 400 }
            );
        }

        const { apiKey, model } = await getOpenRouterConfig("secondary");

        // Read Zuly's system prompt
        const agentFile = path.resolve(process.cwd(), "agents/zuly.md");
        const BASE_SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");
        const SYSTEM_PROMPT = activeTask === "writing_style_analysis"
            ? `${BASE_SYSTEM_PROMPT}

You are now handling WRITING_STYLE_ANALYSIS.
Return strict JSON with exactly these keys:
- "writing_style"
- "grammar_usage_style"
- "vocabulary_usage_style_and_level"
- "common_mistakes" (array of strings)

No markdown. No commentary. No extra keys.`
            : `${BASE_SYSTEM_PROMPT}

You are now handling SOURCE_COMPACTION.
Return strict JSON with exactly these keys:
- "compacted_content"
- "key_points"
- "relevant_quotes"

No markdown. No commentary. No extra keys.`;

        const messages: OpenRouterMessage[] = activeTask === "writing_style_analysis"
            ? hasPdfPages
                ? [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Task: WRITING_STYLE_ANALYSIS
Uploaded File: ${fileName || "Unknown"}

Analyze the attached PDF pages directly and return only the required JSON.`,
                            },
                            ...(pageImages as string[])
                                .filter((item) => typeof item === "string" && item.trim().length > 0)
                                .map((imageUrl) => ({
                                    type: "image_url" as const,
                                    image_url: { url: imageUrl },
                                })),
                        ],
                    },
                ]
                : [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: `Task: WRITING_STYLE_ANALYSIS
Uploaded File: ${fileName || "Unknown"}

Extracted Writing Sample:
${extractedText}`,
                    },
                ]
            : [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `Task: SOURCE_COMPACTION
Source Type: ${sourceType || "unknown"}
Source Title: ${sourceTitle || "Unknown"}

Full Content:
${fullContent}`,
                },
            ];

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
                messages,
                temperature: 0.2,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Zuly] OpenRouter error:", response.status, errorText);
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

        // Strip markdown code fences if present
        let jsonStr = content.trim();
        if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }

        const parsed = JSON.parse(jsonStr);
        return NextResponse.json(parsed);

    } catch (error) {
        console.error("[Zuly] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during Zuly task" },
            { status: 500 }
        );
    }
}
