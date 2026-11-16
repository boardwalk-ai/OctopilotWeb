import { query } from "@/server/db";
import type { OctoTool, ToolOutput } from "@/server/octoslides/tools";
import { indexDocument, RagUnavailable, searchDocuments } from "@/server/rag/gyrfalcon";

/**
 * The user's own Octopilot work as deck material: saved documents (essays from
 * Ghostwriter / Writing Chamber), their outlines and sources. These run on the
 * host, never in the sandbox, and every query is scoped to the run's owner.
 */

const PAGE_CHARS = 24_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noAccount(): ToolOutput {
  return { ok: false, content: JSON.stringify({ error: "Could not link this deck to an Octopilot account, so documents are unavailable." }), summary: "No account" };
}

const decodeEntities = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type DocState = {
  snapshot?: { pages?: Array<{ plainText?: string; html?: string }> };
  body?: string;
  rawContent?: string;
  abstract?: string;
  keywords?: unknown;
};

/** Best available full text of a saved document. */
export function documentText(state: DocState | null): string {
  if (!state) return "";
  const pages = state.snapshot?.pages;
  if (Array.isArray(pages) && pages.length) {
    const text = pages.map((p) => (p.plainText?.trim() ? p.plainText : p.html ? htmlToText(p.html) : "")).join("\n\n").trim();
    if (text) return text;
  }
  for (const candidate of [state.body, state.rawContent]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.includes("<") ? htmlToText(candidate) : candidate.trim();
  }
  return "";
}

export async function ownsDocument(userId: string, documentId: string): Promise<{ id: string; title: string } | null> {
  if (!UUID.test(documentId)) return null;
  const rows = await query<{ id: string; title: string }>("SELECT id, title FROM documents WHERE id = $1 AND user_id = $2 LIMIT 1", [documentId, userId]);
  return rows[0] ?? null;
}

export const list_my_documents: OctoTool = {
  name: "list_my_documents",
  description:
    "List the user's saved Octopilot documents (essays and drafts from Ghostwriter / Writing Chamber) with word and source counts. Use when the user wants a deck from their own work, mentions their essay/paper/research, or attached a document.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  async execute(_args, { run }) {
    if (!run.dataUserId) return noAccount();
    const rows = await query<{ id: string; title: string; word_count: number; updated_at: Date; sources: string; outlines: string }>(
      `SELECT d.id, d.title, d.word_count, d.updated_at,
              (SELECT count(*) FROM document_sources s WHERE s.document_id = d.id) AS sources,
              (SELECT count(*) FROM document_outlines o WHERE o.document_id = d.id) AS outlines
         FROM documents d WHERE d.user_id = $1 ORDER BY d.updated_at DESC LIMIT 50`,
      [run.dataUserId],
    );
    const documents = rows.map((r) => ({
      id: r.id,
      title: r.title,
      words: r.word_count,
      sources: Number(r.sources),
      outlineSections: Number(r.outlines),
      updated: new Date(r.updated_at).toISOString().slice(0, 10),
    }));
    return { ok: true, content: JSON.stringify({ documents }), summary: `${documents.length} documents` };
  },
};

