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
    <div className="os-pop absolute left-3 right-3 top-[60px] z-30 rounded-2xl border border-white/10 bg-[#121212]/95 p-3.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12.5px] font-semibold text-white">What OctoSlides remembers</p>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-0.5 text-white/40 transition hover:bg-white/[0.08] hover:text-white">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-white/40">Things you told the designer about yourself or your brand. It uses them in every new deck. Remove anything that is wrong.</p>
      {error && <p className="text-[12px] text-amber-200/80">{error}</p>}
      {facts === null && !error && <p className="text-[12px] text-white/40">Loading…</p>}
      {facts?.length === 0 && <p className="py-2 text-[12px] text-white/40">Nothing yet. Tell the designer things like “our brand color is navy” or “no stock photos”.</p>}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {facts?.map((f) => (
          <li key={f.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]">
            <span className="mt-px w-[86px] shrink-0 text-[10.5px] uppercase tracking-wider text-white/35">{LABEL[f.predicate] ?? f.predicate}</span>
            <span className="min-w-0 flex-1 text-[12.5px] text-white/85">
              {f.polarity < 0 ? "not " : ""}
              {f.predicate === "brand_color" && /^[0-9a-f]{6}$/i.test(f.object) && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: `#${f.object}` }} />}
              {f.object}
            </span>
            <button type="button" onClick={() => void forget(f.id)} className="shrink-0 text-[11px] text-white/30 opacity-0 transition hover:text-red-300 group-hover:opacity-100">
              Forget
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
