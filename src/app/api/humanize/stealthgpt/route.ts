import { NextRequest, NextResponse } from "next/server";

const STEALTHGPT_API_KEY = "4eb8b6e952b182138bdfd32352bf0ae9166b0147e8bbae3cf936fc39ca99d186";
const STEALTHGPT_API_URL = "https://www.stealthgpt.ai/api/stealthify";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, rephrase } = body;

        if (!prompt || rephrase === undefined) {
            return NextResponse.json(
                { error: "Missing required fields for StealthGPT: prompt, rephrase (boolean)" },
                { status: 400 }
            );
        }

        const response = await fetch(STEALTHGPT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-token": STEALTHGPT_API_KEY,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[StealthGPT] API error:", response.status, errorText);
            return NextResponse.json(
                { error: `StealthGPT API error: ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("[StealthGPT] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during humanization" },
            { status: 500 }
        );
    }
}
