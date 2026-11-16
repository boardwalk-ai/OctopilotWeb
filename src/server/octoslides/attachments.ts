import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { writeBinaryFile, writeTextFile } from "@/server/octoslides/workspace";
import type { OctoSlidesRun } from "@/server/octoslides/runs";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_TEXT_CHARS = 150_000;
const GYR_URL = process.env.GYRFALCON_URL || "http://127.0.0.1:7700";
const OCR_URL = process.env.HIRARA_OCR_URL || "http://127.0.0.1:8400";

export type UploadedSource = { index: number; name: string; type: "pdf" | "docx" | "txt" | "image"; chars: number; asset?: string };

function fileType(file: File): UploadedSource["type"] | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".txt")) return "txt";
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(name)) return "image";
  return null;
}

export function validateUploadFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return "Attach at most 3 files.";
  if (files.some((file) => !fileType(file))) return "Use PDF, DOCX, TXT, PNG, JPG, WEBP, GIF or AVIF files.";
  if (files.some((file) => file.size > MAX_FILE_BYTES)) return "Each file must be 20 MB or smaller.";
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return "The three files together must be 40 MB or smaller.";
  return null;
}

function xmlText(xml: string): string {
  return xml.replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
      const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
      if (named[entity]) return named[entity];
      const hex = /^&#x([\da-f]+);$/i.exec(entity);
      const dec = /^&#(\d+);$/.exec(entity);
      const code = hex ? parseInt(hex[1], 16) : dec ? parseInt(dec[1], 10) : 0;
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }).replace(/\n{3,}/g, "\n\n").trim();
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("This DOCX has no document text.");
  return xmlText(xml);
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  GlobalWorkerOptions.workerSrc = pathToFileURL(join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")).href;
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false, disableFontFace: true, useWorkerFetch: false });
  const pdf = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= Math.min(pdf.numPages, 50); n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? String(item.str) : "").join(" ").trim());
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages.filter(Boolean).join("\n\n");
}

async function hiraraText(bytes: Uint8Array, name: string, type: string): Promise<string> {
  const form = new FormData();
  form.set("file", new Blob([Buffer.from(bytes)], { type }), name);
  const response = await fetch(`${OCR_URL}/ocr_read/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`HiraraOCR ${response.status}`);
  const result = await response.json() as { text?: string; markdown?: string; error?: string };
  if (result.error) throw new Error(result.error);
  return (result.markdown || result.text || "").trim();
}

async function command(program: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { shell: false, windowsHide: true });
    let output = "";
    let error = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString().slice(0, 2000); });
    child.on("error", (cause) => { clearTimeout(timer); reject(cause); });
    child.on("close", (code) => { clearTimeout(timer); if (code === 0) resolve(output); else reject(new Error(`${program}: ${error.slice(-300)}`)); });
  });
}

async function localPdfOcr(bytes: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "octoslides-ocr-"));
  try {
    const input = join(dir, "source.pdf");
    await writeFile(input, bytes);
    await command("pdftoppm", ["-f", "1", "-l", "20", "-scale-to", "2000", "-png", input, join(dir, "page")], 120_000);
    const pages = (await readdir(dir)).filter((file) => /^page-\d+\.png$/.test(file)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    const text: string[] = [];
    for (const page of pages) text.push((await command("tesseract", [join(dir, page), "stdout"], 30_000)).trim());
    return text.filter(Boolean).join("\n\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function visionText(bytes: Uint8Array, mime: string): Promise<string> {
  const { apiKey, model } = await getOpenRouterConfig("primary");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: [
      { type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` } },
      { type: "text", text: "Extract all readable text from this image. Preserve headings and reading order. Return only the text." },
    ] }], max_tokens: 4000, temperature: 0.1 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Image reading failed (${response.status}).`);
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return result.choices?.[0]?.message?.content?.trim() || "";
}

async function indexText(run: OctoSlidesRun, source: UploadedSource, text: string) {
  const id = `octoslides-upload:${run.runId}:${source.index}`;
  const response = await fetch(`${GYR_URL}/v1/documents/${encodeURIComponent(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${source.name}\n\n${text}`, metadata: { scope: "octoslides-upload", owner_id: run.ownerId, run_id: run.runId, file_index: source.index, title: source.name } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Gyrfalcon ${response.status}`);
}

