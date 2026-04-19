// `search_sources` tool — produce a ranked list of citable sources for the
// current essay topic and outline structure. Mirrors the legacy Alvin
// agent at `/api/alvin/search`.
//
// The "search" here is LLM-driven: the source_search model is prompted
// with the Alvin system prompt and returns plausible citations (URL,
// title, author, year, publisher). The follow-up `scrape_sources` tool
// verifies each URL is real and fetches its content. Dead URLs drop out
// at that stage.

import fs from "fs";
import path from "path";
import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import type { SearchResultLite } from "@/server/ghostwriter/agent/context";
import { emit } from "@/server/ghostwriter/agent/runs";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";

type SearchArgs = {
  // How many new candidates to ask Alvin for. Capped at 20 by the prompt.
  count: number;
  // Optional per-call refinement — lets the orchestrator steer the query on
  // a second pass (e.g. "focus on peer-reviewed climate policy sources").
  refinement?: string;
};

type SearchResult = {
  added: SearchResultLite[];
  totalInContext: number;
};

type JasmineRow = {
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
};

export const searchSourcesTool: Tool<SearchArgs, SearchResult> = {
  name: "search_sources",
  description:
    "Propose a list of citable sources for the essay. Uses the essay topic and outline structure already in context. Results are appended to ctx.searchResults (deduped by URL). Call this AFTER generate_outlines. You may call it more than once with a `refinement` to broaden the pool if the first batch is too narrow — but don't loop on identical args.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["count"],
    properties: {
      count: {
        type: "integer",
        minimum: 3,
        maximum: 20,
        description:
          "Number of new source candidates to propose this call. Typical first pass is 8-12.",
      },
      refinement: {
        type: "string",
        description:
          "Optional refinement hint if the first pass was too narrow or off-topic (e.g. 'prioritise peer-reviewed journals' or 'include policy reports').",
      },
    },
  },
  stepTitle: (args) => `Searching for ${args.count} sources`,
  async execute(args, { run }) {
    const ctx = run.context;
    if (!ctx.essayTopic || ctx.outlines.length === 0) {
      throw new Error(
        "search_sources: call plan_essay and generate_outlines first (essayTopic + outlines required).",
      );
    }

    const targetCount = Math.max(3, Math.min(20, Number(args.count) || 8));
    const { apiKey, model } = await getOpenRouterConfig("source_search");

    const systemPrompt = loadAlvinPrompt();
    const outlinesForPrompt = ctx.outlines.map((o) => ({
      type: o.type,
      title: o.title,
      description: o.description,
    }));

    const userMessage = [
      `Number of links needed: ${targetCount}`,
      `Essay Topic: ${ctx.essayTopic}`,
      args.refinement ? `Refinement: ${args.refinement}` : null,
      "",
      "Supporting Outlines:",
      JSON.stringify(outlinesForPrompt, null, 2),
    ]
      .filter(Boolean)
      .join("\n");

    const content = await callJson({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
    });

    const parsed = parseJsonLoose(content);
    const rows = extractRows(parsed);
    const normalised = normaliseRows(rows, targetCount);

    // Dedup against whatever's already in ctx.searchResults.
    const existingUrls = new Set(ctx.searchResults.map((r) => r.url.toLowerCase()));
    const added = normalised.filter((r) => {
      const key = r.url.toLowerCase();
      if (existingUrls.has(key)) return false;
      existingUrls.add(key);
      return true;
    });

    if (added.length === 0) {
      throw new Error(
        "search_sources: model returned no new unique sources. Try a different refinement.",
      );
    }

    ctx.searchResults.push(...added);

    emit(run, {
      type: "context_update",
      patch: { searchResults: ctx.searchResults },
    });

    return { added, totalInContext: ctx.searchResults.length };
  },
};

// ─── helpers ───────────────────────────────────────────────────────────────
function loadAlvinPrompt(): string {
  const agentFile = path.resolve(process.cwd(), "agents/alvin.md");
  return fs.readFileSync(agentFile, "utf-8");
}

function extractRows(parsed: unknown): JasmineRow[] {
  if (Array.isArray(parsed)) return parsed as JasmineRow[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as JasmineRow[];
    // Fallback: first array-valued key.
    const firstArray = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) return firstArray as JasmineRow[];
  }
  return [];
}

function normaliseRows(rows: JasmineRow[], targetCount: number): SearchResultLite[] {
  const seen = new Set<string>();
  const out: SearchResultLite[] = [];

  for (const row of rows) {
    const url = String(row.website_URL || row.url || row.link || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (/\.pdf(?:$|\?)/i.test(url)) continue; // Match Alvin's legacy filter.

    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      url,
      title: String(row.Title || row.title || "").trim(),
      author: String(row.Author || row.author || "").trim() || undefined,
      publishedYear:
        String(row["Published Year"] || row.publishedYear || row.year || "").trim() || undefined,
      publisher:
        String(row.Publisher || row.publisher || row.source || "").trim() || undefined,
    });

    if (out.length >= targetCount) break;
  }

  return out;
}
