import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Gemini 2.0 Flash for the AI fallback parse
const GEMINI_FLASH_MODEL = "google/gemini-2.0-flash-001";

/* ── Types ───────────────────────────────────────────────────────────────── */
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
  parsedBy: "heuristic" | "ai";
}

/* ── Heuristic helpers ───────────────────────────────────────────────────── */

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());
}

/** Detect which citation style the document uses. */
function detectStyle(text: string): ParsedDocumentResult["detectedStyle"] {
  // IEEE: numeric refs [1], [2] in body and References section
  if (/\[\d+\]/.test(text) && /^references\s*$/im.test(text)) return "ieee";

  // MLA: Works Cited section
  if (/^works cited\s*$/im.test(text)) return "mla";

  // Chicago: Bibliography + footnotes (superscript numbers in text)
  if (/^bibliography\s*$/im.test(text)) return "chicago";

  // APA: References section + author-date in-text
  if (/^references\s*$/im.test(text) && /\(\w[\w\s,]+,\s+\d{4}[a-z]?\)/.test(text)) return "apa";

  // Harvard: author-year style (similar to APA but British)
  if (/^references?\s*$/im.test(text) || /^reference list\s*$/im.test(text)) return "harvard";

  // Weaker MLA heuristic: first-line surname pattern or no abstract
  if (/^works\s+cited/im.test(text)) return "mla";

  return "unknown";
}

/** Find the start of the bibliography/references block. */
function findBibStart(lines: string[]): number {
  const markers = [
    /^works cited\s*$/i,
    /^references\s*$/i,
    /^bibliography\s*$/i,
    /^reference list\s*$/i,
    /^works\s+cited$/i,
  ];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (markers.some((m) => m.test(lines[i].trim()))) return i;
  }
  return -1;
}

/** Split raw text into essay body + bibliography. */
function splitEssayBiblio(text: string): { essay: string; bibliography: string } {
  const lines = normalizeLines(text);
  const bibStart = findBibStart(lines);
  if (bibStart === -1) return { essay: text.trim(), bibliography: "" };
  return {
    essay: lines.slice(0, bibStart).join("\n").trim(),
    bibliography: lines.slice(bibStart).join("\n").trim(),
  };
}

/** Extract MLA header: Name / Instructor / Course / Date then Title. */
function extractMlaHeader(lines: string[]): Partial<ParsedDocumentResult> {
  const result: Partial<ParsedDocumentResult> = {};
  // Find first non-empty line index
  const nonEmpty = lines.map((l, i) => ({ l: l.trim(), i })).filter((x) => x.l.length > 0);
  if (nonEmpty.length < 4) return result;

  // MLA header: line 0=StudentName, 1=Instructor, 2=Course, 3=Date, then blank then Title
  result.studentName     = nonEmpty[0]?.l ?? "";
  result.instructorName  = nonEmpty[1]?.l ?? "";
  result.courseInfo      = nonEmpty[2]?.l ?? "";
  result.essayDate       = nonEmpty[3]?.l ?? "";

  // Title is the next non-empty line after header (idx 4+), typically centered / short
  const titleCandidate = nonEmpty[4]?.l ?? "";
  if (titleCandidate && titleCandidate.length < 120) {
    result.finalEssayTitle = titleCandidate;
  }
  return result;
}

/** Extract APA header: Running Head, title, author, institution. */
function extractApaHeader(lines: string[]): Partial<ParsedDocumentResult> {
  const result: Partial<ParsedDocumentResult> = {};
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);

  // Running head on line 0: "Running Head: TITLE" or just the title
  const rhMatch = nonEmpty[0]?.match(/running\s*head\s*:\s*(.+)/i);
  if (rhMatch) result.finalEssayTitle = rhMatch[1].trim();

  // Find title (first reasonably short line that's not "Running Head:")
  for (const line of nonEmpty.slice(0, 8)) {
    if (!line.match(/running\s*head/i) && line.length < 120 && line.length > 3) {
      if (!result.finalEssayTitle) result.finalEssayTitle = line;
      break;
    }
  }

  // Student name often follows title
  for (let i = 1; i < Math.min(nonEmpty.length, 10); i++) {
    const line = nonEmpty[i];
    if (!result.studentName && /^[A-Z][a-z]+ [A-Z]/.test(line) && line.length < 60) {
      result.studentName = line;
    }
    if (!result.institutionName && /university|college|institute|school/i.test(line)) {
      result.institutionName = line;
    }
    if (!result.courseInfo && /\d{3}/.test(line) && line.length < 60) {
      result.courseInfo = line;
    }
    if (!result.essayDate && /\b(20|19)\d{2}\b/.test(line) && line.length < 40) {
      result.essayDate = line;
    }
  }
  return result;
}

