import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

export const runtime = "nodejs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/* ── Exported type ────────────────────────────────────────────────────────── */
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

/**
 * Best-effort repair for a JSON string that was truncated mid-stream.
 * Closes any open string, then closes open objects/arrays in reverse order.
 * Returns null if the result still can't be parsed.
 */
function tryRepairJson(raw: string): ParsedDocumentResult | null {
  try { return JSON.parse(raw) as ParsedDocumentResult; } catch { /* fall through */ }

  let s = raw.trimEnd();

  // Close an unterminated string value (look for last unescaped opening quote)
  const inString = (() => {
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '"' && (i === 0 || s[i - 1] !== "\\")) inStr = !inStr;
    }
    return inStr;
  })();
  if (inString) s += '"';

  // Close open structures in reverse order
  const stack: string[] = [];
  let inStr2 = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  s += stack.reverse().join("");

  try { return JSON.parse(s) as ParsedDocumentResult; } catch { return null; }
}

/* ── DOCX server-side text extraction ───────────────────────────────────── */
async function extractDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("Could not read this .docx file.");
  const withBreaks = documentXml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^/]*\/>/g, "\n");
  const plain = withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
  if (!plain) throw new Error("This .docx file appears to be empty.");
  return plain;
}

/* ── Build AI message content ─────────────────────────────────────────────
   PDF  → inline base64 multimodal (Gemini reads it natively)
   DOCX → server-side JSZip extraction → plain text
   TXT  → plain text
   text → plain text (from JSON body)
────────────────────────────────────────────────────────────────────────── */
type UserContent =
  | string
  | Array<{ type: string; text?: string; image_url?: { url: string } }>;

async function buildUserContent(file: File): Promise<{ content: UserContent; fallbackText: string }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      content: [
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${base64}` },
        },
        {
          type: "text",
          text: "Parse this academic document. Extract all metadata and body content. Return the JSON.",
        },
      ],
      fallbackText: "",
    };
  }

  if (name.endsWith(".docx")) {
    const text = await extractDocxText(file);
    const input = text.length > 14000 ? text.slice(0, 14000) + "\n...[truncated]" : text;
    return { content: input, fallbackText: text };
  }

  if (name.endsWith(".txt")) {
    const text = await file.text();
    const input = text.length > 14000 ? text.slice(0, 14000) + "\n...[truncated]" : text;
    return { content: input, fallbackText: text };
  }

  throw new Error("Unsupported file type. Use .pdf, .docx, or .txt.");
}

/* ── Call AI ─────────────────────────────────────────────────────────────── */
async function callAI(
  userContent: UserContent,
  fallbackText: string,
  apiKey: string,
  model: string,
): Promise<ParsedDocumentResult> {
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
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 16000,
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
  const clean = stripFence(raw);
  const parsed = (tryRepairJson(clean) ?? (() => { throw new Error("AI returned malformed JSON that could not be repaired."); })()) as Partial<ParsedDocumentResult>;

  return {
    detectedStyle: (
      ["mla", "apa", "chicago", "ieee", "harvard"].includes(parsed.detectedStyle ?? "")
        ? parsed.detectedStyle
        : "unknown"
    ) as ParsedDocumentResult["detectedStyle"],
    essay:           String(parsed.essay ?? fallbackText),
    bibliography:    String(parsed.bibliography ?? ""),
    finalEssayTitle: String(parsed.finalEssayTitle ?? ""),
    studentName:     String(parsed.studentName ?? ""),
    instructorName:  String(parsed.instructorName ?? ""),
    institutionName: String(parsed.institutionName ?? ""),
    courseInfo:      String(parsed.courseInfo ?? ""),
    subjectCode:     String(parsed.subjectCode ?? ""),
    essayDate:       String(parsed.essayDate ?? ""),
    parsedBy: "ai",
  };
}

/* ── Route handler ───────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    if ("response" in auth) return auth.response;

    const { apiKey, model } = await getOpenRouterConfig("secondary");
    const contentType = request.headers.get("content-type") ?? "";

    /* ── File upload path ── */
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file." }, { status: 400 });
      }
      const { content, fallbackText } = await buildUserContent(file);
      const result = await callAI(content, fallbackText, apiKey, model);
      return NextResponse.json(result);
    }

    /* ── Plain-text path (paste / manual textarea) ── */
    const body = (await request.json()) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "No text provided." }, { status: 400 });
    }
    const input = text.length > 14000 ? text.slice(0, 14000) + "\n...[truncated]" : text;
    const result = await callAI(input, text, apiKey, model);
    return NextResponse.json(result);

  } catch (err) {
    console.error("[formatter/parse]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed." },
      { status: 500 },
    );
  }
}
