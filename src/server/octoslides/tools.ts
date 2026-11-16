import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { runInSandbox, type SandboxResult } from "@/server/octoslides/sandbox";
import { fetchPublicImage } from "@/server/octoslides/safeFetch";
import { emit, waitForAnswer, type OctoSlidesRun } from "@/server/octoslides/runs";
import { applyMarks } from "@/server/octoslides/marks";
import { critique_slides, generate_image, resolveSearchResult, search_images } from "@/server/octoslides/creativeTools";
import { list_my_documents, read_document, search_document } from "@/server/octoslides/dataTools";
import { forget, remember } from "@/server/octoslides/memory";
import { findOctoSlidesTheme } from "@/lib/octoslidesThemes";
import {
  WorkspaceError,
  deckInfo,
  listFiles,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from "@/server/octoslides/workspace";

/**
 * The tools the OctoSlides model works with. They mirror what the pptx skill
 * does in a terminal: write a pptxgenjs script, run it, validate, read the text
 * back, and look at rendered slides.
 */

export type ToolImage = { label: string; dataUrl: string };
export type ToolOutput = { content: string; images?: ToolImage[]; ok: boolean; summary: string };
export type ToolContext = { run: OctoSlidesRun };

export type OctoTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  timeoutMs?: number;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutput>;
};

const MAX_RENDER_IMAGES = 8;
/** Preview resolution: 13.333in x 100dpi = 1333px wide slides for the editor. */
const RENDER_DPI = "100";

function sandboxReport(result: SandboxResult, limit = 6000): string {
  const tail = (s: string) => (s.length > limit ? `…${s.slice(-limit)}` : s);
  return JSON.stringify({
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    seconds: Math.round(result.durationMs / 100) / 10,
    stdout: tail(result.stdout.trim()),
    stderr: tail(result.stderr.trim()),
  });
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new WorkspaceError(`"${key}" is required.`);
  return v;
}

const write_file: OctoTool = {
  name: "write_file",
  description:
    "Create or overwrite a text file in the deck workspace (e.g. build.js, theme.json). The workspace is the current directory of every script run. Write the WHOLE file each time.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path", "content"],
    properties: {
      path: { type: "string", description: "Relative path, e.g. build.js" },
      content: { type: "string" },
    },
  },
  async execute(args, { run }) {
    const path = str(args, "path");
    const bytes = await writeTextFile(run.dir, path, String(args.content ?? ""));
    return { ok: true, content: JSON.stringify({ written: path, bytes }), summary: `Wrote ${path}` };
  },
};

const edit_file: OctoTool = {
  name: "edit_file",
  description:
    "Change part of a text file in the workspace: replaces the exact text `old` with `new`. `old` must occur exactly once (include enough surrounding lines to make it unique) unless all is true. Much cheaper than rewriting build.js with write_file for small fixes.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path", "old", "new"],
    properties: {
      path: { type: "string" },
      old: { type: "string" },
      new: { type: "string" },
      all: { type: "boolean", description: "Replace every occurrence" },
    },
  },
  async execute(args, { run }) {
    const path = str(args, "path");
    const oldText = typeof args.old === "string" ? args.old : "";
    const newText = typeof args.new === "string" ? args.new : "";
    if (!oldText) throw new WorkspaceError('"old" must not be empty.');
    const current = await readTextFile(run.dir, path);
    const count = current.split(oldText).length - 1;
    if (count === 0) return { ok: false, content: JSON.stringify({ error: "old text not found; read_file and copy it exactly (whitespace included)." }), summary: `No match in ${path}` };
    if (count > 1 && !args.all) return { ok: false, content: JSON.stringify({ error: `old text occurs ${count} times; add surrounding lines to make it unique, or pass all: true.` }), summary: `${count} matches in ${path}` };
    const next = args.all ? current.split(oldText).join(newText) : current.replace(oldText, () => newText);
    await writeTextFile(run.dir, path, next);
    return { ok: true, content: JSON.stringify({ edited: path, replacements: args.all ? count : 1 }), summary: `Edited ${path}` };
  },
};

const read_file: OctoTool = {
  name: "read_file",
  description: "Read a text file from the deck workspace.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: { path: { type: "string" } },
  },
  async execute(args, { run }) {
    const path = str(args, "path");
    return { ok: true, content: await readTextFile(run.dir, path), summary: `Read ${path}` };
  },
};

const list_files: OctoTool = {
  name: "list_files",
  description: "List every file in the deck workspace with its size.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  async execute(_args, { run }) {
    const files = await listFiles(run.dir);
    return { ok: true, content: JSON.stringify(files), summary: `${files.length} files` };
  },
};

