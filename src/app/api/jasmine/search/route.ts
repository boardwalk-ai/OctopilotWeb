import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { targetCount, essayTopic, outlines, apiKey, model } = body;

        if (!targetCount || !essayTopic || !outlines || !apiKey || !model) {
            return NextResponse.json(
                { error: "Missing required fields: targetCount, essayTopic, outlines, apiKey, or model" },
                { status: 400 }
            );
        }

        // Read Jasmine's system prompt from the agent file
        const agentFile = path.resolve(process.cwd(), "agents/jasmine.md");
        const SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");

        const userMessage = `
Number of links needed: ${targetCount}
Essay Topic: ${essayTopic}

Supporting Outlines:
${JSON.stringify(outlines, null, 2)}
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
                model: model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Jasmine] OpenRouter error:", response.status, errorText);
            fs.writeFileSync("/tmp/jasmine_error.log", `Status: ${response.status}\nError: ${errorText}\nPayload: ${JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                ],
            }, null, 2)}`);
            return NextResponse.json(
                { error: `OpenRouter API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        console.log("[Jasmine] Raw model response:", content?.slice(0, 300));

        if (!content) {
            return NextResponse.json(
                { error: "No response content from model" },
                { status: 500 }
            );
        }

        // Perplexity models may wrap JSON in markdown code fences — strip them
        let jsonStr = content.trim();
        if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }

        const parsed = JSON.parse(jsonStr);

        // The response might be an array directly or an object with a key wrapping an array
        const results = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray) || parsed;
        return NextResponse.json(results);

    } catch (error) {
        console.error("[Jasmine] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during search" },
            { status: 500 }
        );
    }
}
