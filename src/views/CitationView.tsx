"use client";

import { useRef, useState } from "react";
import desktopStyles from "./CitationView.module.css";
import mobileStyles from "./CitationViewMobile.module.css";
import type { FormatStyleId } from "./FormatStyleView";

/* ── Merge CSS modules ───────────────────────────────────────────────────── */
function mergeStyles(...mods: Record<string, string>[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const mod of mods) {
    for (const [key, val] of Object.entries(mod)) {
      result[key] = result[key] ? `${result[key]} ${val}` : val;
    }
  }
  return result;
}
const styles = mergeStyles(
  desktopStyles as Record<string, string>,
  mobileStyles as Record<string, string>,
);

/* ── Types ───────────────────────────────────────────────────────────────── */
type AddTab = "scrape" | "manual";
type SourceType = "website" | "book" | "journal" | "newspaper" | "video" | "other";

interface Citation {
  id: string;
  text: string; // formatted string, *word* = italic
}

/* ── Source type configs ─────────────────────────────────────────────────── */
const SOURCE_TYPES: { id: SourceType; label: string; fields: string[] }[] = [
  { id: "website",   label: "Website",   fields: ["Author", "Page Title", "Website Name", "Published Date", "URL", "Access Date"] },
  { id: "book",      label: "Book",      fields: ["Author(s)", "Title", "Publisher", "City", "Year", "Edition"] },
  { id: "journal",   label: "Journal",   fields: ["Author(s)", "Article Title", "Journal Name", "Volume", "Issue", "Pages", "Year", "DOI"] },
  { id: "newspaper", label: "Newspaper", fields: ["Author", "Article Title", "Newspaper Name", "Date", "Page"] },
  { id: "video",     label: "Video",     fields: ["Creator / Director", "Title", "Platform", "Year", "URL"] },
  { id: "other",     label: "Other",     fields: ["Author", "Title", "Source", "Year", "Notes"] },
];

/* ── Inline citation renderer (*text* → <em>) ────────────────────────────── */
function RichText({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <em key={i}>{part}</em> : part
      )}
    </>
  );
}

/* ── SVG icons ───────────────────────────────────────────────────────────── */
function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
    </svg>
  );
}
function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function FileTextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function NewspaperIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="2" />
      <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="2" />
      <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="2" />
    </svg>
  );
}

const SOURCE_ICONS: Record<SourceType, React.ReactNode> = {
  website:   <GlobeIcon />,
  book:      <BookIcon />,
  journal:   <FileTextIcon />,
  newspaper: <NewspaperIcon />,
  video:     <VideoIcon />,
  other:     <MoreIcon />,
};

/* ── Props ───────────────────────────────────────────────────────────────── */
type CitationViewProps = {
  onBack: () => void;
  onContinue: (citations: Citation[]) => void;
  formatStyle?: FormatStyleId;
};