/** Fingerprint of everything outside out/ that a build reads. */
async function inputsHash(dir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const f of await listFiles(dir)) {
    if (f.path.startsWith("out/")) continue;
    hash.update(`${f.path}|${f.bytes}|`);
    if (!f.path.startsWith("assets/")) hash.update(await readFile(join(dir, f.path)));
  }
  return hash.digest("hex");
}

const run_script: OctoTool = {
  name: "run_script",
  description:
    "Run a Node.js script from the workspace in the sandbox (no network; pptxgenjs, sharp, react, react-dom, react-icons, lucide-static are installed). The script must write the deck to out/deck.pptx and should call applyTheme afterwards. After the script, the sandbox applies edits.json (the user's manual text edits) and motion.json (transitions/animations); warnings from that step appear in stderr. Returns exit code, stdout and stderr.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { path: { type: "string", description: "Defaults to build.js" } },
  },
  timeoutMs: 100_000,
  async execute(args, { run }) {
    const path = typeof args.path === "string" && args.path ? args.path : "build.js";
    const before = await deckInfo(run.dir);
    // Rebuilding unchanged inputs only bumps the version and invalidates the render.
    const fingerprint = `${path}:${await inputsHash(run.dir)}`;
    if (before.exists && run.deckVersion > 0 && fingerprint === run.lastBuildHash) {
      return {
        ok: true,
        content: JSON.stringify({ skipped: true, reason: `Nothing changed since deck version ${run.deckVersion} was built; it is still current. Change a file first.` }),
        summary: "Unchanged, not rebuilt",
      };
    }
    const result = await runInSandbox(run.dir, ["deck-run", path], { timeoutMs: 90_000, memoryMb: 1024, signal: run.stopCtl?.signal });
    const after = await deckInfo(run.dir);
    const built = after.exists && after.mtimeMs !== before.mtimeMs;
    if (built) {
      await applyMarks(run);
      run.deckVersion += 1;
      emit(run, { type: "deck_ready", bytes: (await deckInfo(run.dir)).bytes, version: run.deckVersion });
    }
    const ok = result.exitCode === 0 && !result.timedOut;
    run.lastBuildHash = ok && built ? fingerprint : null;
    const note = ok && !built ? " Note: out/deck.pptx was not (re)written." : "";
    return {
      ok,
      content: sandboxReport(result) + (built ? `\nout/deck.pptx: ${after.bytes} bytes (version ${run.deckVersion}).` : "") + note,
      summary: ok ? (built ? `Built deck v${run.deckVersion}` : "Script ran, no deck written") : result.timedOut ? "Script timed out" : `Script failed (exit ${result.exitCode})`,
    };
  },
};

const validate_deck: OctoTool = {
  name: "validate_deck",
  description:
    "Run the pptx skill's validator on out/deck.pptx: schema, relationships, content types, chart and slide checks that PowerPoint would refuse or repair. Each failure names its fix. Fix problems in build.js, never by editing the zip.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  timeoutMs: 70_000,
  async execute(_args, { run }) {
    const result = await runInSandbox(run.dir, ["deck-validate"], { timeoutMs: 60_000, signal: run.stopCtl?.signal });
    const ok = result.exitCode === 0 && !result.timedOut;
    if (ok) run.lastValidatedVersion = run.deckVersion;
    return { ok, content: sandboxReport(result, 8000), summary: ok ? "Validation passed" : "Validation found problems" };
  },
};

const deck_text: OctoTool = {
  name: "deck_text",
  description: "Dump every slide's text, tables, chart data and speaker notes as markdown (content QA: missing text, typos, order, leftover placeholders).",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  timeoutMs: 70_000,
  async execute(_args, { run }) {
    const result = await runInSandbox(run.dir, ["deck-text"], { timeoutMs: 60_000, signal: run.stopCtl?.signal });
    const ok = result.exitCode === 0 && !result.timedOut;
    return { ok, content: ok ? result.stdout.slice(0, 40_000) : sandboxReport(result), summary: ok ? "Read deck text" : "Could not read deck text" };
  },
};

