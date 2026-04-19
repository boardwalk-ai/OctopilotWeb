// `scrape_sources` tool — fetch the full text of candidate sources.
//
// Legacy behaviour: `ScraperService.scrape(url)` proxies through
// `/api/scrape?url=...`, which in turn calls
// `https://api.octopilotai.com/api/scrape?url=...`. We call the upstream
// API directly from the tool to skip the intra-server fetch hop.
//
// Dead URLs / failing scrapes are silently dropped — the agent should
// call `search_sources` again if too few survive (the return value
// includes failure counts so it can notice).

import type { Tool } from "@/server/ghostwriter/agent/tools";
import type { ScrapedSourceLite } from "@/server/ghostwriter/agent/context";
import { emit } from "@/server/ghostwriter/agent/runs";
import { deductCredits } from "@/server/ghostwriter/shared/credits";

const UPSTREAM_SCRAPER = "https://api.octopilotai.com/api/scrape";

type ScrapeArgs = {
  // Optional subset — specific URLs to scrape. If omitted, every
  // searchResult not yet scraped is processed.
  urls?: string[];
  // Upper bound on newly-scraped sources this call. Protects against a
  // runaway request for hundreds of pages.
  limit?: number;
};

type ScrapeResult = {
  scraped: number;
  failed: number;
  totalInContext: number;
};

type UpstreamScrape = {
  title?: string;
  publisher?: string;
  fullContent?: string;
};

export const scrapeSourcesTool: Tool<ScrapeArgs, ScrapeResult> = {
  name: "scrape_sources",
  description:
    "Fetch the full text of search-result sources. By default scrapes every URL in ctx.searchResults that hasn't been scraped yet. Successful scrapes are appended to ctx.scrapedSources. Failures are dropped silently (they usually indicate dead or paywalled URLs). Call this AFTER search_sources.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional explicit URLs to scrape. Omit to scrape all un-scraped searchResults in context.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        description:
          "Maximum number of URLs to scrape in this call. Default 15.",
      },
    },
  },
  // Scraping is network-heavy; give it a longer budget than the default.
  timeoutMs: 180_000,
  stepTitle: (args) => {
    const n = Array.isArray(args.urls) ? args.urls.length : undefined;
    return n != null ? `Scraping ${n} URLs` : "Scraping sources";
  },
  async execute(args, { run }) {
    const ctx = run.context;
    const alreadyScraped = new Set(ctx.scrapedSources.map((s) => s.url.toLowerCase()));
    const limit = Math.max(1, Math.min(30, Number(args.limit) || 15));

    // Decide which URLs to process.
    const explicitUrls = Array.isArray(args.urls)
      ? args.urls.map((u) => String(u).trim()).filter(Boolean)
      : null;

    const candidates = explicitUrls
      ? explicitUrls.map((url) => {
          const existing = ctx.searchResults.find((r) => r.url.toLowerCase() === url.toLowerCase());
          return existing || { url, title: "", author: undefined, publishedYear: undefined, publisher: undefined };
        })
      : ctx.searchResults.filter((r) => !alreadyScraped.has(r.url.toLowerCase()));

    const targets = candidates.slice(0, limit);
    if (targets.length === 0) {
      return { scraped: 0, failed: 0, totalInContext: ctx.scrapedSources.length };
    }

    let scraped = 0;
    let failed = 0;

    // Sequential fetches. Parallelising is tempting but most of these go to
    // the same upstream service; we don't want to thundering-herd it.
    for (const target of targets) {
      if (alreadyScraped.has(target.url.toLowerCase())) continue;
      try {
        const data = await fetchScrape(target.url);
        if (!data.fullContent || !data.fullContent.trim()) {
          failed++;
          continue;
        }
        const entry: ScrapedSourceLite = {
          url: target.url,
          title: (data.title || target.title || "").trim(),
          author: target.author,
          publishedYear: target.publishedYear,
          publisher: (data.publisher || target.publisher || "").trim() || undefined,
          fullContent: data.fullContent,
        };
        ctx.scrapedSources.push(entry);
        alreadyScraped.add(target.url.toLowerCase());
        scraped++;

        // Emit progress every successful scrape so the UI can show a live
        // counter. Avoid emitting failures — they'd spam the timeline.
        emit(run, {
          type: "context_update",
          patch: { scrapedSources: ctx.scrapedSources },
        });
      } catch {
        failed++;
      }
    }

    // Deduct source credits: 1 credit per successfully scraped source.
    // Use the current total as part of the idempotency key so that a second
    // scrape call (for a different batch) gets its own key.
    if (scraped > 0 && run.authToken) {
      await deductCredits(
        run.authToken,
        "source",
        scraped,
        `${run.id}:source:${ctx.scrapedSources.length}`,
      ).catch((err: unknown) => {
        emit(run, {
          type: "step_error",
          id: `${run.id}-credits-source`,
          error: err instanceof Error ? err.message : "Source credit deduction failed.",
          retryable: false,
        });
      });
    }

    return {
      scraped,
      failed,
      totalInContext: ctx.scrapedSources.length,
    };
  },
};

async function fetchScrape(url: string): Promise<UpstreamScrape> {
  const response = await fetch(`${UPSTREAM_SCRAPER}?url=${encodeURIComponent(url)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`scrape upstream ${response.status}`);
  }
  return (await response.json()) as UpstreamScrape;
}
