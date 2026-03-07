import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getOpenRouterConfig } from "@/server/backendConfig";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type SuMode = "more_ideas" | "ask" | "intext" | "summary";

type SuInput = Record<string, unknown>;

interface SuRequestBody {
    mode: SuMode;
    input: SuInput;
}

function parseJsonContent(raw: string): unknown {
    const trimmed = raw.trim();
    const withoutFence = trimmed.startsWith("```")
        ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
        : trimmed;
    return JSON.parse(withoutFence);
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function buildTaskPrompt(mode: SuMode, input: SuInput): string {
    if (mode === "more_ideas") {
        return `Task: MORE IDEAS\nEssay Topic: ${asString(input.essayTopic)}\nSection Type: ${asString(input.sectionType)}\nSection Title: ${asString(input.sectionTitle)}\nCitation Style: ${asString(input.citationStyle)}\nCurrent Draft:\n${asString(input.currentDraft)}`;
    }
    if (mode === "ask") {
        return `Task: ASK\nEssay Topic: ${asString(input.essayTopic)}\nSection Type: ${asString(input.sectionType)}\nSection Title: ${asString(input.sectionTitle)}\nQuestion: ${asString(input.question)}\nCurrent Draft:\n${asString(input.currentDraft)}`;
    }
    if (mode === "intext") {
        const sources = Array.isArray(input.sources) ? input.sources : [];
        return `Task: INTEXT\nCitation Style: ${asString(input.citationStyle)}\nSources:\n${JSON.stringify(sources, null, 2)}`;
    }

    const outlines = Array.isArray(input.outlineTitles) ? input.outlineTitles : [];
    return `Task: SUMMARY\nEssay Title: ${asString(input.essayTitle)}\nOutline Titles:\n${JSON.stringify(outlines, null, 2)}\nWritten Essay:\n${asString(input.writtenEssay)}`;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { mode, input } = body as SuRequestBody;

        if (!mode || !input) {
            return NextResponse.json(
                { error: "Missing required fields: mode, input" },
                { status: 400 }
            );
        }
        const { apiKey, model } = await getOpenRouterConfig("secondary");

        const agentFile = path.resolve(process.cwd(), "agents/su.md");
        const SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");

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
                    { role: "user", content: buildTaskPrompt(mode, input) },
                ],
                temperature: mode === "ask" ? 0.4 : 0.5,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Su] OpenRouter error:", response.status, errorText);
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

        const parsed = parseJsonContent(content);
        const parsedObj = typeof parsed === "object" && parsed !== null
            ? parsed as Record<string, unknown>
            : {};

        if (mode === "more_ideas") {
            const rawList = Array.isArray(parsedObj.bullets)
                ? parsedObj.bullets
                : (Array.isArray(parsedObj.lines) ? parsedObj.lines : []);
            const bullets = rawList
                .map((v: unknown) => String(v).trim())
                .filter(Boolean);
            return NextResponse.json({ bullets });
        }

        if (mode === "ask") {
            const answer = String(parsedObj.answer || "").trim();
            return NextResponse.json({ answer });
        }

        const normalized = (Array.isArray(parsedObj.inTextCitation) ? parsedObj.inTextCitation : [])
            .map((entry: unknown) => {
                const record = typeof entry === "object" && entry !== null
                    ? entry as Record<string, unknown>
                    : {};
                return {
                    index: Number(record.index),
                    citation: String(record.citation || "").trim(),
                };
            })
            .filter((entry: { index: number; citation: string }) => Number.isFinite(entry.index) && entry.index >= 0 && Boolean(entry.citation));

        if (mode === "intext") {
            return NextResponse.json({ inTextCitation: normalized });
        }

        const done = (Array.isArray(parsedObj.done) ? parsedObj.done : [])
            .map((v: unknown) => String(v).trim())
            .filter(Boolean);
        const suggestions = (Array.isArray(parsedObj.suggestions) ? parsedObj.suggestions : [])
            .map((v: unknown) => String(v).trim())
            .filter(Boolean);

        return NextResponse.json({ done, suggestions });
    } catch (error) {
        console.error("[Su] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during Su assist" },
            { status: 500 }
        );
    }
}
