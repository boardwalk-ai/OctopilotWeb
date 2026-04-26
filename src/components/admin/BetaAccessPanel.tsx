"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthService } from "@/services/AuthService";

type BetaFeatureKey = "ghostwriter" | "octopilotSlides";

type BetaAccessEntry = {
  email: string;
  name: string;
  features: BetaFeatureKey[];
  addedAt: string;
};

type BetaAccessPayload = {
  list: BetaAccessEntry[];
  supportedFeatures: BetaFeatureKey[];
};

type BetaAccessPanelProps = {
  refreshKey: number;
};

const FEATURE_LABELS: Record<BetaFeatureKey, string> = {
  ghostwriter: "Ghostwriter",
  octopilotSlides: "OctopilotSlides",
};

const DEFAULT_FEATURES: BetaFeatureKey[] = ["ghostwriter", "octopilotSlides"];

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const performFetch = async (forceRefresh: boolean) => {
    const token = await AuthService.getIdToken(forceRefresh);
    if (!token) {
      throw new Error("You need to be signed in as an admin.");
    }

    return fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
  };

  let response = await performFetch(false);
  if (response.status === 401) {
    response = await performFetch(true);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail?.message || payload.error || "Admin request failed.";
    throw new Error(message);
  }

  return payload as T;
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function BetaAccessPanel({ refreshKey }: BetaAccessPanelProps) {
  const [entries, setEntries] = useState<BetaAccessEntry[]>([]);
  const [supportedFeatures, setSupportedFeatures] = useState<BetaFeatureKey[]>(DEFAULT_FEATURES);
  const [searchValue, setSearchValue] = useState("");
  const [pendingFeatures, setPendingFeatures] = useState<BetaFeatureKey[]>(DEFAULT_FEATURES);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await adminFetch<BetaAccessPayload>("/api/admin/beta-access");
      setEntries(payload.list || []);
      if (Array.isArray(payload.supportedFeatures) && payload.supportedFeatures.length > 0) {
        setSupportedFeatures(payload.supportedFeatures);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load beta access list.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshKey]);

  const filteredEntries = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      entry.email.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query),
    );
  }, [entries, searchValue]);

  const togglePendingFeature = (feature: BetaFeatureKey) => {
    setPendingFeatures((current) =>
      current.includes(feature) ? current.filter((value) => value !== feature) : [...current, feature],
    );
  };

  const handleAdd = async () => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setError("Type an email or name in the search box first.");
      return;
    }

    if (!looksLikeEmail(trimmed)) {
      setError("Please type a full email address (for example name@example.com) to grant access.");
      return;
    }

    if (pendingFeatures.length === 0) {
      setError("Select at least one feature to grant before adding.");
      return;
    }

    setIsAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await adminFetch<{ list: BetaAccessEntry[]; added: BetaAccessEntry }>("/api/admin/beta-access", {
        method: "POST",
        body: JSON.stringify({
          email: trimmed,
          features: pendingFeatures,
        }),
      });
      setEntries(payload.list);
      setSearchValue("");
      setSuccess(`Granted beta access to ${payload.added.email}.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add beta access.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (email: string) => {
    setRemovingEmail(email);
    setError(null);
    setSuccess(null);
    try {
      const payload = await adminFetch<{ list: BetaAccessEntry[] }>(
        `/api/admin/beta-access?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      setEntries(payload.list);
      setSuccess(`Revoked beta access for ${email}.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove beta access.");
    } finally {
      setRemovingEmail(null);
    }
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-[22px] border border-emerald-500/25 bg-[#0d1510] px-5 py-4 text-sm text-emerald-100">{success}</div>
      ) : null}

      <section className="rounded-[26px] border border-white/8 bg-[#101010]">
        <div className="border-b border-white/8 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Grant Beta Access</div>
          <div className="mt-2 text-sm leading-6 text-white/46">
            Type an email below and click Add to give that account access to gated features (Ghostwriter, OctopilotSlides). The
            list also acts as a search filter for the table.
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1 rounded-[20px] border border-white/8 bg-[#151515] px-4 py-3">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Email or name</span>
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search the list or type a new email"
                className="mt-2 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/22"
              />
            </div>

            <button
              onClick={() => void handleAdd()}
              disabled={isAdding}
              className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-[120px]"
            >
              {isAdding ? "Adding..." : "Add"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Features</div>
            <div className="flex flex-wrap gap-2">
              {supportedFeatures.map((feature) => {
                const isActive = pendingFeatures.includes(feature);
                return (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => togglePendingFeature(feature)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                      isActive
                        ? "bg-red-500 text-black"
                        : "border border-white/10 bg-[#141414] text-white/62 hover:border-red-500/35 hover:text-white"
                    }`}
                  >
                    {FEATURE_LABELS[feature] ?? feature}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 text-xs text-white/38">
            New users only need to sign in with the email above to see the feature on their Methodology page.
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-white/8 bg-[#101010]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Beta Access List</div>
            <div className="mt-2 text-sm leading-6 text-white/46">
              {entries.length === 0
                ? "No accounts have been granted beta access yet."
                : `${entries.length} account${entries.length === 1 ? "" : "s"} with beta access.`}
            </div>
          </div>
          <button
            onClick={() => void loadList()}
            disabled={isLoading}
            className="rounded-full border border-white/10 bg-[#131313] px-4 py-2 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-white/8 bg-[#0c0c0c]">
                {["No", "Email", "Features", "Added", "Actions"].map((column) => (
                  <th key={column} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-white/38">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry, rowIndex) => (
                  <tr key={entry.email} className="border-b border-white/6 last:border-b-0">
                    <td className="px-4 py-4 text-sm leading-6 text-white/78">{rowIndex + 1}</td>
                    <td className="px-4 py-4 text-sm leading-6 text-white/78">
                      <div className="font-semibold text-white">{entry.email}</div>
                      {entry.name ? <div className="mt-0.5 text-xs text-white/45">{entry.name}</div> : null}
                    </td>
                    <td className="px-4 py-4 text-sm leading-6 text-white/78">
                      <div className="flex flex-wrap gap-1.5">
                        {entry.features.length === 0 ? (
                          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
                            None
                          </span>
                        ) : (
                          entry.features.map((feature) => (
                            <span
                              key={feature}
                              className="rounded-full border border-red-500/25 bg-[#150b0b] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200"
                            >
                              {FEATURE_LABELS[feature] ?? feature}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm leading-6 text-white/78">{formatDateTime(entry.addedAt)}</td>
                    <td className="px-4 py-4 text-sm leading-6 text-white/78">
                      <button
                        onClick={() => void handleRemove(entry.email)}
                        disabled={removingEmail === entry.email}
                        className="rounded-full border border-red-500/18 bg-[#160b0b] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:border-red-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removingEmail === entry.email ? "Removing..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-white/42">
                    {isLoading
                      ? "Loading beta access list..."
                      : entries.length === 0
                        ? "No accounts have been granted beta access yet. Add the first one above."
                        : "No entries match the current search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
