import { NextRequest, NextResponse } from "next/server";
import { getHumanizerApiKey } from "@/server/backendConfig";
const STEALTHGPT_API_URL = "https://www.stealthgpt.ai/api/stealthify";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, rephrase, educationLevel, strength, detector } = body;

        if (!prompt || rephrase === undefined) {
            return NextResponse.json(
                { error: "Missing required fields for StealthGPT: prompt, rephrase (boolean)" },
                { status: 400 }
            );
        }
        const apiKey = await getHumanizerApiKey("stealthgpt");

        const response = await fetch(STEALTHGPT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-token": apiKey,
            },
            body: JSON.stringify({
                prompt,
                rephrase,
                tone:
                    educationLevel === "High School"
                        ? "HighSchool"
                        : educationLevel === "PHD"
                            ? "PhD"
                            : educationLevel || "Standard",
                mode: strength || "Medium",
                detector: detector || "GPTZero",
            }),
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
