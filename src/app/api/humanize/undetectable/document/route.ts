import { NextRequest, NextResponse } from "next/server";

const UNDETECTABLE_API_KEY = "9019253d-a30c-49a3-aeae-9a5f18e209fd";

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

        const response = await fetch("https://api.undetectable.ai/document", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": UNDETECTABLE_API_KEY,
            },
            body: JSON.stringify({ id }),
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Undetectable AI document error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
