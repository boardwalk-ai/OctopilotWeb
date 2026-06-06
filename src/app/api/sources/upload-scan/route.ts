import { NextRequest, NextResponse } from "next/server";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";
import { pathToFileURL } from "url";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { requireAuthIfNotStandalone } from "@/server/standaloneMode";

export const runtime = "nodejs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// PDF.js worker
const workerPath = path.join(
  process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"
);
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/avif", "image/gif",
]);

// ── PDF text extraction (pdfjs) ───────────────────────────────────────────────
async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await (await getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    useWorkerFetch: false,
  }).promise);

  const pageTexts: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>)
      .map((it) => (it.str ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pageTexts.push(text);
  }
  return pageTexts.join("\n\n");
}

// ── Image OCR via vision model ────────────────────────────────────────────────
async function ocrImage(file: File, apiKey: string, model: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/jpeg";

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://octopilotai.com",
      "X-Title": "OctoPilot Source OCR",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            {
              type: "text",
              text: "Extract ALL visible text from this image exactly as it appears. Include headings, body text, captions, footnotes, and any other readable text. Output only the extracted text with no commentary.",
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision OCR error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthIfNotStandalone(request);
    if ("response" in auth) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const isPdf = mime.includes("pdf") || name.endsWith(".pdf");
    const isImage = ACCEPTED_IMAGE_TYPES.has(mime) ||
      /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(name);

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: "Only PDF and image files (JPEG, PNG, WEBP, HEIC, etc.) are supported." },
        { status: 400 }
      );
    }

    let fullContent = "";

    if (isPdf) {
      fullContent = await extractPdfText(file);
      if (!fullContent.trim()) {
        // Scanned PDF — fall back to vision OCR
        const { apiKey, model } = await getOpenRouterConfig("primary");
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        const res = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://octopilotai.com",
            "X-Title": "OctoPilot PDF OCR",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
                  { type: "text", text: "Extract ALL text from this PDF. Output only the text content, preserving structure." },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 8000,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          fullContent = (data.choices?.[0]?.message?.content ?? "").trim();
        }
      }
    } else {
      // Image — vision OCR
      const { apiKey, model } = await getOpenRouterConfig("primary");
      fullContent = await ocrImage(file, apiKey, model);
    }

    if (!fullContent.trim()) {
      return NextResponse.json({ error: "Could not extract any text from this file." }, { status: 422 });
    }

    return NextResponse.json({ fullContent: fullContent.slice(0, 12000) });
  } catch (err) {
    console.error("[sources/upload-scan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed." },
      { status: 500 }
    );
  }
}