/** Generic field scan: look for "FieldName: Value" patterns. */
function genericFieldScan(lines: string[]): Partial<ParsedDocumentResult> {
  const result: Partial<ParsedDocumentResult> = {};
  const map: Record<string, keyof ParsedDocumentResult> = {
    "student name": "studentName",
    author: "studentName",
    "instructor name": "instructorName",
    instructor: "instructorName",
    professor: "instructorName",
    institution: "institutionName",
    university: "institutionName",
    college: "institutionName",
    course: "courseInfo",
    "course name": "courseInfo",
    "subject name": "courseInfo",
    "subject code": "subjectCode",
    "course code": "subjectCode",
    date: "essayDate",
    title: "finalEssayTitle",
  };

  for (const line of lines.slice(0, 20)) {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    for (const [pattern, field] of Object.entries(map)) {
      if (key.includes(pattern) && !(result[field] as string)) {
        (result as Record<string, string>)[field] = val;
      }
    }
  }
  return result;
}

/** Primary heuristic parser. Returns null if confidence too low. */
function heuristicParse(text: string): ParsedDocumentResult | null {
  if (!text || text.trim().length < 50) return null;

  const detectedStyle = detectStyle(text);
  const lines = normalizeLines(text);
  const { essay, bibliography } = splitEssayBiblio(text);

  // Only proceed with reasonable confidence
  if (detectedStyle === "unknown" && !bibliography) return null;

  const essayLines = normalizeLines(essay);

  let headerFields: Partial<ParsedDocumentResult> = {};
  if (detectedStyle === "mla") {
    headerFields = extractMlaHeader(essayLines);
  } else if (detectedStyle === "apa" || detectedStyle === "harvard") {
    headerFields = extractApaHeader(essayLines);
  }
  // Fill any blanks with generic scan
  const generic = genericFieldScan(lines);
  for (const [k, v] of Object.entries(generic)) {
    if (!(headerFields as Record<string, string>)[k]) {
      (headerFields as Record<string, string>)[k] = v as string;
    }
  }

  // Remove header block from essay body for MLA
  let cleanEssay = essay;
  if (detectedStyle === "mla" && headerFields.studentName) {
    // Strip the 4-line header + title from the essay
    const headerEnd = essayLines.findIndex((l, i) => {
      if (i < 4) return false;
      const nonEmpty = essayLines.slice(0, i).filter(Boolean);
      return nonEmpty.length >= 4;
    });
    if (headerEnd > 0) {
      // Find where the actual body starts (after the title)
      const bodyStart = essayLines.findIndex((l, i) => i > headerEnd && l.trim().length > 0);
      if (bodyStart > 0) {
        cleanEssay = essayLines.slice(bodyStart).join("\n").trim();
      }
    }
  }

  return {
    detectedStyle,
    essay: cleanEssay,
    bibliography,
    finalEssayTitle: headerFields.finalEssayTitle ?? "",
    studentName:     headerFields.studentName ?? "",
    instructorName:  headerFields.instructorName ?? "",
    institutionName: headerFields.institutionName ?? "",
    courseInfo:      headerFields.courseInfo ?? "",
    subjectCode:     headerFields.subjectCode ?? "",
    essayDate:       headerFields.essayDate ?? "",
    parsedBy: "heuristic",
  };
}

/* ── AI fallback (Gemini 2.0 Flash via OpenRouter) ───────────────────────── */

const AI_SYSTEM_PROMPT = `You are an expert academic document parser.
Extract structured metadata from the academic document the user provides.
Return ONLY valid JSON — no markdown fences, no extra commentary.

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
- detectedStyle: infer from references style, in-text citation style, and formatting.
  MLA → Works Cited, (Author page). APA → References, (Author, Year). Chicago → footnotes / Bibliography.
  IEEE → numbered [1][2] references. Harvard → (Author Year) British style.
- essay: main body text ONLY. Exclude the header block (student/instructor/course/date/title lines) and bibliography.
- bibliography: full references/works cited/bibliography section including the heading.
- All other fields: empty string if not found.
- Do not truncate the essay or bibliography.`;

function stripFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function aiParse(text: string, apiKey: string): Promise<ParsedDocumentResult> {
  // Truncate to ~12k chars to stay within Gemini Flash context
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n...[truncated]" : text;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://octopilotai.com",
      "X-Title": "OctoPilot Formatter Parser",
    },
    body: JSON.stringify({
      model: GEMINI_FLASH_MODEL,
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(stripFence(raw)) as Partial<ParsedDocumentResult>;

  return {
    detectedStyle: (["mla", "apa", "chicago", "ieee", "harvard"].includes(parsed.detectedStyle ?? "")
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

    // 1. Try heuristic parsing first (fast, no AI cost)
    const heuristic = heuristicParse(text);
    if (heuristic && heuristic.detectedStyle !== "unknown" && heuristic.essay.length > 30) {
      return NextResponse.json(heuristic);
    }

    // 2. Heuristic insufficient — fall back to Gemini 2.0 Flash
    const { apiKey } = await getOpenRouterConfig("secondary");
    const aiResult = await aiParse(text, apiKey);
    return NextResponse.json(aiResult);
  } catch (err) {
    console.error("[formatter/parse]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed." },
      { status: 500 },
    );
  }
}
