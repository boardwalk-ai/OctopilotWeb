import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OCTO_APP_CONTEXT } from "@/lib/octoContext";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OctoRequestBody {
    question: string;
    currentPage: string;
    runtimeContext: string;
}

function parseJsonContent(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    const withoutFence = trimmed.startsWith("```")
        ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
        : trimmed;
    return JSON.parse(withoutFence) as Record<string, unknown>;
}

function buildUserPrompt(question: string, runtimeContext: string): string {
    return `You are Octo, the virtual assistant for Octopilot AI. Your task is to help user navigate, or answer user's questions.
STRICTLY only answer questions related to Octopilot AI.

Respond in user's language. If user asked in English, respond in English. If user asked in other language, respond in that language.

User's question: ${question}

Context:
${OCTO_APP_CONTEXT}

Runtime state:
${runtimeContext}`;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) {
            return auth.response;
        }

        const body = await request.json();
        const { question, runtimeContext } = body as OctoRequestBody;

        if (!question) {
            return NextResponse.json(
                { error: "Missing required field: question" },
                { status: 400 }
            );
        }
        const { apiKey, model } = await getOpenRouterConfig("secondary");

        const agentFile = path.resolve(process.cwd(), "agents/octo.md");
        const systemPrompt = fs.readFileSync(agentFile, "utf-8");

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
                    { role: "user", content: buildUserPrompt(question, runtimeContext) },
                ],
                temperature: 0.35,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Octo] OpenRouter error:", response.status, errorText);
            return NextResponse.json(
                { error: `OpenRouter API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const content = String(data.choices?.[0]?.message?.content || "").trim();

        if (!content) {
            return NextResponse.json(
                { error: "No response content from model" },
                { status: 500 }
            );
        }

        const parsed = parseJsonContent(content);
        const answer = String(parsed.answer || "").trim();

        if (!answer) {
            return NextResponse.json(
                { error: "No answer field returned from model" },
                { status: 500 }
            );
        }

        return NextResponse.json({ answer });
    } catch (error) {
        console.error("[Octo] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during Octo assist" },
            { status: 500 }
        );
    }
}
