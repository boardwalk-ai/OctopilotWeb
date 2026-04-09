"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthService } from "@/services/AuthService";

type AdminSystemSettingsPanelProps = {
  refreshKey: number;
};

type SettingRow = {
  key: string;
  value: string;
  description?: string | null;
  is_secret?: boolean;
  updated_at?: string | null;
};

type SettingField = {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
};

const GUEST_CREDIT_FIELDS: SettingField[] = [
  {
    key: "guest_word_credits",
    label: "Guest Word Credits",
    description: "Starter word credits granted to each newly created guest user.",
    defaultValue: 300,
  },
  {
    key: "guest_humanizer_credits",
    label: "Guest Humanizer Credits",
    description: "Starter humanizer credits granted to each newly created guest user.",
    defaultValue: 300,
  },
  {
    key: "guest_source_credits",
    label: "Guest Source Credits",
    description: "Starter source credits granted to each newly created guest user.",
    defaultValue: 30,
  },
];

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

function normalizeSettingValue(rawValue: string | undefined, fallback: number) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

export default function AdminSystemSettingsPanel({ refreshKey }: AdminSystemSettingsPanelProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});
  const [isBusy, setIsBusy] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsBusy(true);
    setError(null);

    try {
      const rows = await adminFetch<SettingRow[]>("/backend/api/v1/admin/settings");
      const nextSettings = rows.reduce<Record<string, string>>((accumulator, row) => {
        accumulator[row.key] = row.value;
        return accumulator;
      }, {});

      setSettings(nextSettings);
      setDraftValues(
        GUEST_CREDIT_FIELDS.reduce<Record<string, number>>((accumulator, field) => {
          accumulator[field.key] = normalizeSettingValue(nextSettings[field.key], field.defaultValue);
          return accumulator;
        }, {})
      );

      const relevantUpdates = rows
        .filter((row) => GUEST_CREDIT_FIELDS.some((field) => field.key === row.key) && row.updated_at)
        .map((row) => row.updated_at as string)
        .sort();
      setLastUpdatedAt(relevantUpdates[relevantUpdates.length - 1] || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load system settings.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, refreshKey]);

  const isDirty = useMemo(
    () =>
      GUEST_CREDIT_FIELDS.some(
        (field) => draftValues[field.key] !== normalizeSettingValue(settings[field.key], field.defaultValue)
      ),
    [draftValues, settings]
  );

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await Promise.all(
        GUEST_CREDIT_FIELDS.map((field) =>
          adminFetch<{ success: boolean; key: string }>(`/backend/api/v1/admin/settings/${field.key}`, {
            method: "PATCH",
            body: JSON.stringify({ value: String(Math.max(0, draftValues[field.key] ?? field.defaultValue)) }),
          })
        )
      );

      setSuccess("Guest starter credits updated. New users will receive the new amounts.");
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save guest starter credits.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="rounded-[22px] border border-emerald-500/25 bg-[#0d1510] px-5 py-4 text-sm text-emerald-100">{success}</div> : null}

      <section className="rounded-[26px] border border-white/8 bg-[#101010] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {GUEST_CREDIT_FIELDS.map((field) => (
            <div key={field.key} className="rounded-[20px] border border-white/8 bg-[#151515] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{field.label}</div>
              <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">
                {draftValues[field.key] ?? field.defaultValue}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[26px] border border-white/8 bg-[#101010]">
        <div className="border-b border-white/8 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Guest Starter Credits</div>
          <div className="mt-2 text-sm leading-6 text-white/46">
            These values apply to newly created guest accounts. Existing users keep their current balances unless you edit them separately.
          </div>
        </div>
        <div className="p-5">
          <div className="grid gap-4 md:grid-cols-3">
            {GUEST_CREDIT_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">{field.label}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draftValues[field.key] ?? field.defaultValue}
                  onChange={(event) =>
                    setDraftValues((current) => ({
                      ...current,
                      [field.key]: Math.max(0, Number(event.target.value || 0)),
                    }))
                  }
                  className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                />
                <div className="mt-2 text-xs leading-5 text-white/38">{field.description}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-white/38">
              {lastUpdatedAt ? `Last updated ${new Date(lastUpdatedAt).toLocaleString()}` : "Using default guest starter credit values."}
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={isBusy || isSaving || !isDirty}
              className="rounded-full border border-white/10 bg-[#141414] px-5 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? "Loading..." : isSaving ? "Saving..." : "Save Guest Credits"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