/* ── Component ───────────────────────────────────────────────────────────── */
export default function CitationView({
  onBack,
  onContinue,
  formatStyle = "mla",
}: CitationViewProps) {
  const [tab, setTab] = useState<AddTab>("scrape");

  // Scrape state
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // Manual state
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // Citations list
  const [citations, setCitations] = useState<Citation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const urlInputRef = useRef<HTMLInputElement>(null);

  /* ── Scrape ────────────────────────────────────────────────────────────── */
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeMsg(null);
    try {
      const res = await fetch("/api/spoonie/citation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "CITATION_PREVIEW",
          input: { url: scrapeUrl.trim(), style: formatStyle.toUpperCase() },
        }),
      });
      const data = (await res.json()) as { citation?: string; error?: string };
      if (!res.ok || !data.citation) {
        setScrapeMsg({ type: "error", text: data.error ?? "Could not extract citation." });
        return;
      }
      setCitations((prev) => [...prev, { id: crypto.randomUUID(), text: data.citation! }]);
      setScrapeUrl("");
      setScrapeMsg({ type: "ok", text: "Citation added!" });
      setTimeout(() => setScrapeMsg(null), 2500);
    } catch {
      setScrapeMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setScraping(false);
    }
  };

  /* ── Manual add ────────────────────────────────────────────────────────── */
  const handleManualAdd = async () => {
    if (!sourceType) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await fetch("/api/spoonie/citation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "FIELDWORK_CITATION",
          input: { type: sourceType, style: formatStyle.toUpperCase(), ...fields },
        }),
      });
      const data = (await res.json()) as { citation?: string; error?: string };
      if (!res.ok || !data.citation) {
        setAddMsg({ type: "error", text: data.error ?? "Could not format citation." });
        return;
      }
      setCitations((prev) => [...prev, { id: crypto.randomUUID(), text: data.citation! }]);
      setFields({});
      setAddMsg({ type: "ok", text: "Citation added!" });
      setTimeout(() => setAddMsg(null), 2500);
    } catch {
      setAddMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAdding(false);
    }
  };

  /* ── Edit / delete ─────────────────────────────────────────────────────── */
  const startEdit = (c: Citation) => { setEditingId(c.id); setEditText(c.text); };
  const saveEdit = () => {
    if (!editingId) return;
    setCitations((prev) => prev.map((c) => c.id === editingId ? { ...c, text: editText.trim() || c.text } : c));
    setEditingId(null);
  };
  const deleteCitation = (id: string) => setCitations((prev) => prev.filter((c) => c.id !== id));

  const currentFields = sourceType ? SOURCE_TYPES.find((s) => s.id === sourceType)?.fields ?? [] : [];
  const canAdd = sourceType !== null && currentFields.some((f) => fields[f]?.trim());

  return (
    <div className={styles.shell}>
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div className={styles.topNav}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Doc Oct
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className={styles.body}>

        {/* ════════════════════ LEFT — Step 4 ════════════════════ */}
        <div className={styles.bodyLeft}>
          <div className={styles.stepHeader}>
            <div className={styles.stepNum}>4</div>
            <h1 className={styles.stepTitle}>Add Citations</h1>
          </div>
          <p className={styles.stepSubtitle}>Choose how to add your sources</p>

          {/* Tab toggle */}
          <div className={styles.tabWrap}>
            <div className={styles.tabTrack} role="tablist">
              <div className={`${styles.tabPill} ${tab === "manual" ? styles.tabPillRight : ""}`} aria-hidden />
              <button
                role="tab"
                aria-selected={tab === "scrape"}
                className={`${styles.tabBtn} ${tab === "scrape" ? styles.tabBtnActive : ""}`}
                onClick={() => { setTab("scrape"); setScrapeMsg(null); }}
              >
                <GlobeIcon /> Find &amp; Scrape
              </button>
              <button
                role="tab"
                aria-selected={tab === "manual"}
                className={`${styles.tabBtn} ${tab === "manual" ? styles.tabBtnActive : ""}`}
                onClick={() => { setTab("manual"); setAddMsg(null); }}
              >
                <PenIcon /> Manual Entry
              </button>
            </div>
          </div>

          {/* ── Scrape panel ─────────────────────────────────────────── */}
          {tab === "scrape" && (
            <div className={styles.scrapePanel}>
              <div className={styles.scrapeCard}>
                <p className={styles.scrapeCardTitle}>A. Find / Scrape</p>
                <p className={styles.scrapeCardDesc}>
                  Paste a link to automatically extract citation details
                </p>
                <div className={styles.scrapeRow}>
                  <input
                    ref={urlInputRef}
                    className={styles.urlInput}
                    type="url"
                    placeholder="https://example.com/article"
                    value={scrapeUrl}
                    onChange={(e) => { setScrapeUrl(e.target.value); setScrapeMsg(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleScrape(); }}
                  />
                  <button
                    type="button"
                    className={styles.autoFillBtn}
                    onClick={() => void handleScrape()}
                    disabled={scraping || !scrapeUrl.trim()}
                  >
                    {scraping ? <span className={styles.spinner} /> : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 2H3v16h5v4l4-4h5l4-4V2zM11 11V7M15 11V7" />
                      </svg>
                    )}
                    {scraping ? "Fetching…" : "Auto-Fill"}
                  </button>
                </div>
                {scrapeMsg && (
                  <p className={scrapeMsg.type === "error" ? styles.scrapeError : styles.scrapeSuccess}>
                    {scrapeMsg.type === "error" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                    )}
                    {scrapeMsg.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Manual panel ─────────────────────────────────────────── */}
          {tab === "manual" && (
            <div className={styles.manualPanel}>
              <div className={styles.manualCard}>
                <p className={styles.manualCardTitle}>B. Manual Entry</p>
                <p className={styles.manualCardDesc}>
                  Select a source type and fill in the details
                </p>

                {/* Source type grid */}
                <div className={styles.sourceGrid} role="radiogroup" aria-label="Source type">
                  {SOURCE_TYPES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={sourceType === s.id}
                      className={`${styles.sourceCard} ${sourceType === s.id ? styles.sourceCardActive : ""}`}
                      onClick={() => { setSourceType(s.id); setFields({}); setAddMsg(null); }}
                    >
                      {SOURCE_ICONS[s.id]}
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Fields */}
                {sourceType && (
                  <div className={styles.fieldsWrap}>
                    {currentFields.map((fieldName, i) => (
                      <div
                        key={fieldName}
                        className={styles.fieldRow}
                        style={{ animationDelay: `${i * 0.045}s` }}
                      >
                        <label className={styles.fieldLabel}>{fieldName}</label>
                        <input
                          className={styles.fieldInput}
                          type="text"
                          placeholder={fieldName === "DOI" ? "10.xxxx/…" : fieldName === "URL" ? "https://…" : `Enter ${fieldName.toLowerCase()}`}
                          value={fields[fieldName] ?? ""}
                          onChange={(e) => setFields((prev) => ({ ...prev, [fieldName]: e.target.value }))}
                        />
                      </div>
                    ))}

                    {addMsg && (
                      <p className={addMsg.type === "error" ? styles.scrapeError : styles.scrapeSuccess}>
                        {addMsg.type === "error" ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                        )}
                        {addMsg.text}
                      </p>
                    )}

                    <button
                      type="button"
                      className={styles.addBtn}
                      disabled={!canAdd || adding}
                      onClick={() => void handleManualAdd()}
                    >
                      {adding ? <span className={styles.spinner} /> : <PlusIcon />}
                      {adding ? "Formatting…" : "Add to Bibliography"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════ RIGHT — Step 5 ════════════════════ */}
        <div className={styles.bodyRight}>
          <div className={styles.stepHeader}>
            <div className={styles.stepNum}>5</div>
            <h1 className={styles.stepTitle}>Manage Sources</h1>
            {citations.length > 0 && (
              <div className={styles.countBadge}>{citations.length}</div>
            )}
          </div>
          <p className={styles.stepSubtitle}>Your bibliography list</p>

          {/* Citation list or empty state */}
          {citations.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><ListIcon /></div>
              <p className={styles.emptyText}>No citations yet. Add your first source on the left.</p>
            </div>
          ) : (
            <div className={styles.citationList}>
              {citations.map((c, i) => (
                <div key={c.id} className={styles.citationRow}>
                  <div className={styles.citationNum}>{i + 1}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === c.id ? (
                      <>
                        <textarea
                          className={styles.citationEditArea}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                        />
                        <div className={styles.editActions}>
                          <button type="button" className={styles.editSaveBtn} onClick={saveEdit}>Save</button>
                          <button type="button" className={styles.editCancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.citationText}>
                        <RichText text={c.text} />
                      </p>
                    )}
                  </div>

                  {editingId !== c.id && (
                    <div className={styles.citationActions}>
                      <button
                        type="button"
                        className={styles.actionIcon}
                        onClick={() => startEdit(c)}
                        aria-label="Edit citation"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionIcon} ${styles.actionIconDelete}`}
                        onClick={() => deleteCitation(c.id)}
                        aria-label="Delete citation"
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add New Citation shortcut */}
          <button
            type="button"
            className={styles.addNewBtn}
            onClick={() => {
              setTab("scrape");
              setTimeout(() => urlInputRef.current?.focus(), 50);
            }}
          >
            <PlusIcon /> Add New Citation
          </button>

          {/* Continue */}
          <button
            type="button"
            className={styles.continueBtn}
            disabled={citations.length === 0}
            onClick={() => onContinue(citations)}
          >
            <span className={styles.continueBtnShine} aria-hidden />
            Format &amp; Open in Editor
            <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
