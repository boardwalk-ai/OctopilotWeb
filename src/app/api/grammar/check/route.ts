// POST /api/grammar/check
//
// Proxy for LanguageTool grammar/spelling check.
// Keeps the real endpoint server-side so:
//   - No CORS issues in the browser
//   - Rate-limit budget is shared via server (easier to cache later)
//   - Self-hosting: change LANGUAGETOOL_URL env var, zero frontend changes
//
// Body (JSON): { text: string; language?: string }
// Response:    LanguageTool /v2/check response (JSON)

import { NextRequest, NextResponse } from "next/server";

// Override with env var when self-hosting:
//   LANGUAGETOOL_URL=http://YOUR_VPS_IP:8010
const LT_BASE = process.env.LANGUAGETOOL_URL ?? "https://api.languagetool.org";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
    let text = "";
    let language = "en-US";
    try {
        const body = (await request.json()) as { text?: string; language?: string };
        text = (body.text ?? "").trim().slice(0, 6000);
        language = body.language ?? "en-US";
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (text.length < 4) {
        return NextResponse.json({ matches: [] });
    }

    const params = new URLSearchParams({
        text,
        language,
        disabledRules: "WHITESPACE_RULE,EN_QUOTES,COMMA_PARENTHESIS_WHITESPACE,SENTENCE_WHITESPACE",
    });

    try {
        const res = await fetch(`${LT_BASE}/v2/check`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            body: params.toString(),
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: `LanguageTool returned ${res.status}` },
                { status: 502 },
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Grammar check failed." },
            { status: 502 },
        );
    }
}