const render_slides: OctoTool = {
  name: "render_slides",
  description:
    "Render out/deck.pptx with LibreOffice and SHOW you the slides as images (visual QA). Pass the slide numbers to look at (max 8 per call); omit to see the first 8. Look for overflow, overlaps, cramped or uneven spacing, low contrast, misalignment, titles drifting between slides.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { slides: { type: "array", items: { type: "integer", minimum: 1 } } },
  },
  timeoutMs: 130_000,
  async execute(args, { run }) {
    const renderDir = join(run.dir, "out", "render");
    const fresh = run.renderedVersion !== run.deckVersion;
    let listing: string;
    if (!fresh) {
      // this version is already rendered: just show the requested slides again
      listing = (await readdir(renderDir).catch(() => [] as string[])).join("\n");
    } else {
      const result = await runInSandbox(run.dir, ["deck-render", RENDER_DPI], { timeoutMs: 120_000, memoryMb: 1536, cpus: 2, signal: run.stopCtl?.signal });
      if (result.exitCode !== 0 || result.timedOut) {
        return { ok: false, content: sandboxReport(result), summary: "Render failed" };
      }
      listing = result.stdout;
    }
    const available = listing
      .split("\n")
      .map((l) => l.match(/^slide-(\d+)\.png$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => a - b);
    const wanted = Array.isArray(args.slides) && args.slides.length
      ? (args.slides as unknown[]).map(Number).filter((n) => available.includes(n))
      : available;
    const pick = wanted.slice(0, MAX_RENDER_IMAGES);

    const images: ToolImage[] = [];
    for (const n of pick) {
      const png = await readFile(join(renderDir, `slide-${n}.png`));
      const jpg = await sharp(png).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
      images.push({ label: `Slide ${n}`, dataUrl: `data:image/jpeg;base64,${jpg.toString("base64")}` });
    }
    run.renderedVersion = run.deckVersion;
    if (fresh) emit(run, { type: "slides_rendered", slides: available, version: run.deckVersion });
    return {
      ok: true,
      images,
      content: JSON.stringify({
        slideCount: available.length,
        shown: pick,
        note: pick.length < available.length ? `Showing ${pick.length} of ${available.length}; call again with other slide numbers.` : undefined,
        caveat: "LibreOffice substitutes fonts it lacks; only Calibri, Cambria, Arial, Times New Roman and Courier New render true-to-width here.",
      }),
      summary: `Rendered ${available.length} slides, viewed ${pick.join(", ")}`,
    };
  },
};

const fetch_image: OctoTool = {
  name: "fetch_image",
  description:
    "Download an image into assets/ so the build script can embed it (the sandbox itself has no network). Pass search_id (a search_images result) or a url the user gave you. Returns the saved path, pixel size and, for search results, the credit line you must put in that slide's speaker notes.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      search_id: { type: "string", description: "id from search_images" },
      url: { type: "string", description: "https image URL the user provided" },
      name: { type: "string", description: "File name without extension, e.g. hero" },
    },
  },
  timeoutMs: 30_000,
  async execute(args, { run }) {
    const searchId = typeof args.search_id === "string" ? args.search_id.trim() : "";
    const found = searchId ? resolveSearchResult(run, searchId) : null;
    if (searchId && !found) throw new WorkspaceError("Unknown search_id; use an id from the latest search_images results.");
    const url = found ? found.url : str(args, "url");
    const base = str(args, "name").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || "image";
    const { data } = await fetchPublicImage(url);
    // Re-encode: proves it is an image, strips metadata, normalises format for pptxgenjs.
    const image = sharp(data, { limitInputPixels: 8000 * 8000 }).rotate();
    const meta = await image.metadata();
    const hasAlpha = !!meta.hasAlpha;
    const out = hasAlpha ? await image.png().toBuffer() : await image.jpeg({ quality: 88 }).toBuffer();
    const path = `assets/${base}.${hasAlpha ? "png" : "jpg"}`;
    await writeBinaryFile(run.dir, path, out);
    const size = await sharp(out).metadata();
    if (found) run.credits = [...run.credits.filter((c) => c.path !== path), { path, credit: found.credit }];
    return {
      ok: true,
      content: JSON.stringify({ path, width: size.width, height: size.height, bytes: (await stat(join(run.dir, path))).size, ...(found ? { credit: found.credit } : {}) }),
      summary: `Saved ${path}`,
    };
  },
};

const refresh_deck: OctoTool = {
  name: "refresh_deck",
  description:
    "Re-apply motion.json and edits.json to the current out/deck.pptx without re-running build.js (use after changing only motion.json or edits.json). Validate again afterwards.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  timeoutMs: 70_000,
  async execute(_args, { run }) {
    const result = await runInSandbox(run.dir, ["deck-post"], { timeoutMs: 60_000, signal: run.stopCtl?.signal });
    const ok = result.exitCode === 0 && !result.timedOut;
    if (ok) {
      await applyMarks(run);
      run.deckVersion += 1;
      const info = await deckInfo(run.dir);
      emit(run, { type: "deck_ready", bytes: info.bytes, version: run.deckVersion });
    }
    return { ok, content: sandboxReport(result), summary: ok ? `Refreshed deck v${run.deckVersion}` : "Refresh failed" };
  },
};

