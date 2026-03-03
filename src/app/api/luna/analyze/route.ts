import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Luna's system prompt
const SYSTEM_PROMPT = `You are Luna, an academic assignment analysis agent for OctoPilot AI.
Your job is to analyze the user's assignment instructions along with their selected major and essay type.
You must respond with ONLY valid JSON — no markdown, no explanation, no extra text.

Respond in exactly this JSON format:
{
  "analysis": "A 2-3 sentence summary of what the assignment is asking the student to do",
  "essayTopic": "The main topic/subject identified from the instructions",
  "essayType": "The type of essay (e.g., Informative, Argumentative, Analytical, Persuasive, etc.)",
  "scope": "What the essay should cover — the boundaries and focus area",
  "structure": "The recommended essay structure (e.g., introduction, body paragraphs, and conclusion)"
}`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { major, essayType, instructions, apiKey, model } = body;

        if (!instructions || !apiKey || !model) {
            return NextResponse.json(
                { error: "Missing required fields: instructions, apiKey, and model" },
                { status: 400 }
            );
        }

        const targetModel = model;

        const userMessage = `
Major: ${major || "Not specified"}
Essay Type: ${essayType || "Not specified"}

Assignment Instructions:
${instructions}
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
                model: targetModel,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                ],
                temperature: 0.3,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Luna] OpenRouter error:", response.status, errorText);
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

        // Parse the JSON response from Luna
        const parsed = JSON.parse(content);

        return NextResponse.json({
            analysis: parsed.analysis || "",
            essayTopic: parsed.essayTopic || "",
            essayType: parsed.essayType || "",
            scope: parsed.scope || "",
            structure: parsed.structure || "",
        });
    } catch (error) {
        console.error("[Luna] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during analysis" },
            { status: 500 }
        );
    }
}
