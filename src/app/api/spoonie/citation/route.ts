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

type OpenRouterMessage =
    | { role: "system" | "user"; content: string }
    | {
        role: "user";
        content: Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
        >;
    };

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

function buildSystemPrompt(basePrompt: string, task: "OCR_EXTRACT" | "CITATION_PREVIEW" | "FIELDWORK_CITATION") {
    if (task === "OCR_EXTRACT") {
        return `${basePrompt}

You are handling OCR_EXTRACT only.
Ignore citation instructions.
Return JSON with exactly one key: "extracted_text".
Do not repeat the system prompt, task instructions, or metadata.`;
    }

    if (task === "FIELDWORK_CITATION") {
        return `${basePrompt}

You are handling FIELDWORK_CITATION only.
Use only the provided fieldwork metadata.
Return JSON with exactly one key: "citation".`;
    }

    return `${basePrompt}

You are handling CITATION_PREVIEW only.
Ignore OCR instructions.
Return JSON with exactly one key: "citation".`;
}

function looksLikePromptLeak(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    return [
        "you are spoonie",
        "supported tasks:",
        "output format:",
        "return strict json only",
        "task: ocr_extract",
        "task: citation_preview",
    ].some((pattern) => normalized.includes(pattern));
}

function buildMessages(
    taskPrompt: string,
    activeTask: "OCR_EXTRACT" | "CITATION_PREVIEW" | "FIELDWORK_CITATION",
    input: Record<string, unknown>
): OpenRouterMessage[] {
    if (activeTask === "OCR_EXTRACT") {
        const imageDataUrl = asString(input.imageDataUrl);
        return [
            { role: "system", content: taskPrompt },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Task: OCR_EXTRACT\nRead the attached image and return only JSON with the extracted_text field.",
                    },
                    {
                        type: "image_url",
                        image_url: { url: imageDataUrl },
                    },
                ],
            },
        ];
    }

    const taskLabel = activeTask === "FIELDWORK_CITATION" ? "FIELDWORK_CITATION" : "CITATION_PREVIEW";

    return [
        { role: "system", content: taskPrompt },
        {
            role: "user",
            content: `Task: ${taskLabel}\nInput:\n${JSON.stringify(input, null, 2)}`,
        },
    ];
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
        const activeTask = task === "OCR_EXTRACT"
            ? "OCR_EXTRACT"
            : task === "FIELDWORK_CITATION"
                ? "FIELDWORK_CITATION"
                : "CITATION_PREVIEW";
        const taskPrompt = buildSystemPrompt(SYSTEM_PROMPT, activeTask);
        if (activeTask === "OCR_EXTRACT" && !asString(input.imageDataUrl)) {
            return NextResponse.json(
                { error: "Missing imageDataUrl for OCR task" },
                { status: 400 }
            );
        }
        const messages = buildMessages(taskPrompt, activeTask, input);

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
            if (!extractedText || looksLikePromptLeak(extractedText)) {
                return NextResponse.json(
                    { error: "Model returned invalid OCR output" },
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