export async function saveUploadedSources(run: OctoSlidesRun, files: File[]): Promise<UploadedSource[]> {
  const error = validateUploadFiles(files);
  if (error) throw new Error(error);
  const sources: UploadedSource[] = [];
  for (const [index, file] of files.entries()) {
    const type = fileType(file)!;
    const name = file.name.replace(/[\r\n]/g, " ").slice(0, 120);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    let asset: string | undefined;
    if (type === "txt") text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    else if (type === "docx") text = await docxText(bytes);
    else if (type === "pdf") {
      text = await pdfText(bytes);
      if (text.trim().length < 80) text = await hiraraText(bytes, name, "application/pdf")
        .catch(() => localPdfOcr(bytes).catch(() => text));
    } else {
      const image = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
      const safe = await image.resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      asset = `assets/upload-${index + 1}.png`;
      await writeBinaryFile(run.dir, asset, safe);
      text = await hiraraText(safe, name, "image/png").catch(() => visionText(safe, "image/png").catch(() => ""));
    }
    if (!text.trim() && type !== "image") throw new Error(`Could not read text from ${name}.`);
    text = text.slice(0, MAX_TEXT_CHARS);
    await writeBinaryFile(run.dir, `uploads/source-${index + 1}.${type === "image" ? "bin" : type}`, bytes);
    await writeTextFile(run.dir, `uploads/source-${index + 1}.txt`, text);
    const source: UploadedSource = { index: index + 1, name, type, chars: text.length, ...(asset ? { asset } : {}) };
    sources.push(source);
    if (text.trim()) await indexText(run, source, text).catch((error) => console.warn(`[octoslides] attachment index failed: ${(error as Error).message}`));
  }
  await writeTextFile(run.dir, "uploads/manifest.json", JSON.stringify(sources));
  return sources;
}

export async function uploadedSources(run: OctoSlidesRun): Promise<UploadedSource[]> {
  return readFile(join(run.dir, "uploads", "manifest.json"), "utf8")
    .then((text) => JSON.parse(text) as UploadedSource[])
    .catch(() => []);
}

export async function uploadedText(run: OctoSlidesRun, index: number): Promise<string> {
  if (!Number.isInteger(index) || index < 1 || index > MAX_FILES) throw new Error("Invalid file number.");
  const sources = await uploadedSources(run);
  if (!sources.some((source) => source.index === index)) throw new Error("No such uploaded file.");
  return readFile(join(run.dir, "uploads", `source-${index}.txt`), "utf8");
}

export async function searchUploadedSources(run: OctoSlidesRun, query: string): Promise<Array<{ file: number; title: string; text: string; score: number }>> {
  const sources = await uploadedSources(run);
  if (!sources.length) return [];
  try {
    const response = await fetch(`${GYR_URL}/v1/retrieve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 8, filter: { scope: "octoslides-upload", owner_id: run.ownerId, run_id: run.runId } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Gyrfalcon ${response.status}`);
    const result = await response.json() as { hits?: Array<{ body: string; score: number; metadata?: Record<string, unknown> }> };
    return (result.hits || []).filter((hit) => hit.metadata?.owner_id === run.ownerId && hit.metadata?.run_id === run.runId)
      .map((hit) => ({ file: Number(hit.metadata?.file_index), title: String(hit.metadata?.title || ""), text: hit.body.slice(0, 6000), score: hit.score }));
  } catch {
    const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
    const rows = await Promise.all(sources.map(async (source) => {
      const text = await uploadedText(run, source.index);
      const lower = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      return { file: source.index, title: source.name, text: text.slice(0, 6000), score };
    }));
    return rows.sort((a, b) => b.score - a.score).slice(0, 3);
  }
}

export async function removeUploadedIndex(runId: string): Promise<void> {
  await Promise.allSettled(Array.from({ length: MAX_FILES }, (_, index) => fetch(`${GYR_URL}/v1/documents/${encodeURIComponent(`octoslides-upload:${runId}:${index + 1}`)}`, {
    method: "DELETE", signal: AbortSignal.timeout(5000),
  })));
}