const outline_deck: OctoTool = {
  name: "outline_deck",
  description:
    "Announce the deck's plan as soon as you know the slide count: one short working title per slide, in order. The user immediately sees that many slides being prepared on screen. Call it once before writing build.js, and again only if the number or order of slides changes.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["slides"],
    properties: {
      slides: {
        type: "array",
        minItems: 1,
        maxItems: 60,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title"],
          properties: { title: { type: "string", description: "Working title, a few words" } },
        },
      },
    },
  },
  async execute(args, { run }) {
    const raw = Array.isArray(args.slides) ? (args.slides as Array<{ title?: unknown }>) : [];
    const slides = raw.slice(0, 60).map((s, i) => ({ title: String(s?.title ?? `Slide ${i + 1}`).trim().slice(0, 120) || `Slide ${i + 1}` }));
    if (!slides.length) throw new WorkspaceError("slides must list at least one slide.");
    emit(run, { type: "outline", slides });
    return { ok: true, content: JSON.stringify({ shown: slides.length }), summary: `${slides.length} slides planned` };
  },
};

const ask_user: OctoTool = {
  name: "ask_user",
  description: "Ask the user ONE question and wait. On the first deck request, ask for a missing slide count (kind slide_count), then a missing palette (kind color_theme). The color_theme UI shows the ten fixed palettes and an option to type custom colors. Do not ask about values already specified.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["question", "kind"],
    properties: {
      question: { type: "string" },
      kind: { type: "string", enum: ["slide_count", "color_theme", "other"] },
      suggestions: { type: "array", items: { type: "string" }, maxItems: 5 },
    },
  },
  timeoutMs: 30 * 60 * 1000,
  async execute(args, { run }) {
    const question = str(args, "question");
    // The UI only shows the theme picker for kind "color_theme"; models sometimes send
    // "other" (or a near miss like "color"), so the question text decides as a fallback.
    const rawKind = String(args.kind ?? "").toLowerCase();
    const kind: "slide_count" | "color_theme" | "other" =
      rawKind === "slide_count" || rawKind === "color_theme"
        ? rawKind
        : /colou?r|theme|palette/.test(rawKind) || /\b(colou?rs?|theme|palette)\b/i.test(question)
          ? "color_theme"
          : /slide|count|length/.test(rawKind) || /how many slides|number of slides|slide count/i.test(question)
            ? "slide_count"
            : "other";
    const suggestions = Array.isArray(args.suggestions) ? (args.suggestions as unknown[]).map(String).slice(0, 5) : kind === "slide_count" ? ["3 slides", "5 slides", "8 slides"] : undefined;
    run.status = "waiting_for_user";
    emit(run, { type: "ask_user", question, kind, suggestions: kind === "color_theme" ? undefined : suggestions });
    const answer = await waitForAnswer(run, 30 * 60 * 1000);
    // recorded in the event log, so the answer is still in the chat after a reload
    if (answer.trim()) emit(run, { type: "answered", text: answer });
    run.status = "running";
    const theme = kind === "color_theme" ? findOctoSlidesTheme(answer) : undefined;
    return { ok: true, content: JSON.stringify(theme ? { answer: theme.name, colors: theme.colors, description: theme.description } : { answer }), summary: "User answered" };
  },
};

const finish: OctoTool = {
  name: "finish",
  description:
    "Hand the finished deck to the user. Only call after the latest build passed validate_deck and you have looked at every slide with render_slides and fixed what you saw.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["summary"],
    properties: { summary: { type: "string", description: "Two or three sentences for the user about the deck." } },
  },
  async execute(args, { run }) {
    const info = await deckInfo(run.dir);
    if (!info.exists || run.deckVersion === 0) {
      return { ok: false, content: JSON.stringify({ error: "No deck has been built yet. Run build.js first." }), summary: "Not ready" };
    }
    if (run.lastValidatedVersion !== run.deckVersion) {
      return { ok: false, content: JSON.stringify({ error: `Deck version ${run.deckVersion} has not passed validate_deck. Validate (and fix) before finishing.` }), summary: "Not validated" };
    }
    return { ok: true, content: JSON.stringify({ done: true, summary: String(args.summary ?? "") }), summary: "Finished" };
  },
};

export const OCTOSLIDES_TOOLS: OctoTool[] = [
  write_file,
  edit_file,
  read_file,
  list_files,
  run_script,
  validate_deck,
  deck_text,
  render_slides,
  critique_slides,
  search_images,
  fetch_image,
  generate_image,
  refresh_deck,
  list_my_documents,
  search_document,
  read_document,
  remember,
  forget,
  outline_deck,
  ask_user,
  finish,
];

export function toOpenRouterTool(tool: OctoTool) {
  return { type: "function" as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}