export const read_document: OctoTool = {
  name: "read_document",
  description:
    `Read one of the user's documents. part "text" = the essay text (paged, ${PAGE_CHARS} chars per call, use offset), "outline" = section outline, "sources" = the sources it cites (title, url, excerpt). Take facts, numbers and quotes from here; do not invent any. Put citations in the speaker notes of the slides that use them.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["id", "part"],
    properties: {
      id: { type: "string" },
      part: { type: "string", enum: ["text", "outline", "sources"] },
      offset: { type: "integer", minimum: 0 },
    },
  },
  async execute(args, { run }) {
    if (!run.dataUserId) return noAccount();
    const id = String(args.id ?? "");
    const doc = await ownsDocument(run.dataUserId, id);
    if (!doc) return { ok: false, content: JSON.stringify({ error: "No such document in this account." }), summary: "Document not found" };
    const part = String(args.part);

    if (part === "outline") {
      const sections = await query<{ id: string; title: string | null; type: string | null }>(
        "SELECT id, title, type FROM document_outlines WHERE document_id = $1 ORDER BY position",
        [doc.id],
      );
      const bullets = await query<{ outline_id: string; parent_bullet_id: string | null; id: string; text: string }>(
        `SELECT b.outline_id, b.parent_bullet_id, b.id, b.text FROM document_outline_bullets b
           JOIN document_outlines o ON o.id = b.outline_id WHERE o.document_id = $1 ORDER BY b.position`,
        [doc.id],
      );
      const outline = sections.map((s) => ({
        section: s.title,
        type: s.type,
        points: bullets
          .filter((b) => b.outline_id === s.id && !b.parent_bullet_id)
          .map((b) => ({ text: b.text, sub: bullets.filter((c) => c.parent_bullet_id === b.id).map((c) => c.text) })),
      }));
      return { ok: true, content: JSON.stringify({ title: doc.title, outline }), summary: `Outline of "${doc.title}"` };
    }

    if (part === "sources") {
      const sources = await query<{ source_ref: string | null; title: string | null; url: string | null; content: string | null }>(
        "SELECT source_ref, title, url, content FROM document_sources WHERE document_id = $1 ORDER BY position LIMIT 40",
        [doc.id],
      );
      const list = sources.map((s, i) => ({
        n: i + 1,
        ref: s.source_ref,
        title: s.title,
        url: s.url,
        excerpt: (s.content ?? "").replace(/\s+/g, " ").slice(0, 1200),
      }));
      return { ok: true, content: JSON.stringify({ title: doc.title, sources: list }), summary: `${list.length} sources of "${doc.title}"` };
    }

    const rows = await query<{ state: DocState | string | null }>("SELECT state FROM documents WHERE id = $1 AND user_id = $2", [doc.id, run.dataUserId]);
    const raw = rows[0]?.state ?? null;
    const state = typeof raw === "string" ? (JSON.parse(raw) as DocState) : raw;
    const text = documentText(state);
    if (!text) return { ok: true, content: JSON.stringify({ title: doc.title, text: "", note: "This document has no body text yet; try its outline or sources." }), summary: `"${doc.title}" is empty` };
    const offset = Math.max(0, Number(args.offset) || 0);
    const chunk = text.slice(offset, offset + PAGE_CHARS);
    const next = offset + chunk.length < text.length ? offset + chunk.length : null;
    return {
      ok: true,
      content: JSON.stringify({ title: doc.title, totalChars: text.length, offset, nextOffset: next, text: chunk }),
      summary: `Read "${doc.title}"${next ? ` (${Math.round((next / text.length) * 100)}%)` : ""}`,
    };
  },
};

export const search_document: OctoTool = {
  name: "search_document",
  description:
    "Search the user's saved documents (essay text and the sources they cite) and get back only the passages that answer your query, with source titles and URLs for citations. Much cheaper than reading a whole document: use it for each slide's facts, numbers and quotes. Pass id to search one document; kind to search only the essay text or only its sources.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", description: "What you need, in plain words (e.g. 'cost of running a compost program')" },
      id: { type: "string", description: "Document id from list_my_documents (optional)" },
      kind: { type: "string", enum: ["text", "source", "all"] },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
  timeoutMs: 45_000,
  async execute(args, { run }) {
    if (!run.dataUserId) return noAccount();
    const q = String(args.query ?? "").trim().slice(0, 500);
    if (!q) return { ok: false, content: JSON.stringify({ error: "query is required" }), summary: "No query" };
    const id = typeof args.id === "string" && args.id ? args.id : undefined;
    if (id && !(await ownsDocument(run.dataUserId, id))) {
      return { ok: false, content: JSON.stringify({ error: "No such document in this account." }), summary: "Document not found" };
    }
    try {
      // make sure what we search is current (cheap when nothing changed)
      if (id) await indexDocument(id);
      else {
        const docs = await query<{ id: string }>("SELECT id FROM documents WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20", [run.dataUserId]);
        for (const d of docs) await indexDocument(d.id);
      }
      const kind = args.kind === "text" || args.kind === "source" ? args.kind : undefined;
      const hits = await searchDocuments(run.dataUserId, q, { documentId: id, kind, limit: Number(args.limit) || 6 });
      const passages = hits.map((h, i) => ({
        n: i + 1,
        document: h.title,
        documentId: h.documentId,
        from: h.kind === "source" ? `source ${h.source?.n}: ${h.source?.title}` : "essay text",
        url: h.source?.url || undefined,
        score: h.score,
        text: h.text.length > 1400 ? `${h.text.slice(0, 1400)}…` : h.text,
      }));
      return {
        ok: true,
        content: JSON.stringify({ query: q, passages, note: passages.length ? "Cite sources by title/url in the speaker notes." : "Nothing matched; try other words, or read_document the outline." }),
        summary: `${passages.length} passages for "${q.slice(0, 40)}"`,
      };
    } catch (error) {
      if (error instanceof RagUnavailable) {
        return { ok: false, content: JSON.stringify({ error: "Document search is unavailable right now; use read_document instead." }), summary: "Search unavailable" };
      }
      throw error;
    }
  },
};
