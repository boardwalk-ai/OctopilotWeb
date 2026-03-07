import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

type JasmineResult = {
    website_URL: string;
    Title: string;
    Author: string;
    "Published Year": string;
    Publisher: string;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFence(raw: string): string {
    const text = (raw || "").trim();
    if (!text.startsWith("```")) return text;
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function tryParseJsonLoose(content: string): unknown {
    const clean = stripCodeFence(content);
    try {
        return JSON.parse(clean);
    } catch {
        // Fallback: extract first JSON array block
        const arrStart = clean.indexOf("[");
        const arrEnd = clean.lastIndexOf("]");
        if (arrStart >= 0 && arrEnd > arrStart) {
            const maybeArray = clean.slice(arrStart, arrEnd + 1);
            try {
                return JSON.parse(maybeArray);
            } catch {
                // noop
            }
        }

        // Fallback: extract first JSON object block
        const objStart = clean.indexOf("{");
        const objEnd = clean.lastIndexOf("}");
        if (objStart >= 0 && objEnd > objStart) {
            const maybeObj = clean.slice(objStart, objEnd + 1);
            return JSON.parse(maybeObj);
        }
        throw new Error("Could not parse model response as JSON");
    }
}

function normalizeResults(parsed: unknown, targetCount: number): JasmineResult[] {
    const maybeObject = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
    const list =
        Array.isArray(parsed) ? parsed :
        (maybeObject && Array.isArray(maybeObject.results) ? maybeObject.results :
            (maybeObject ? Object.values(maybeObject).find(Array.isArray) || [] : []));

    if (!Array.isArray(list)) return [];

    const normalized = list
        .map((entry) => {
            const row = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
            return {
                website_URL: String(row.website_URL || row.url || row.link || "").trim(),
                Title: String(row.Title || row.title || "").trim(),
                Author: String(row.Author || row.author || "").trim(),
                "Published Year": String(row["Published Year"] || row.publishedYear || row.year || "").trim(),
                Publisher: String(row.Publisher || row.publisher || row.source || "").trim(),
            } satisfies JasmineResult;
        })
        .filter((row) => /^https?:\/\//i.test(row.website_URL))
        .filter((row) => !/\.pdf(?:$|\?)/i.test(row.website_URL));

    const deduped: JasmineResult[] = [];
    const seen = new Set<string>();
    for (const item of normalized) {
        const key = item.website_URL.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= targetCount) break;
    }

    return deduped;
}

async function callOpenRouterWithRetry(payload: Record<string, unknown>, apiKey: string): Promise<Response> {
    let lastResponse: Response | null = null;
    let lastError: unknown = null;
    let allowNoFormatFallback = true;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const bodyPayload = { ...payload };
            const response = await fetch(OPENROUTER_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": "https://octopilotai.com",
                    "X-Title": "OctoPilot AI",
                },
                body: JSON.stringify(bodyPayload),
            });

            lastResponse = response;
            if (response.ok) return response;

            if (allowNoFormatFallback && response.status === 400 && "response_format" in payload) {
                allowNoFormatFallback = false;
                delete payload.response_format;
                continue;
            }
            if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) return response;
        } catch (error) {
            lastError = error;
            if (attempt === MAX_RETRIES) break;
        }

        await sleep(400 * (attempt + 1));
    }

    if (lastResponse) return lastResponse;
    throw lastError instanceof Error ? lastError : new Error("OpenRouter request failed");
}

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
        const safeTargetCount = Math.max(1, Math.min(20, Number(targetCount) || 1));

        // Read Alvin's system prompt from the agent file
        const agentFile = path.resolve(process.cwd(), "agents/jasmine.md");
        const SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");

        const userMessage = `
Number of links needed: ${safeTargetCount}
Essay Topic: ${essayTopic}

Supporting Outlines:
${JSON.stringify(outlines, null, 2)}
`.trim();

        const payload = {
            model,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
        };
        const response = await callOpenRouterWithRetry(payload, apiKey);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Alvin] OpenRouter error:", response.status, errorText);
            fs.writeFileSync("/tmp/jasmine_error.log", `Status: ${response.status}\nError: ${errorText}\nPayload: ${JSON.stringify(payload, null, 2)}`);
            return NextResponse.json(
                { error: `OpenRouter API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        console.log("[Alvin] Raw model response:", content?.slice(0, 300));

        if (!content) {
            return NextResponse.json(
                { error: "No response content from model" },
                { status: 500 }
            );
        }

        const parsed = tryParseJsonLoose(content);
        const results = normalizeResults(parsed, safeTargetCount);
        if (results.length === 0) {
            return NextResponse.json(
                { error: "Alvin returned empty or invalid source list. Please retry." },
                { status: 502 }
            );
        }
        return NextResponse.json(results);

    } catch (error) {
        console.error("[Alvin] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during search" },
            { status: 500 }
        );
    }
}
