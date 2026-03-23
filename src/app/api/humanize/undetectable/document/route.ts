import { NextRequest, NextResponse } from "next/server";
import { getHumanizerApiKey } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedRequest(request);
        if ("response" in auth) {
            return auth.response;
        }

        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Missing required document id" },
                { status: 400 }
            );
        }
        const apiKey = await getHumanizerApiKey("undetectable");

        const response = await fetch("https://humanize.undetectable.ai/document", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: apiKey,
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
