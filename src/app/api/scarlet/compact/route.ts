import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { fullContent, sourceTitle, apiKey, model } = body;

        if (!fullContent || !apiKey || !model) {
            return NextResponse.json(
                { error: "Missing required fields: fullContent, apiKey, or model" },
                { status: 400 }
            );
        }

        // Read Scarlet's system prompt
        const agentFile = path.resolve(process.cwd(), "agents/scarlet.md");
        const SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");

        const userMessage = `Source Title: ${sourceTitle || "Unknown"}\n\nFull Content:\n${fullContent}`;

        const response = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://octopilotai.com",
                "X-Title": "OctoPilot AI",
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                ],
                temperature: 0.2,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Scarlet] OpenRouter error:", response.status, errorText);
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
        console.error("[Scarlet] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during compaction" },
            { status: 500 }
        );
    }
}
