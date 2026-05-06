// ThreadService — REST-backed persistence for Ghostwriter threads + folders.
//
// All data lives in PostgreSQL on the VPS, accessed through the Next.js proxy
// routes at /api/ghostwriter/threads and /api/ghostwriter/folders.
//
// Polling-based subscriptions (every 8 s) keep the sidebar fresh without
// requiring websockets or Firestore.

import { fetchWithUserAuthorization } from "./authenticatedFetch";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GwThreadStatus = "running" | "finished" | "error";

// ── Persisted run state snapshot ──────────────────────────────────────────────
// Saved to DB after every tool completes. Stripped of large text blobs —
// fullContent is replaced by a short snippet, essay lives in its own column.

export type PersistedSourceMeta = {
  url: string;
  title?: string;
  author?: string;
  publishedYear?: string;
  publisher?: string;
  outlineMatchIndex?: number;
  snippet?: string;   // first 400 chars of fullContent for AI context
};

export type PersistedCompactedSource = {
  sourceIndex: number;
  url: string;
  kind?: string;
  title?: string;
  author?: string;
  publishedYear?: string;
  publisher?: string;
  compactedContent: string;  // already compact — kept in full
};

export type PersistedRunState = {
  savedAt: string;        // ISO timestamp
  steps: Array<{ id: number; title: string; status: string }>;
  context: {
    essayTopic?: string;
    essayType?: string;
    wordCount?: number;
    citationStyle?: string;
    tone?: string;
    keywords?: string;
    scope?: string;
    structure?: string;
    outlines?: Array<{ id?: string; type?: string; title: string; description?: string }>;
    selectedOutlines?: Array<{ id?: string; type?: string; title: string; description?: string }>;
    critiqueIssues?: string[];
    revisionHistory?: Array<{ instruction: string }>;
  };
  sources?: PersistedSourceMeta[];
  compactedSources?: PersistedCompactedSource[];
  toolHistory?: Array<{ name: string; completedAt: string }>;
  humanizerInfo?: {
    provider: string;
    preText: string;    // essay text before humanization
  };
};

/** Lightweight thread record — used for the sidebar list */
export type GwThread = {
  id: string;
  uid: string;
  title: string;
  status: GwThreadStatus;
  folderId: string | null;
  runId: string;
  prompt: string;
  wordCount: number | null;
  citationStyle: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Full thread — includes essay text, chat messages, and run state snapshot */
export type GwThreadFull = GwThread & {
  essay: string | null;
  messages: Array<{ role: "user" | "ai"; text: string }>;
  runState: PersistedRunState | null;
};

export type GwFolder = {
  id: string;
  uid: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
};

// ── Thread API ────────────────────────────────────────────────────────────────

export async function listThreads(): Promise<GwThread[]> {
  const res = await fetchWithUserAuthorization("/api/ghostwriter/threads", { cache: "no-store" });
  if (!res.ok) throw new Error(`List threads failed: ${res.status}`);
  return res.json() as Promise<GwThread[]>;
}

export async function createThread(data: {
  runId: string;
  prompt: string;
  title?: string;
  folderId?: string | null;
  wordCount?: number | null;
  citationStyle?: string | null;
}): Promise<GwThreadFull> {
  const res = await fetchWithUserAuthorization("/api/ghostwriter/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create thread failed: ${res.status}`);
  return res.json() as Promise<GwThreadFull>;
}

export async function getThread(threadId: string): Promise<GwThreadFull> {
  const res = await fetchWithUserAuthorization(
    `/api/ghostwriter/threads/${encodeURIComponent(threadId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Get thread failed: ${res.status}`);
  return res.json() as Promise<GwThreadFull>;
}

export async function updateThread(
  threadId: string,
  patch: {
    title?: string;
    status?: GwThreadStatus;
    folderId?: string | null;
    essay?: string | null;
    messages?: Array<{ role: "user" | "ai"; text: string }>;
    wordCount?: number | null;
    citationStyle?: string | null;
    runState?: PersistedRunState | null;
  },
): Promise<GwThreadFull> {
  // Backend sentinel: pass "__unfiled__" when folderId is explicitly null
  const body = {
    ...patch,
    folderId:
      patch.folderId === null && "folderId" in patch
        ? "__unfiled__"
        : patch.folderId,
  };
  const res = await fetchWithUserAuthorization(
    `/api/ghostwriter/threads/${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Update thread failed: ${res.status}`);
  return res.json() as Promise<GwThreadFull>;
}

export async function deleteThread(threadId: string): Promise<void> {
  const res = await fetchWithUserAuthorization(
    `/api/ghostwriter/threads/${encodeURIComponent(threadId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) throw new Error(`Delete thread failed: ${res.status}`);
}

export async function moveThreadToFolder(
  threadId: string,
  folderId: string | null,
): Promise<void> {
  await updateThread(threadId, { folderId });
}

// ── Folder API ────────────────────────────────────────────────────────────────

export async function listFolders(): Promise<GwFolder[]> {
  const res = await fetchWithUserAuthorization("/api/ghostwriter/folders", { cache: "no-store" });
  if (!res.ok) throw new Error(`List folders failed: ${res.status}`);
  return res.json() as Promise<GwFolder[]>;
}

export async function createFolder(
  name: string,
  color = "#8b5cf6",
): Promise<GwFolder> {
  const res = await fetchWithUserAuthorization("/api/ghostwriter/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color, order: Date.now() }),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${res.status}`);
  return res.json() as Promise<GwFolder>;
}

export async function updateFolder(
  folderId: string,
  patch: { name?: string; color?: string; order?: number },
): Promise<GwFolder> {
  const res = await fetchWithUserAuthorization(
    `/api/ghostwriter/folders/${encodeURIComponent(folderId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`Update folder failed: ${res.status}`);
  return res.json() as Promise<GwFolder>;
}

export async function deleteFolder(folderId: string): Promise<void> {
  const res = await fetchWithUserAuthorization(
    `/api/ghostwriter/folders/${encodeURIComponent(folderId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) throw new Error(`Delete folder failed: ${res.status}`);
}

// ── Polling subscription ──────────────────────────────────────────────────────
// Returns an unsubscribe function. Fires immediately then every `intervalMs`.

export function subscribeThreadsAndFolders(
  onUpdate: (threads: GwThread[], folders: GwFolder[]) => void,
  intervalMs = 8_000,
): () => void {
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      const [threads, folders] = await Promise.all([listThreads(), listFolders()]);
      if (!cancelled) onUpdate(threads, folders);
    } catch {
      /* non-fatal — next poll will retry */
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), intervalMs);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}
