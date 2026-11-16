import { createHash } from "node:crypto";
import { query } from "@/server/db";
import { documentText } from "@/server/octoslides/dataTools";

/**
 * Retrieval over users' saved documents, backed by Gyrfalcon (hybrid BM25 + dense,
 * `gyr serve` on localhost; see infra/gyrfalcon). One collection holds everyone's
 * chunks; every write carries `user_id` and every search filters on it, so a
 * search can only ever see the caller's own documents.
 *
 * Index layout, per document:
 *   doc:<id>:text      the essay body                metadata kind=text
 *   doc:<id>:src:<n>   source n (title, url, excerpt)  metadata kind=source
 */

const GYR_URL = process.env.GYRFALCON_URL || "http://127.0.0.1:7700";
const TIMEOUT_MS = 15_000;

export class RagUnavailable extends Error {}

async function gyr<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${GYR_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new RagUnavailable(`search index unreachable: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (response.status === 404 && method === "DELETE") return {} as T;
  if (!response.ok) throw new Error(`gyrfalcon ${response.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type DocRow = { id: string; user_id: string; title: string; state: unknown };
type SourceRow = { title: string | null; url: string | null; content: string | null };

function fingerprint(parts: string[]) {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\u0000");
  return h.digest("hex");
}

/** (Re)indexes one document if its content changed since the last time. Returns false when skipped. */
export async function indexDocument(documentId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const rows = await query<DocRow>("SELECT id, user_id, title, state FROM documents WHERE id = $1", [documentId]);
  const doc = rows[0];
  if (!doc) {
    await removeDocument(documentId);
    return false;
  }
  const state = typeof doc.state === "string" ? JSON.parse(doc.state) : doc.state;
  const text = documentText(state);
  const sources = await query<SourceRow>("SELECT title, url, content FROM document_sources WHERE document_id = $1 ORDER BY position LIMIT 100", [documentId]);
  const hash = fingerprint([doc.user_id, doc.title, text, ...sources.map((s) => `${s.title}|${s.url}|${s.content}`)]);

  const prev = await query<{ text_hash: string; source_count: number }>("SELECT text_hash, source_count FROM rag_index_state WHERE document_id = $1", [documentId]);
  if (!opts.force && prev[0]?.text_hash === hash) return false;

  const base = { user_id: doc.user_id, document_id: doc.id };
  const title = doc.title || "Untitled document";
  if (text.trim()) {
    await gyr("PUT", `/v1/documents/${encodeURIComponent(`doc:${doc.id}:text`)}`, { text: `${title}\n\n${text}`, metadata: { ...base, kind: "text", title } });
  } else {
    await gyr("DELETE", `/v1/documents/${encodeURIComponent(`doc:${doc.id}:text`)}`);
  }
  for (const [n, s] of sources.entries()) {
    const body = [s.title, s.url, s.content].filter(Boolean).join("\n\n").trim();
    const id = encodeURIComponent(`doc:${doc.id}:src:${n}`);
    if (body) await gyr("PUT", `/v1/documents/${id}`, { text: body, metadata: { ...base, kind: "source", title: s.title ?? "", url: s.url ?? "", n } });
    else await gyr("DELETE", `/v1/documents/${id}`);
  }
  for (let n = sources.length; n < (prev[0]?.source_count ?? 0); n += 1) {
    await gyr("DELETE", `/v1/documents/${encodeURIComponent(`doc:${doc.id}:src:${n}`)}`);
  }
  await query(
    `INSERT INTO rag_index_state (document_id, user_id, text_hash, source_count, indexed_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (document_id) DO UPDATE SET user_id = $2, text_hash = $3, source_count = $4, indexed_at = now()`,
    [doc.id, doc.user_id, hash, sources.length],
  );
  return true;
}

export async function removeDocument(documentId: string): Promise<void> {
  const prev = await query<{ source_count: number }>("SELECT source_count FROM rag_index_state WHERE document_id = $1", [documentId]);
  await gyr("DELETE", `/v1/documents/${encodeURIComponent(`doc:${documentId}:text`)}`);
  for (let n = 0; n < (prev[0]?.source_count ?? 0); n += 1) {
    await gyr("DELETE", `/v1/documents/${encodeURIComponent(`doc:${documentId}:src:${n}`)}`);
  }
  await query("DELETE FROM rag_index_state WHERE document_id = $1", [documentId]);
}

/** Fire-and-forget from save/delete routes: indexing must never fail or slow a save. */
export function queueIndex(documentId: string, op: "index" | "remove" = "index") {
  const job = op === "index" ? indexDocument(documentId) : removeDocument(documentId);
  void job.catch((error) => console.warn(`[rag] ${op} ${documentId} failed:`, (error as Error).message));
}

export type DocumentHit = {
  documentId: string;
  title: string;
  kind: "text" | "source";
  text: string;
  score: number;
  source?: { n: number; title: string; url: string };
};

/** Hybrid search over the user's own documents (optionally one document, one kind). */
export async function searchDocuments(
  userId: string,
  q: string,
  opts: { documentId?: string; kind?: "text" | "source"; limit?: number } = {},
): Promise<DocumentHit[]> {
  const filter: Record<string, string> = { user_id: userId };
  if (opts.documentId) filter.document_id = opts.documentId;
  if (opts.kind) filter.kind = opts.kind;
  const result = await gyr<{ hits?: Array<{ body: string; score: number; metadata?: Record<string, unknown> }> }>("POST", "/v1/retrieve", {
    query: q,
    limit: Math.min(12, Math.max(1, opts.limit ?? 6)),
    filter,
  });
  return (result.hits ?? [])
    .filter((h) => h.metadata?.user_id === userId) // belt and braces: never hand back someone else's chunk
    .map((h) => {
      const m = h.metadata ?? {};
      const kind = m.kind === "source" ? "source" : "text";
      return {
        documentId: String(m.document_id ?? ""),
        title: String(m.title ?? ""),
        kind,
        text: h.body,
        score: Math.round(h.score * 1000) / 1000,
        ...(kind === "source" ? { source: { n: Number(m.n ?? 0) + 1, title: String(m.title ?? ""), url: String(m.url ?? "") } } : {}),
      };
    });
}
