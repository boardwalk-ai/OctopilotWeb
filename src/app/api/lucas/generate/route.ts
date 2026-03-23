import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OrganizerState, CompactedSource } from "@/services/OrganizerService";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) {
            return auth.response;
        }

        const body = await request.json();
        const { organizerState } = body as { organizerState: OrganizerState };

        if (!organizerState) {
            return NextResponse.json(
                { error: "Missing required field: organizerState" },
                { status: 400 }
            );
        }
        const { apiKey, model } = await getOpenRouterConfig("primary");

        // Read Lucas's system prompt
        const agentFile = path.resolve(process.cwd(), "agents/lucas.md");
        const SYSTEM_PROMPT = fs.readFileSync(agentFile, "utf-8");

        // Format the sources securely
        const sourcesString = organizerState.compactedSources.map((s: CompactedSource, idx: number) => {
            return `source ${idx + 1}:
kind: ${s.kind || "unknown"}
title: ${s.title || ""}
Publisher: ${s.publisher || ""}
Author: ${s.author || ""}
Year: ${s.publishedYear || ""}
Content(compacted): ${s.compactedContent || ""}`;
        }).join("\n\n");

        // Format the outlines
        const outlinesString = organizerState.selectedOutlines.map((o: OrganizerState["selectedOutlines"][number], idx: number) => {
            return `Outline ${idx + 1} (${o.type}): ${o.title} - ${o.description}`;
        }).join("\n");

        const writingStyleProfile = organizerState.imperfectModeEnabled ? organizerState.writingStyleProfile : null;
        const writingStyleBlock = writingStyleProfile
            ? `
Imperfect Mode: ON
Follow this Zuly writing profile while drafting. Mimic the user's natural style without making the writing unreadable.
Writing Style: ${writingStyleProfile.writing_style || "Not available"}
Grammar Usage Style: ${writingStyleProfile.grammar_usage_style || "Not available"}
Vocabulary Usage Style and Level: ${writingStyleProfile.vocabulary_usage_style_and_level || "Not available"}
Common Mistakes to imitate lightly: ${(writingStyleProfile.common_mistakes || []).join("; ") || "None listed"}
`
            : `
Imperfect Mode: OFF
Ignore any user-style imitation instructions and write in the normal Octopilot academic standard.
`;

        // Construct user prompt matching the agent's expected inputs
        const userMessage = `
Word Count: ${organizerState.wordCount}
Essay Topic: ${organizerState.essayTopic}
Essay Type: ${organizerState.essayType}
Writing Tone: ${organizerState.tone}
Citation Format: ${organizerState.citationStyle}
Keywords: ${organizerState.keywords || "None"}
${writingStyleBlock}

Outlines (${organizerState.selectedOutlines.length} paragraphs):
${outlinesString}

Sources:
${sourcesString}
`.trim();

        // Use standard streaming fetch
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
                temperature: 0.4,
                stream: true, // Request streaming from OpenRouter
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Lucas] OpenRouter error:", response.status, errorText);
            return NextResponse.json(
                { error: `OpenRouter API error: ${response.status}` },
                { status: response.status }
            );
        }

        // Return the ReadableStream directly to the client
        return new Response(response.body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });

    } catch (error) {
        console.error("[Lucas] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during generation" },
            { status: 500 }
        );
    }
}
