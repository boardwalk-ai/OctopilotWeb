import { NextResponse } from "next/server";

export async function GET() {
    try {
        const response = await fetch(
            "https://api.octopilotai.com/api/v1/admin/settings",
            { method: "GET", headers: { "Accept": "application/json" } }
        );

        if (!response.ok) {
            return NextResponse.json(
                { error: `Backend error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("[Settings Proxy] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch settings" },
            { status: 500 }
        );
    }
}
