import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/* ── Exported type (used by FormatterToolView + HomeView) ─────────────────── */
export interface ParsedDocumentResult {
  detectedStyle: "mla" | "apa" | "chicago" | "ieee" | "harvard" | "unknown";
  essay: string;
  bibliography: string;
  finalEssayTitle: string;
  studentName: string;
  instructorName: string;
  institutionName: string;
  courseInfo: string;
  subjectCode: string;
  essayDate: string;
  parsedBy: "ai";
}

/* ── Prompt ───────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an expert academic document parser.
Read the document the user provides and extract all metadata.
Return ONLY valid JSON — no markdown fences, no extra text.

Required JSON schema:
{
  "detectedStyle": "mla" | "apa" | "chicago" | "ieee" | "harvard" | "unknown",
  "finalEssayTitle": string,
  "studentName": string,
  "instructorName": string,
  "institutionName": string,
  "courseInfo": string,
  "subjectCode": string,
  "essayDate": string,
  "essay": string,
  "bibliography": string
}

Rules:
- detectedStyle: infer from citation style used.
  MLA → Works Cited, (Author page#). APA → References, (Author, Year).
  Chicago → footnotes + Bibliography. IEEE → [1][2] numbered refs. Harvard → (Author Year) British style.
- essay: main body text ONLY — exclude the header block (name/instructor/course/date/title lines at the top) and the bibliography/references section.
- bibliography: the full references/works cited/bibliography section including its heading.
- courseInfo: course name (e.g. "English Composition II")
- subjectCode: course code (e.g. "ENG 102") if present, else empty string
- All fields: empty string "" if not found in the document.
- Do NOT truncate essay or bibliography.`;

function stripFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

/* ── Route handler ───────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as { text?: string };
    const text = (body.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "No text provided." }, { status: 400 });
    }

    // Truncate to ~14k chars to stay within context limits
    const input = text.length > 14000 ? text.slice(0, 14000) + "\n...[truncated]" : text;

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://octopilotai.com",
        "X-Title": "OctoPilot Formatter Parser",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: input },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI parse error ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripFence(raw)) as Partial<ParsedDocumentResult>;

    const result: ParsedDocumentResult = {
      detectedStyle: (["mla", "apa", "chicago", "ieee", "harvard"].includes(
        parsed.detectedStyle ?? "",
      )
        ? parsed.detectedStyle
        : "unknown") as ParsedDocumentResult["detectedStyle"],
      essay:          String(parsed.essay ?? text),
      bibliography:   String(parsed.bibliography ?? ""),
      finalEssayTitle: String(parsed.finalEssayTitle ?? ""),
      studentName:    String(parsed.studentName ?? ""),
      instructorName: String(parsed.instructorName ?? ""),
      institutionName: String(parsed.institutionName ?? ""),
      courseInfo:     String(parsed.courseInfo ?? ""),
      subjectCode:    String(parsed.subjectCode ?? ""),
      essayDate:      String(parsed.essayDate ?? ""),
      parsedBy: "ai",
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[formatter/parse]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed." },
      { status: 500 },
    );
  }
}
