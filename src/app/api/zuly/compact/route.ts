import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getOpenRouterConfig } from "@/server/backendConfig";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { task, fullContent, sourceTitle, sourceType, fileName, extractedText } = body;

        const activeTask = task === "writing_style_analysis" ? "writing_style_analysis" : "source_compaction";

        if (activeTask === "source_compaction" && !fullContent) {
            return NextResponse.json(
                { error: "Missing required field: fullContent" },
                { status: 400 }
            );
        }

        if (activeTask === "writing_style_analysis" && !extractedText) {
            return NextResponse.json(
                { error: "Missing required field: extractedText" },
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

        const userMessage = activeTask === "writing_style_analysis"
            ? `Task: WRITING_STYLE_ANALYSIS
Uploaded File: ${fileName || "Unknown"}

Extracted Writing Sample:
${extractedText}`
            : `Task: SOURCE_COMPACTION
Source Type: ${sourceType || "unknown"}
Source Title: ${sourceTitle || "Unknown"}

Full Content:
${fullContent}`;

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
                    { role: "user", content: userMessage },
                ],
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
