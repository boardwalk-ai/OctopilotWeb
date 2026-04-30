import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import type { RubricCriterion } from "@/services/OrganizerService";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are an academic essay grader. You will receive a rubric with grading criteria and a student essay.
Evaluate the essay against each rubric criterion and return ONLY valid JSON with no markdown, no explanation, no extra text.

Respond in exactly this format:
{
  "criteria": [
    {
      "name": "Criterion name (must match the input criterion name exactly)",
      "score": 18,
      "maxPoints": 20,
      "feedback": "One or two sentences of specific, actionable feedback for this criterion."
    }
  ],
  "overallPercentage": 85,
  "summary": "One or two sentences summarising the essay's overall strengths and main area to improve."
}

Rules:
- Evaluate every criterion provided — do not skip any.
- "name" must match the input criterion name exactly.
- "score" is your assessed score for the criterion.
- "maxPoints" is the criterion's maximum possible points (use null if no points were given).
- If no points were specified for a criterion, estimate a 0–10 scale score.
- "overallPercentage" is a single integer (0–100) representing overall essay quality across all criteria.
- Be fair, specific, and academically constructive in feedback.`;

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) return auth.response;

        const body = await request.json() as {
            essay: string;
            criteria: RubricCriterion[];
        };

        const essay = typeof body.essay === "string" ? body.essay.trim() : "";
        const criteria = Array.isArray(body.criteria) ? body.criteria : [];

        if (!essay) {
            return NextResponse.json({ error: "Essay text is required" }, { status: 400 });
        }
        if (criteria.length === 0) {
            return NextResponse.json({ error: "At least one rubric criterion is required" }, { status: 400 });
        }

        const { apiKey, model } = await getOpenRouterConfig("secondary");

        const criteriaText = criteria.map((c, i) => {
            const pts = c.points != null ? ` (${c.points} pts)` : "";
            return `${i + 1}. ${c.name}${pts}: ${c.description}`;
        }).join("\n");

        const userContent = `Rubric Criteria:\n${criteriaText}\n\n---\n\nEssay to Grade:\n${essay}`;

        const response = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "HTTP-Referer": "https://octopilotai.com",
                "X-Title": "OctoPilot AI",
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userContent },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => "");
            console.error("[RubricGrader] OpenRouter error:", response.status, err);
            return NextResponse.json({ error: `OpenRouter API error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            return NextResponse.json({ error: "No response from model" }, { status: 500 });
        }

        const parsed = JSON.parse(content as string);
        return NextResponse.json({
            criteria: parsed.criteria ?? [],
            overallPercentage: parsed.overallPercentage ?? 0,
            summary: parsed.summary ?? "",
        });
    } catch (error) {
        console.error("[RubricGrader] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
