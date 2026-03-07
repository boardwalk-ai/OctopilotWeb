import { NextRequest, NextResponse } from "next/server";
import { getHumanizerApiKey } from "@/server/backendConfig";
const UNDETECTABLE_API_URL = "https://api.undetectable.ai/submit";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { content, readability, purpose, strength } = body;

        if (!content || !readability || !purpose || !strength) {
            return NextResponse.json(
                { error: "Missing required fields for Undetectable AI: content, readability, purpose, strength" },
                { status: 400 }
            );
        }
        const apiKey = await getHumanizerApiKey("undetectable");

        const response = await fetch(UNDETECTABLE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify({
                content,
                readability,
                purpose,
                strength
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Undetectable] API error:", response.status, errorText);
            return NextResponse.json(
                { error: `Undetectable AI error: ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        // The API returns { status: 'success', documentId: '...' }
        // We need to fetch the document immediately or return the ID
        return NextResponse.json(data);

    } catch (error) {
        console.error("[Undetectable] Error:", error);
        return NextResponse.json(
            { error: "Internal server error during humanization" },
            { status: 500 }
        );
    }
}
