import { NextRequest, NextResponse } from "next/server";
import { getHumanizerApiKey } from "@/server/backendConfig";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Missing required document id" },
                { status: 400 }
            );
        }
        const apiKey = await getHumanizerApiKey("undetectable");

        const response = await fetch("https://api.undetectable.ai/document", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify({ id }),
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Undetectable AI document error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
