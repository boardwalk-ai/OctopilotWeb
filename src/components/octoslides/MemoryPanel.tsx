"use client";

import { useEffect, useState } from "react";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";

type Fact = { id: string; predicate: string; object: string; polarity: 1 | -1; note: string | null; createdAt: string };

const LABEL: Record<string, string> = {
  brand_color: "Brand color",
  font: "Font",
  theme: "Theme",
  tone: "Tone",
  audience: "Audience",
  organization: "Organization",
  language: "Language",
  title_style: "Titles",
  density: "Text per slide",
  logo: "Logo",
  citation_style: "Citations",
  prefer: "Likes",
  avoid: "Avoids",
};

/** What OctoSlides remembers about the user, with a way to make it forget. */
export default function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithUserAuthorization("/api/octoslides/memory")
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { facts?: Fact[]; error?: string };
        if (!r.ok) throw new Error(d.error || "Could not load memory.");
        setFacts(d.facts ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const forget = async (id: string) => {
    setFacts((f) => f?.filter((x) => x.id !== id) ?? null);
    await fetchWithUserAuthorization(`/api/octoslides/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  };

  return (
    <div className="enter absolute left-3 right-3 top-[60px] z-30 rounded-[var(--md-shape-l)] p-4" style={{ background: "var(--md-surface-container-high)", boxShadow: "var(--md-elev-3)" }} role="dialog" aria-label="What OctoSlides remembers">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="t-title-m">What OctoSlides remembers</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="state icon-btn !h-8 !w-8">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="t-body-m on-variant mb-3">Things you told the designer about yourself or your brand. It uses them in every new deck. Remove anything that is wrong.</p>
      {error && <p className="t-body-m" style={{ color: "var(--md-error)" }}>{error}</p>}
      {facts === null && !error && <p className="t-body-m on-variant">Loading…</p>}
      {facts?.length === 0 && <p className="t-body-m on-variant py-2">Nothing yet. Tell the designer things like “our brand color is navy” or “no stock photos”.</p>}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {facts?.map((f) => (
          <li key={f.id} className="group flex items-center gap-3 rounded-[var(--md-shape-s)] px-2 py-2">
            <span className="t-label-m on-variant w-[96px] shrink-0">{LABEL[f.predicate] ?? f.predicate}</span>
            <span className="t-body-m min-w-0 flex-1">
              {f.polarity < 0 ? "not " : ""}
              {f.predicate === "brand_color" && /^[0-9a-f]{6}$/i.test(f.object) && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: `#${f.object}` }} />}
              {f.object}
            </span>
            <button type="button" onClick={() => void forget(f.id)} className="state btn btn-text !h-8 !px-3 opacity-0 focus-visible:opacity-100 group-hover:opacity-100">
              Forget
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
