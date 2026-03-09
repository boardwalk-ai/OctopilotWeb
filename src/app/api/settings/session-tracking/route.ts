import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/server/backendConfig";

export async function GET() {
    try {
        const response = await fetch(
            `${getApiBaseUrl()}/api/v1/settings/session-tracking`,
            { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" }
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
        console.error("[SessionTracking Proxy] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch session tracking setting" },
            { status: 500 }
        );
    }
}
