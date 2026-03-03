import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const urlParam = request.nextUrl.searchParams.get("url");

        if (!urlParam) {
            return NextResponse.json(
                { error: "Missing required 'url' query parameter" },
                { status: 400 }
            );
        }

        const externalApiUrl = `https://api.octopilotai.com/api/scrape?url=${encodeURIComponent(urlParam)}`;

        const response = await fetch(externalApiUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json",
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Scraper Proxy] External API Error:", response.status, errorText);
            return NextResponse.json(
                { error: `External API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("[Scraper Proxy] Internal Error:", error);
        return NextResponse.json(
            { error: "Internal server error during scraping" },
            { status: 500 }
        );
    }
}
