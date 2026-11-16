import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { fetchPublicImage } from "@/server/octoslides/safeFetch";
import type { OctoTool, ToolImage } from "@/server/octoslides/tools";
import { writeBinaryFile, WorkspaceError } from "@/server/octoslides/workspace";

/**
 * Tools that make decks less generic: openly licensed photos (Openverse),
 * generated images (OpenRouter image model) and a second-opinion design critic
 * (a cheap vision model, Haiku by default).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENVERSE_URL = "https://api.openverse.org/v1/images/";
const MAX_GENERATED_IMAGES = Number(process.env.OCTOSLIDES_MAX_GENERATED_IMAGES || 6);
const USER_AGENT = "OctoSlides/1.0 (+https://octopilotai.app)";

function safeName(raw: unknown, fallback: string) {
  const base = String(raw ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base || fallback;
}

async function openRouter(kind: "octoslides_critic" | "octoslides_image", body: Record<string, unknown>, timeoutMs: number) {
  const { apiKey, model } = await getOpenRouterConfig(kind);
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://octopilotai.app",
      "X-Title": "OctoSlides",
    },
    body: JSON.stringify({ model, usage: { include: true }, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string | null; images?: Array<{ image_url?: { url?: string } }> } }>;
    usage?: { cost?: number };
    error?: { message?: string };
  };
  if (data.error) throw new Error(`OpenRouter: ${data.error.message ?? "unknown error"}`);
  return { data, model, cost: data.usage?.cost ?? 0 };
}

// ── search_images ────────────────────────────────────────────────────────────
type OpenverseResult = {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  width?: number;
  height?: number;
  foreign_landing_url?: string;
  attribution?: string;
};

export const search_images: OctoTool = {
  name: "search_images",
  description:
    "Search openly licensed photos (Openverse: Flickr, Wikimedia and others; licenses allow commercial use and modification). Shows you small previews. Then call fetch_image with the result's id to download one; its credit is recorded for you. Use short, concrete, visual queries of 1-3 words (\"compost\", \"rice terraces\"), not abstractions (\"growth\"); every word must match.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string" },
      orientation: { type: "string", enum: ["landscape", "portrait", "square", "any"] },
      count: { type: "integer", minimum: 1, maximum: 8, description: "Previews to show (default 6)" },
    },
  },
  timeoutMs: 45_000,
  async execute(args, { run }) {
    const q = String(args.query ?? "").trim().slice(0, 120);
    if (!q) throw new WorkspaceError('"query" is required.');
    const count = Math.min(8, Math.max(1, Number(args.count) || 6));
    const params = new URLSearchParams({ page_size: "20", license_type: "commercial,modification", mature: "false" });
    const orientation = String(args.orientation ?? "landscape");
    if (orientation === "landscape") params.set("aspect_ratio", "wide");
    else if (orientation === "portrait") params.set("aspect_ratio", "tall");
    else if (orientation === "square") params.set("aspect_ratio", "square");
    const search = async (terms: string) => {
      params.set("q", terms);
      const response = await fetch(`${OPENVERSE_URL}?${params}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Image search failed (${response.status}).`);
      const data = (await response.json()) as { results?: OpenverseResult[] };
      return (data.results ?? []).filter((r) => r.url?.startsWith("https://") && (r.width ?? 1200) >= 1000).slice(0, count);
    };
    // Openverse matches every word, so long queries often find nothing: fall back to the first two words.
    let usedQuery = q;
    let results = await search(q);
    const words = q.split(/\s+/);
    if (!results.length && words.length > 2) {
      usedQuery = words.slice(0, 2).join(" ");
      results = await search(usedQuery);
    }
    if (!results.length) return { ok: true, content: JSON.stringify({ results: [], hint: "Nothing usable; use 1-3 concrete words." }), summary: `No photos for "${q}"` };

    const images: ToolImage[] = [];
    const listed = [];
    for (const [i, r] of results.entries()) {
      const credit = r.attribution || `"${r.title ?? "Untitled"}" by ${r.creator ?? "unknown"} (${(r.license ?? "").toUpperCase()} ${r.license_version ?? ""})`.trim();
      run.searchResults.set(r.id, { url: r.url, credit });
      listed.push({ n: i + 1, id: r.id, title: r.title, size: r.width && r.height ? `${r.width}x${r.height}` : undefined, license: `${r.license ?? ""} ${r.license_version ?? ""}`.trim(), creator: r.creator });
      if (r.thumbnail) {
        try {
          const { data: thumb } = await fetchPublicImage(r.thumbnail);
          const jpg = await sharp(thumb, { limitInputPixels: 4000 * 4000 }).resize({ width: 320, height: 320, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
          images.push({ label: `Result ${i + 1} (id ${r.id})`, dataUrl: `data:image/jpeg;base64,${jpg.toString("base64")}` });
        } catch {
          // preview missing; the result is still listed
        }
      }
    }
    return { ok: true, images, content: JSON.stringify({ query: usedQuery, results: listed }), summary: `${listed.length} photos for "${usedQuery}"` };
  },
};

/** fetch_image calls this to resolve a search result id to its URL and credit. */
export function resolveSearchResult(run: { searchResults: Map<string, { url: string; credit: string }> }, id: string) {
  return run.searchResults.get(id) ?? null;
}

