// Unified server-side source search + scrape utility.
//
// Used by /api/sources/search (auto & manual modes).
// Ghostwriter keeps its own agentic tools unchanged.
//
// Strategy mirrors Ghostwriter's adaptive approach:
//   Round 1: search for (targetCount × 2) candidates
//   Scrape each → keep those with real content
//   If still short → search again with a refinement hint
//   Repeat up to MAX_ROUNDS or until targetCount good sources found.

import fs from "fs";
import path from "path";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";

const UPSTREAM_SCRAPER = "https://api.octopilotai.com/api/scrape";
const MAX_ROUNDS = 5;
const SCRAPE_TIMEOUT_MS = 15_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutlineInput = {
  type?: string;
  title: string;
  description?: string;
};

export type GoodSource = {
  url: string;
  title: string;
  author?: string;
  publishedYear?: string;
  publisher?: string;
  outlineIndex?: number;
  fullContent: string;
};

type RawRow = {
  website_URL?: string;
  url?: string;
  link?: string;
  Title?: string;
  title?: string;
  Author?: string;
  author?: string;
  "Published Year"?: string;
  publishedYear?: string;
  year?: string;
  Publisher?: string;
  publisher?: string;
  source?: string;
  outline_index?: number;
  outlineIndex?: number;
};

type UpstreamRef = {
  title?: string;
  source?: string;
  publisher?: string;
  authors?: string[];
  publicationYear?: number | null;
  rawContent?: string;
  fullContent?: string;
};

type UpstreamScrapeResponse = {
  references?: UpstreamRef[];
  title?: string;
  publisher?: string;
  fullContent?: string;
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function searchAndScrape({
  essayTopic,
  outlines,
  targetCount = 12,
  apiKey,
  model,
  onSource,
}: {
  essayTopic: string;
  outlines: OutlineInput[];
  targetCount?: number;
  apiKey: string;
  model: string;
  /** Called immediately when each source is validated — drives SSE streaming. */
  onSource: (source: GoodSource) => void;
}): Promise<GoodSource[]> {
  const found: GoodSource[] = [];
  const usedUrls = new Set<string>();
  const systemPrompt = loadAlvinPrompt();

  for (let round = 0; round < MAX_ROUNDS && found.length < targetCount; round++) {
    const needed = targetCount - found.length;
    // Ask for 2× what we still need so scrape failures leave us with enough.
    const requestCount = Math.min(30, Math.max(10, needed * 2));

    const refinement =
      round > 0
        ? `Previous rounds found ${found.length} good sources. Find ${needed} more from DIFFERENT publishers, domains, and authors than before.`
        : undefined;

    // ── 1. Search ─────────────────────────────────────────────────────────────
    let candidates: RawRow[];
    try {
      candidates = await fetchCandidates({
        essayTopic,
        outlines,
        count: requestCount,
        refinement,
        systemPrompt,
        apiKey,
        model,
      });
    } catch (err) {
      if (round === 0) throw err; // First round failure is fatal.
      break; // Later rounds: stop gracefully with what we have.
    }

    // Deduplicate against already-used URLs.
    const fresh = candidates.filter((row) => {
      const url = normaliseUrl(row);
      if (!url || usedUrls.has(url)) return false;
      usedUrls.add(url);
      return true;
    });

    if (fresh.length === 0) break; // Model returned only duplicates — stop.

    // ── 2. Scrape each fresh candidate ────────────────────────────────────────
    for (const row of fresh) {
      if (found.length >= targetCount) break;

      const url = normaliseUrl(row)!;
      try {
        const scraped = await scrapeUrl(url);
        if (!scraped.fullContent?.trim()) continue; // Empty page — skip.

        const source: GoodSource = {
          url,
          title: (scraped.title || String(row.Title || row.title || "")).trim(),
          author: String(row.Author || row.author || "").trim() || undefined,
          publishedYear:
            String(row["Published Year"] || row.publishedYear || row.year || "").trim() ||
            undefined,
          publisher:
            (scraped.publisher || String(row.Publisher || row.publisher || row.source || "")).trim() ||
            undefined,
          outlineIndex:
            Number(row.outline_index ?? row.outlineIndex) || undefined,
          fullContent: scraped.fullContent,
        };

        found.push(source);
        onSource(source); // ← streams to client immediately
      } catch (_e) {
        // Dead / paywalled / timeout — silently skip.
      }
    }
  }

  return found;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadAlvinPrompt(): string {
  return fs.readFileSync(path.resolve(process.cwd(), "agents/alvin.md"), "utf-8");
}

function normaliseUrl(row: RawRow): string | null {
  const raw = String(row.website_URL || row.url || row.link || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  if (/\.pdf(?:$|\?)/i.test(raw)) return null;
  return raw.toLowerCase();
}

async function fetchCandidates({
  essayTopic,
  outlines,
  count,
  refinement,
  systemPrompt,
  apiKey,
  model,
}: {
  essayTopic: string;
  outlines: OutlineInput[];
  count: number;
  refinement?: string;
  systemPrompt: string;
  apiKey: string;
  model: string;
}): Promise<RawRow[]> {
  const outlinesText = outlines.map((o) => ({
    type: o.type,
    title: o.title,
    description: o.description,
  }));

  const userMessage = [
    `Number of links needed: ${count}`,
    `Essay Topic: ${essayTopic}`,
    refinement ? `Refinement: ${refinement}` : null,
    "",
    "Supporting Outlines:",
    JSON.stringify(outlinesText, null, 2),
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callJson({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.25,
  });

  const parsed = parseJsonLoose(raw);
  if (Array.isArray(parsed)) return parsed as RawRow[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as RawRow[];
    const first = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(first)) return first as RawRow[];
  }
  return [];
}

async function scrapeUrl(
  url: string,
): Promise<{ title?: string; publisher?: string; fullContent?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTREAM_SCRAPER}?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`scrape ${res.status}`);

    const data = (await res.json()) as UpstreamScrapeResponse;

    if (Array.isArray(data.references) && data.references.length > 0) {
      const ref = data.references[0];
      return {
        title: ref.title,
        publisher: ref.publisher || ref.source,
        fullContent: ref.rawContent || ref.fullContent,
      };
    }
    return { title: data.title, publisher: data.publisher, fullContent: data.fullContent };
  } finally {
    clearTimeout(timer);
  }
}
