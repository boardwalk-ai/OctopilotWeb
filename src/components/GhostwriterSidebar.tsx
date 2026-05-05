"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribeThreadsAndFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  deleteThread,
  moveThreadToFolder,
  updateThread,
  type GwThread,
  type GwFolder,
} from "@/services/ThreadService";
import styles from "./GhostwriterSidebar.module.css";

const FOLDER_COLORS = [
  "#8b5cf6", "#ef4444", "#3b82f6", "#f59e0b",
  "#10b981", "#ec4899", "#06b6d4", "#f97316",
];

export type GhostwriterSidebarProps = {
  currentThreadId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewThread: () => void;
  onOpenThread: (threadId: string) => void;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: GwThread["status"] }) {
  if (status === "running")  return <span className={styles.dotRunning} />;
  if (status === "error")    return <span className={styles.dotError} />;
  return null;
}

// ── Context-menu ──────────────────────────────────────────────────────────────
type CtxMenu =
  | { kind: "thread"; id: string; x: number; y: number }
  | { kind: "folder"; id: string; x: number; y: number }
  | null;

// ── Main ─────────────────────────────────────────────────────────────────────
export default function GhostwriterSidebar({
  currentThreadId,
  collapsed,
  onToggleCollapse,
  onNewThread,
  onOpenThread,
}: GhostwriterSidebarProps) {
  const [threads, setThreads]               = useState<GwThread[]>([]);
  const [folders, setFolders]               = useState<GwFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [ctx, setCtx]                       = useState<CtxMenu>(null);
  const [movingId, setMovingId]             = useState<string | null>(null);
  const [renamingId, setRenamingId]         = useState<string | null>(null);
  const [renameVal, setRenameVal]           = useState("");
  const [showNewFolder, setShowNewFolder]   = useState(false);
  const [newFolderName, setNewFolderName]   = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]!);
  const renameRef    = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // Poll threads + folders every 8 s
  useEffect(() => {
    return subscribeThreadsAndFolders((t, f) => { setThreads(t); setFolders(f); });
  }, []);

  // Auto-focus rename / new-folder inputs
  useEffect(() => { if (renamingId)   renameRef.current?.focus(); },    [renamingId]);
  useEffect(() => { if (showNewFolder) newFolderRef.current?.focus(); }, [showNewFolder]);

  // Close context-menu on outside click
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [ctx]);

  // ── actions ────────────────────────────────────────────────────────────────

  const commitRename = async () => {
    if (!renamingId || !renameVal.trim()) { setRenamingId(null); return; }
    const isFolder = folders.some((f) => f.id === renamingId);
    try {
      if (isFolder) {
        const updated = await updateFolder(renamingId, { name: renameVal.trim() });
        setFolders((prev) => prev.map((f) => (f.id === renamingId ? updated : f)));
      } else {
        await updateThread(renamingId, { title: renameVal.trim() });
        setThreads((prev) =>
          prev.map((t) => (t.id === renamingId ? { ...t, title: renameVal.trim() } : t)),
        );
      }
    } catch { /* non-fatal */ }
    setRenamingId(null);
  };

  const handleDeleteThread = async (id: string) => {
    setCtx(null);
    try {
      await deleteThread(id);
      setThreads((prev) => prev.filter((t) => t.id !== id));
    } catch { /* non-fatal */ }
  };

  const handleDeleteFolder = async (id: string) => {
    setCtx(null);
    try {
      await deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setThreads((prev) => prev.map((t) => (t.folderId === id ? { ...t, folderId: null } : t)));
    } catch { /* non-fatal */ }
  };

  const handleMove = async (threadId: string, folderId: string | null) => {
    setMovingId(null); setCtx(null);
    try {
      await moveThreadToFolder(threadId, folderId);
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, folderId } : t)));
    } catch { /* non-fatal */ }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const folder = await createFolder(newFolderName.trim(), newFolderColor);
      setFolders((prev) => [...prev, folder]);
    } catch { /* non-fatal */ }
    setShowNewFolder(false); setNewFolderName(""); setNewFolderColor(FOLDER_COLORS[0]!);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const unfiled = threads.filter((t) => !t.folderId);

  // ── collapsed state ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        <button type="button" className={styles.collapseBtn} onClick={onToggleCollapse} title="Expand">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <button type="button" className={styles.newBtnCollapsed} onClick={onNewThread} title="New thread">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
        </button>
      </div>
    );
  }

  // ── full sidebar ───────────────────────────────────────────────────────────
  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.brand}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#ef4444" }}>
            <path d="m4 20 4.5-1 9.7-9.7a2.1 2.1 0 1 0-3-3L5.5 16 4 20Z" /><path d="m13.5 6.5 4 4" />
          </svg>
          <span>Ghostwriter</span>
        </div>
        <button type="button" className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* New Thread */}
      <button type="button" className={styles.newBtn} onClick={onNewThread}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" /><path d="M5 12h14" />
        </svg>
        New Thread
      </button>

      {/* Scrollable list */}
      <div className={styles.scroll}>

        {/* ── Folders ── */}
        {folders.map((folder) => {
          const folderThreads = threads.filter((t) => t.folderId === folder.id);
          const open = expandedFolders.has(folder.id);
          return (
            <div key={folder.id}>
              <div
                className={styles.folderRow}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ kind: "folder", id: folder.id, x: e.clientX, y: e.clientY }); }}
              >
                <button type="button" className={styles.folderBtn} onClick={() => toggleFolder(folder.id)}>
                  <span className={styles.folderDot} style={{ background: folder.color }} />
                  {renamingId === folder.id ? (
                    <input ref={renameRef} className={styles.renameInput} value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      onClick={(e) => e.stopPropagation()} />
                  ) : (
                    <span className={styles.folderName}>{folder.name}</span>
                  )}
                  <span className={styles.folderCount}>{folderThreads.length}</span>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 140ms", opacity: 0.35, flexShrink: 0 }}>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>

              {open && folderThreads.map((t) => (
                <div key={t.id} className={styles.folderThread}>
                  {renamingId === t.id
                    ? <input ref={renameRef} className={`${styles.renameInput} ${styles.renameInputIndent}`} value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") setRenamingId(null); }} />
                    : <button type="button"
                        className={`${styles.threadRow} ${t.id === currentThreadId ? styles.threadRowActive : ""}`}
                        onClick={() => onOpenThread(t.id)}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ kind: "thread", id: t.id, x: e.clientX, y: e.clientY }); }}>
                        <StatusDot status={t.status} />
                        <span className={styles.threadTitle}>{t.title}</span>
                        <span className={styles.threadAge}>{relativeTime(t.updatedAt)}</span>
                      </button>
                  }
                </div>
              ))}
            </div>
          );
        })}

        {/* ── Unfiled threads ── */}
        {unfiled.length > 0 && (
          <div className={styles.unfiled}>
            {folders.length > 0 && <div className={styles.unfiledLabel}>Unfiled</div>}
            {unfiled.map((t) => (
              renamingId === t.id
                ? <input key={t.id} ref={renameRef} className={`${styles.renameInput} ${styles.renameInputThread}`} value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") setRenamingId(null); }} />
                : <button key={t.id} type="button"
                    className={`${styles.threadRow} ${t.id === currentThreadId ? styles.threadRowActive : ""}`}
                    onClick={() => onOpenThread(t.id)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ kind: "thread", id: t.id, x: e.clientX, y: e.clientY }); }}>
                    <StatusDot status={t.status} />
                    <span className={styles.threadTitle}>{t.title}</span>
                    <span className={styles.threadAge}>{relativeTime(t.updatedAt)}</span>
                  </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {threads.length === 0 && !showNewFolder && (
          <div className={styles.empty}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity={0.18}>
              <path d="m4 20 4.5-1 9.7-9.7a2.1 2.1 0 1 0-3-3L5.5 16 4 20Z" /><path d="m13.5 6.5 4 4" />
            </svg>
            <p>No threads yet</p>
            <p>Click New Thread to start</p>
          </div>
        )}

        {/* New folder form */}
        {showNewFolder && (
          <div className={styles.newFolderForm}>
            <input ref={newFolderRef} className={styles.newFolderInput} placeholder="Folder name…"
              value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder(); if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); } }} />
            <div className={styles.colorPicker}>
              {FOLDER_COLORS.map((c) => (
                <button key={c} type="button"
                  className={`${styles.swatch} ${newFolderColor === c ? styles.swatchActive : ""}`}
                  style={{ background: c }} onClick={() => setNewFolderColor(c)} />
              ))}
            </div>
            <div className={styles.newFolderActions}>
              <button type="button" className={styles.createBtn} onClick={() => void handleCreateFolder()}>Create</button>
              <button type="button" className={styles.cancelBtn} onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* New Folder button */}
      <button type="button" className={styles.newFolderBtn} onClick={() => setShowNewFolder(true)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <path d="M12 11v6" /><path d="M9 14h6" />
        </svg>
        New Folder
      </button>

      {/* Context menu */}
      {ctx && (
        <div className={styles.ctx} style={{ top: ctx.y, left: ctx.x }} onClick={(e) => e.stopPropagation()}>
          {ctx.kind === "thread" && (() => {
            const t = threads.find((x) => x.id === ctx.id);
            if (!t) return null;
            return (
              <>
                <button type="button" className={styles.ctxItem} onClick={() => { setRenamingId(ctx.id); setRenameVal(t.title); setCtx(null); }}>Rename</button>
                <button type="button" className={styles.ctxItem}
                  onClick={(e) => { e.stopPropagation(); setMovingId(movingId === ctx.id ? null : ctx.id); }}>
                  Move to folder
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: "auto" }}><path d="m9 18 6-6-6-6" /></svg>
                </button>
                {movingId === ctx.id && (
                  <div className={styles.folderPicker}>
                    <button type="button" className={styles.fpItem} onClick={() => void handleMove(ctx.id, null)}>
                      <span className={styles.fpDot} style={{ background: "rgba(255,255,255,0.12)" }} />
                      Unfiled
                      {!t.folderId && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>}
                    </button>
                    {folders.map((f) => (
                      <button key={f.id} type="button" className={styles.fpItem} onClick={() => void handleMove(ctx.id, f.id)}>
                        <span className={styles.fpDot} style={{ background: f.color }} />
                        {f.name}
                        {t.folderId === f.id && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.ctxDivider} />
                <button type="button" className={`${styles.ctxItem} ${styles.ctxDanger}`} onClick={() => void handleDeleteThread(ctx.id)}>Delete</button>
              </>
            );
          })()}
          {ctx.kind === "folder" && (() => {
            const f = folders.find((x) => x.id === ctx.id);
            if (!f) return null;
            return (
              <>
                <button type="button" className={styles.ctxItem} onClick={() => { setRenamingId(ctx.id); setRenameVal(f.name); setCtx(null); }}>Rename</button>
                <div className={styles.ctxDivider} />
                <button type="button" className={`${styles.ctxItem} ${styles.ctxDanger}`} onClick={() => void handleDeleteFolder(ctx.id)}>Delete folder</button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