// ── generate_image ───────────────────────────────────────────────────────────
export const generate_image: OctoTool = {
  name: "generate_image",
  description: `Generate an image with an image model and save it to assets/ (max ${MAX_GENERATED_IMAGES} per deck). Good for abstract backgrounds, textures, conceptual illustrations and scenes no stock photo shows. Never for logos, real people, charts, or anything containing text (models misspell). Describe subject, style, palette (use the deck's hex colors), lighting and empty space for text.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["prompt", "name"],
    properties: {
      prompt: { type: "string" },
      name: { type: "string", description: "File name without extension, e.g. cover-bg" },
      aspect_ratio: { type: "string", enum: ["16:9", "4:3", "1:1", "3:4", "9:16"] },
    },
  },
  timeoutMs: 150_000,
  async execute(args, { run }) {
    if (run.generatedImages >= MAX_GENERATED_IMAGES) {
      return { ok: false, content: JSON.stringify({ error: `This deck already used its ${MAX_GENERATED_IMAGES} generated images. Reuse one or use search_images.` }), summary: "Image limit reached" };
    }
    const prompt = String(args.prompt ?? "").trim().slice(0, 2000);
    if (!prompt) throw new WorkspaceError('"prompt" is required.');
    const name = safeName(args.name, "generated");
    const aspect = String(args.aspect_ratio ?? "16:9");
    run.generatedImages += 1;
    const { data, cost, model } = await openRouter(
      "octoslides_image",
      {
        messages: [{ role: "user", content: `${prompt}\n\nNo text, letters, numbers, logos or watermarks in the image.` }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: aspect },
      },
      140_000,
    );
    run.costUsd += cost;
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
    const match = url.match(/^data:image\/[a-z+]+;base64,(.+)$/);
    if (!match) {
      return { ok: false, content: JSON.stringify({ error: "The image model returned no image. Rephrase the prompt or use search_images." }), summary: "No image returned" };
    }
    const png = await sharp(Buffer.from(match[1], "base64"), { limitInputPixels: 8000 * 8000 }).png().toBuffer();
    const path = `assets/${name}.png`;
    await writeBinaryFile(run.dir, path, png);
    const meta = await sharp(png).metadata();
    const preview = await sharp(png).resize({ width: 512 }).jpeg({ quality: 72 }).toBuffer();
    return {
      ok: true,
      images: [{ label: path, dataUrl: `data:image/jpeg;base64,${preview.toString("base64")}` }],
      content: JSON.stringify({ path, width: meta.width, height: meta.height, model, remaining: MAX_GENERATED_IMAGES - run.generatedImages }),
      summary: `Generated ${path}`,
    };
  },
};

// ── critique_slides ──────────────────────────────────────────────────────────
const CRITIC_PROMPT = `You are a strict senior presentation designer reviewing rendered slides from one deck.
Score each slide 1-10 on overall design quality and list concrete, fixable problems.
Check: text overflowing or cut off; overlapping elements; cramped or uneven spacing; < 0.5in margins;
weak hierarchy (title vs body size contrast); low contrast; misalignment; walls of text; generic or
repetitive layouts across slides; decorative clutter (accent bars, stripes); inconsistent title position
between slides of the same type; a slide with no visual element; images stretched or badly cropped.
Also say if the deck as a whole feels generic and what single change would make it more distinctive.
Be specific ("subtitle box overlaps the photo bottom-left; move it up 0.3in"), not vague ("improve spacing").
Ignore font substitution artefacts (the renderer lacks some fonts).
Reply with JSON only:
{"slides":[{"slide":1,"score":7,"problems":["..."],"fixes":["..."]}],"deck":{"score":7,"generic":false,"advice":"..."}}`;

export const critique_slides: OctoTool = {
  name: "critique_slides",
  description:
    "Get a second opinion from a separate design critic on the latest render (call render_slides first). Returns a 1-10 score and concrete problems/fixes per slide. Use once after your own review and fixes; fix every slide that scores below 7, then re-render those slides.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      slides: { type: "array", items: { type: "integer", minimum: 1 }, description: "Slides to review (default all, max 16)" },
      focus: { type: "string", description: "Optional: what the critic should pay extra attention to" },
    },
  },
  timeoutMs: 120_000,
  async execute(args, { run }) {
    if (run.renderedVersion !== run.deckVersion) {
      return { ok: false, content: JSON.stringify({ error: "The latest build has not been rendered. Call render_slides first." }), summary: "Render first" };
    }
    const renderDir = join(run.dir, "out", "render");
    const wanted = Array.isArray(args.slides) && args.slides.length ? (args.slides as unknown[]).map(Number) : Array.from({ length: 40 }, (_, i) => i + 1);
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    let shown = 0;
    for (const n of wanted) {
      if (shown >= 16) break;
      const png = await readFile(join(renderDir, `slide-${n}.png`)).catch(() => null);
      if (!png) continue;
      const jpg = await sharp(png).resize({ width: 960, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
      parts.push({ type: "text", text: `Slide ${n}:` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpg.toString("base64")}` } });
      shown += 1;
    }
    if (!shown) return { ok: false, content: JSON.stringify({ error: "No rendered slides found." }), summary: "Nothing to review" };
    const focus = typeof args.focus === "string" && args.focus.trim() ? `\nExtra focus: ${args.focus.trim().slice(0, 500)}` : "";
    const { data, cost, model } = await openRouter(
      "octoslides_critic",
      {
        messages: [
          { role: "system", content: CRITIC_PROMPT + focus },
          { role: "user", content: [{ type: "text", text: `The deck's brief: ${run.prompt.slice(0, 1500)}` }, ...parts] },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      },
      110_000,
    );
    run.costUsd += cost;
    const raw = data.choices?.[0]?.message?.content ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    let parsed: { slides?: Array<{ slide: number; score: number }>; deck?: { score?: number } } | null = null;
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = null;
    }
    const low = parsed?.slides?.filter((s) => s.score < 7).map((s) => s.slide) ?? [];
    return {
      ok: true,
      content: parsed ? JSON.stringify({ critic: model, ...parsed, mustFix: low }) : raw.slice(0, 8000),
      summary: parsed ? `Critic: deck ${parsed.deck?.score ?? "?"}/10${low.length ? `, fix slides ${low.join(", ")}` : ""}` : "Critic replied",
    };
  },
};
