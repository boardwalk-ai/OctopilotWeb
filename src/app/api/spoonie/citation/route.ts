import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface SpoonieRequestBody {
    task?: string;
    input: Record<string, unknown>;
    apiKey: string;
    model: string;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function stripCodeFence(raw: string): string {
    const text = (raw || "").trim();
    if (!text.startsWith("```")) return text;
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseJsonLoose(raw: string): Record<string, unknown> {
    const clean = stripCodeFence(raw);
    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { task, input, apiKey, model } = body as SpoonieRequestBody;

        if (!input || !apiKey || !model) {
            return NextResponse.json(
                { error: "Missing required fields: input, apiKey, model" },
                { status: 400 }
            );
        }

        const agentFile = path.resolve(process.cwd(), "agents/spoonie.md");
        const SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");
        const activeTask = task === "OCR_EXTRACT" ? "OCR_EXTRACT" : "CITATION_PREVIEW";
        const userMessage = activeTask === "OCR_EXTRACT"
            ? `Task: OCR_EXTRACT\nInput:\n${JSON.stringify({
                imageDataUrl: asString(input.imageDataUrl),
            }, null, 2)}`
            : `Task: CITATION_PREVIEW\nInput:\n${JSON.stringify(input, null, 2)}`;

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
            console.error("[Spoonie] OpenRouter error:", response.status, errorText);
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

        const parsed = parseJsonLoose(String(content));
        if (activeTask === "OCR_EXTRACT") {
            const extractedText = String(parsed.extracted_text || "").trim();
            if (!extractedText) {
                return NextResponse.json(
                    { error: "Model returned empty OCR output" },
                    { status: 500 }
                );
            }
            return NextResponse.json({ extracted_text: extractedText });
        }

        const citation = String(parsed.citation || "").trim();
        if (!citation) {
            return NextResponse.json(
                { error: "Model returned empty citation output" },
                { status: 500 }
            );
        }

        return NextResponse.json({ citation });
    } catch (error) {
        console.error("[Spoonie] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during Spoonie task" },
            { status: 500 }
        );
    }
}
