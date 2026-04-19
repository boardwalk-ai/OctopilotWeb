// `compact_sources` tool — summarise scraped source text into a short,
// quote-preserving brief the writer can consume without blowing the
// context window. Mirrors the legacy Zuly `source_compaction` task.
//
// Each scraped source is compacted independently. Failures on one source
// don't stop the others. The compacted entry carries a plain `summary`
// field for 3c; the legacy Zuly output also included `key_points` and
// `relevant_quotes` arrays, but the agentic writer tool only needs the
// narrative summary, so we flatten those into one string.

import fs from "fs";
import path from "path";
import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import type {
  CompactedSourceLite,
  ScrapedSourceLite,
} from "@/server/ghostwriter/agent/context";
import { emit } from "@/server/ghostwriter/agent/runs";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";

type CompactArgs = {
  urls?: string[];
};

type CompactResult = {
  compacted: number;
  failed: number;
  totalInContext: number;
};

type ZulyPayload = {
  compacted_content?: string;
  key_points?: string[] | string;
  relevant_quotes?: string[] | string;
};

export const compactSourcesTool: Tool<CompactArgs, CompactResult> = {
  name: "compact_sources",
  description:
    "Summarise each scraped source into a short, quote-preserving brief the writer can cite from. By default compacts every entry in ctx.scrapedSources that hasn't been compacted yet. Call this AFTER scrape_sources and BEFORE writing the essay.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional subset of URLs to compact. Omit to compact every not-yet-compacted scraped source.",
      },
    },
  },
  timeoutMs: 240_000,
  stepTitle: (args) => {
    const n = Array.isArray(args.urls) ? args.urls.length : undefined;
    return n != null ? `Compacting ${n} sources` : "Compacting sources";
  },
  async execute(args, { run }) {
    const ctx = run.context;
    const alreadyCompacted = new Set(
      ctx.compactedSources.map((s) => s.url.toLowerCase()),
    );

    const selectedUrls = Array.isArray(args.urls)
      ? new Set(args.urls.map((u) => String(u).trim().toLowerCase()).filter(Boolean))
      : null;

    const targets = ctx.scrapedSources.filter((s) => {
      if (alreadyCompacted.has(s.url.toLowerCase())) return false;
      if (selectedUrls && !selectedUrls.has(s.url.toLowerCase())) return false;
      return true;
    });

    if (targets.length === 0) {
      return { compacted: 0, failed: 0, totalInContext: ctx.compactedSources.length };
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");
    const systemPrompt = loadZulyPrompt();

    let compacted = 0;
    let failed = 0;

    for (const source of targets) {
      try {
        const summary = await compactOne({
          apiKey,
          model,
          systemPrompt,
          source,
        });
        if (!summary.trim()) {
          failed++;
          continue;
        }
        const entry: CompactedSourceLite = {
          url: source.url,
          title: source.title,
          author: source.author,
          publishedYear: source.publishedYear,
          publisher: source.publisher,
          summary,
        };
        ctx.compactedSources.push(entry);
        compacted++;
        emit(run, {
          type: "context_update",
          patch: { compactedSources: ctx.compactedSources },
        });
      } catch {
        // Individual source failures are non-fatal; the writer can still
        // cite whatever made it through.
        failed++;
      }
    }

    return {
      compacted,
      failed,
      totalInContext: ctx.compactedSources.length,
    };
  },
};

async function compactOne(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  source: ScrapedSourceLite;
}): Promise<string> {
  const { apiKey, model, systemPrompt, source } = args;

  const userMessage = [
    "Task: SOURCE_COMPACTION",
    `Source Type: web`,
    `Source Title: ${source.title || "Untitled"}`,
    "",
    "Full Content:",
    source.fullContent,
  ].join("\n");

  const content = await callJson({
    apiKey,
    model,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nYou are now handling SOURCE_COMPACTION.\nReturn strict JSON with exactly these keys:\n- "compacted_content"\n- "key_points"\n- "relevant_quotes"\n\nNo markdown. No commentary. No extra keys.`,
      },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
  });

  const parsed = parseJsonLoose(content) as ZulyPayload | null;
  if (!parsed) return "";

  const main = String(parsed.compacted_content || "").trim();
  const keyPoints = toStringList(parsed.key_points);
  const quotes = toStringList(parsed.relevant_quotes);

  // Flatten the Zuly output into a single summary string. Writer tool
  // (milestone 3c) treats this as the citable brief.
  const sections = [
    main,
    keyPoints.length ? `Key points:\n- ${keyPoints.join("\n- ")}` : "",
    quotes.length ? `Relevant quotes:\n- ${quotes.join("\n- ")}` : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function loadZulyPrompt(): string {
  const agentFile = path.resolve(process.cwd(), "agents/zuly.md");
  return fs.readFileSync(agentFile, "utf-8");
}
