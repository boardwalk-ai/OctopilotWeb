"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthService } from "@/services/AuthService";

type PromoCodeRow = {
  id: string;
  code: string;
  word_credits: number;
  humanizer_credits: number;
  source_credits: number;
  code_valid_until?: string | null;
  max_uses: number;
  current_uses: number;
  claimed_by?: string | null;
  is_active: boolean;
  created_at?: string | null;
};

type ReferralCodeRow = {
  id: string;
  owner_user_id: string;
  email: string;
  code: string;
  redeemed_count: number;
  max_uses: number;
  created_at?: string | null;
};

type ReferralClaim = {
  email: string;
  redeemed_at?: string | null;
};

type ReferralSettings = {
  referrer_word_credits: number;
  referrer_humanizer_credits: number;
  referrer_source_credits: number;
  referred_word_credits: number;
  referred_humanizer_credits: number;
  referred_source_credits: number;
};

type PromoAreaPanelProps = {
  refreshKey: number;
  mode: "promo" | "referral";
};

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";

function generateCode(length: number) {
  return Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await AuthService.getIdToken(true);
  if (!token) {
    throw new Error("You need to be signed in as an admin.");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "Admin request failed.");
  }

  return payload as T;
}

function SectionFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-white/8 bg-[#101010]">
      <div className="border-b border-white/8 px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">{title}</div>
        <div className="mt-2 text-sm leading-6 text-white/46">{description}</div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function PromoAreaPanel({ refreshKey, mode }: PromoAreaPanelProps) {
  const [promoCodeDraft, setPromoCodeDraft] = useState(() => generateCode(6));
  const [promoWordCredits, setPromoWordCredits] = useState(0);
  const [promoHumanizerCredits, setPromoHumanizerCredits] = useState(0);
  const [promoSourceCredits, setPromoSourceCredits] = useState(0);
  const [promoExpiry, setPromoExpiry] = useState("");
  const [promoCodes, setPromoCodes] = useState<PromoCodeRow[]>([]);
  const [referralCodes, setReferralCodes] = useState<ReferralCodeRow[]>([]);
  const [referralSettings, setReferralSettings] = useState<ReferralSettings>({
    referrer_word_credits: 100,
    referrer_humanizer_credits: 100,
    referrer_source_credits: 10,
    referred_word_credits: 100,
    referred_humanizer_credits: 100,
    referred_source_credits: 10,
  });
  const [claimsModal, setClaimsModal] = useState<{ code: string; claims: ReferralClaim[] } | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [isSavingPromo, setIsSavingPromo] = useState(false);
  const [isSavingReferralSettings, setIsSavingReferralSettings] = useState(false);
  const [deletingPromoId, setDeletingPromoId] = useState<string | null>(null);
  const [revealingReferralId, setRevealingReferralId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const promoRows = useMemo(() => promoCodes.map((code, index) => ({ ...code, no: index + 1 })), [promoCodes]);
  const referralRows = useMemo(() => referralCodes.map((code, index) => ({ ...code, no: index + 1 })), [referralCodes]);

  const referralSettingRows = [
    { key: "referrer_word_credits", label: "Owner Word" },
    { key: "referrer_humanizer_credits", label: "Owner Humanizer" },
    { key: "referrer_source_credits", label: "Owner Source" },
    { key: "referred_word_credits", label: "Claimant Word" },
    { key: "referred_humanizer_credits", label: "Claimant Humanizer" },
    { key: "referred_source_credits", label: "Claimant Source" },
  ] as const;

  const load = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const [promoPayload, referralSettingsPayload, referralCodesPayload] = await Promise.all([
        adminFetch<{ codes: PromoCodeRow[] }>("/backend/api/v1/promo/admin/codes"),
        adminFetch<ReferralSettings>("/backend/api/v1/referral/admin/settings"),
        adminFetch<{ referrals: ReferralCodeRow[] }>("/backend/api/v1/referral/admin/codes"),
      ]);

      setPromoCodes(promoPayload.codes || []);
      setReferralSettings(referralSettingsPayload);
      setReferralCodes(referralCodesPayload.referrals || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load promo tools.");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        void load();
      }
    };

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 15000);

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const handleCreatePromoCode = async () => {
    setIsSavingPromo(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await adminFetch<PromoCodeRow>("/backend/api/v1/promo/admin/codes", {
        method: "POST",
        body: JSON.stringify({
          code: promoCodeDraft,
          word_credits: promoWordCredits,
          humanizer_credits: promoHumanizerCredits,
          source_credits: promoSourceCredits,
          code_valid_until: promoExpiry ? new Date(promoExpiry).toISOString() : null,
          max_uses: 1,
        }),
      });

      setPromoCodes((current) => [payload, ...current]);
      setPromoCodeDraft(generateCode(6));
      setPromoWordCredits(0);
      setPromoHumanizerCredits(0);
      setPromoSourceCredits(0);
      setPromoExpiry("");
      setSuccess(`Promo code ${payload.code} created.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create promo code.");
    } finally {
      setIsSavingPromo(false);
    }
  };

  const handleDeletePromo = async (promoId: string) => {
    setDeletingPromoId(promoId);
    setError(null);
    setSuccess(null);
    try {
      const payload = await adminFetch<{ code: string; claimed_count: number }>(`/backend/api/v1/promo/admin/codes/${promoId}`, {
        method: "DELETE",
      });
      setPromoCodes((current) => current.filter((row) => row.id !== promoId));
      setSuccess(
        payload.claimed_count > 0
          ? `Promo code ${payload.code} deleted. Previously granted credits were preserved.`
          : `Promo code ${payload.code} deleted.`
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete promo code.");
    } finally {
      setDeletingPromoId(null);
    }
  };

  const handleSaveReferralSettings = async () => {
    setIsSavingReferralSettings(true);
    setError(null);
    setSuccess(null);
    try {
      await adminFetch("/backend/api/v1/referral/admin/settings", {
        method: "PUT",
        body: JSON.stringify(referralSettings),
      });
      setSuccess("Referral rewards updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update referral rewards.");
    } finally {
      setIsSavingReferralSettings(false);
    }
  };

  const handleRevealReferralClaims = async (row: ReferralCodeRow) => {
    setRevealingReferralId(row.id);
    setError(null);
    try {
      const payload = await adminFetch<{ claims: ReferralClaim[] }>(`/backend/api/v1/referral/admin/codes/${row.id}/claims`);
      setClaimsModal({ code: row.code, claims: payload.claims || [] });
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Failed to load referral claims.");
    } finally {
      setRevealingReferralId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="rounded-[22px] border border-emerald-500/25 bg-[#0d1510] px-5 py-4 text-sm text-emerald-100">{success}</div> : null}

      {mode === "promo" ? (
        <>
          <SectionFrame
            title="Promo Generator"
            description="Generate single-use promo codes with a custom 6-character code, explicit credit bundles, and an exact expiry timestamp."
          >
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Promo Code</label>
                  <div className="flex gap-3">
                    <input
                      value={promoCodeDraft}
                      onChange={(event) => setPromoCodeDraft(event.target.value.toUpperCase().replace(/[^A-Z1-9]/g, "").slice(0, 6))}
                      className="flex-1 rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-base font-semibold tracking-[0.26em] text-white outline-none transition focus:border-red-500/35"
                    />
                    <button
                      onClick={() => setPromoCodeDraft(generateCode(6))}
                      className="rounded-full border border-white/10 bg-[#141414] px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-red-500/35 hover:text-red-300"
                    >
                      Generate
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { label: "Word Credits", value: promoWordCredits, setValue: setPromoWordCredits },
                    { label: "Humanizer Credits", value: promoHumanizerCredits, setValue: setPromoHumanizerCredits },
                    { label: "Source Credits", value: promoSourceCredits, setValue: setPromoSourceCredits },
                  ].map((field) => (
                    <div key={field.label}>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">{field.label}</label>
                      <input
                        type="number"
                        min={0}
                        value={field.value}
                        onChange={(event) => field.setValue(Math.max(0, Number(event.target.value || 0)))}
                        className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#121212] p-4">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Expiry</label>
                <input
                  type="datetime-local"
                  value={promoExpiry}
                  onChange={(event) => setPromoExpiry(event.target.value)}
                  className="w-full rounded-[18px] border border-white/10 bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                />
                <p className="mt-3 text-xs leading-6 text-white/42">
                  Delete removes the server code. If a user already claimed it, their granted credits stay untouched.
                </p>
                <button
                  onClick={() => void handleCreatePromoCode()}
                  disabled={isSavingPromo}
                  className="mt-5 w-full rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingPromo ? "Creating..." : "Create Promo Code"}
                </button>
              </div>
            </div>
          </SectionFrame>

          <SectionFrame title="Promo Codes" description="Single-use reward codes with explicit expiry and claim visibility.">
            <div className="overflow-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/8">
                    {["No.", "Promo Code", "Expiry Date/Time", "Claimed By", "Actions"].map((label) => (
                      <th key={label} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {promoRows.length > 0 ? (
                    promoRows.map((row) => (
                      <tr key={row.id} className="border-b border-white/6 last:border-b-0">
                        <td className="px-3 py-4 text-sm text-white/76">{row.no}</td>
                        <td className="px-3 py-4">
                          <div className="text-sm font-semibold tracking-[0.22em] text-white">{row.code}</div>
                          <div className="mt-1 text-xs text-white/42">
                            {row.word_credits}W / {row.humanizer_credits}H / {row.source_credits}S
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm text-white/76">{formatDateTime(row.code_valid_until)}</td>
                        <td className="px-3 py-4 text-sm text-white/76">{row.claimed_by || "-"}</td>
                        <td className="px-3 py-4">
                          <button
                            onClick={() => void handleDeletePromo(row.id)}
                            disabled={deletingPromoId === row.id}
                            className="rounded-full border border-red-500/18 bg-[#160b0b] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:border-red-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingPromoId === row.id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-white/42">
                        {isBusy ? "Loading promo codes..." : "No promo codes created yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionFrame>
        </>
      ) : (
        <>
          <SectionFrame
            title="Referral Rewards"
            description="Every user gets one 5-character referral code. Owners cannot claim their own code, and each code can be claimed by up to 5 users."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {referralSettingRows.map((field) => (
                <div key={field.key}>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">{field.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={referralSettings[field.key]}
                    onChange={(event) =>
                      setReferralSettings((current) => ({
                        ...current,
                        [field.key]: Math.max(0, Number(event.target.value || 0)),
                      }))
                    }
                    className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => void handleSaveReferralSettings()}
                disabled={isSavingReferralSettings}
                className="rounded-full border border-white/10 bg-[#141414] px-5 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingReferralSettings ? "Saving..." : "Save Referral Rewards"}
              </button>
            </div>
          </SectionFrame>

          <SectionFrame title="Referral Codes" description="Unique 5-character user-owned codes with claim count visibility and claim reveal modal.">
            <div className="overflow-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/8">
                    {["No.", "Code", "Owned By", "Claimed Count", "Actions"].map((label) => (
                      <th key={label} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {referralRows.length > 0 ? (
                    referralRows.map((row) => (
                      <tr key={row.id} className="border-b border-white/6 last:border-b-0">
                        <td className="px-3 py-4 text-sm text-white/76">{row.no}</td>
                        <td className="px-3 py-4 text-sm font-semibold tracking-[0.22em] text-white">{row.code}</td>
                        <td className="px-3 py-4 text-sm text-white/76">{row.email}</td>
                        <td className="px-3 py-4 text-sm text-white/76">{row.redeemed_count}/{row.max_uses}</td>
                        <td className="px-3 py-4">
                          <button
                            onClick={() => void handleRevealReferralClaims(row)}
                            disabled={revealingReferralId === row.id}
                            className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/78 transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {revealingReferralId === row.id ? "Loading..." : "Reveal"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-white/42">
                        {isBusy ? "Loading referral codes..." : "No referral codes generated yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionFrame>
        </>
      )}

      {claimsModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/76 px-4 py-6">
          <div className="w-full max-w-[760px] rounded-[28px] border border-white/10 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Referral Claims</div>
                <div className="mt-2 text-[1.6rem] font-semibold tracking-[-0.05em] text-white">{claimsModal.code}</div>
              </div>
              <button
                onClick={() => setClaimsModal(null)}
                className="rounded-full border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white/72 transition hover:border-red-500/35 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              {claimsModal.claims.length > 0 ? (
                <div className="space-y-3">
                  {claimsModal.claims.map((claim, index) => (
                    <div key={`${claim.email}-${index}`} className="rounded-[18px] border border-white/8 bg-[#111111] px-4 py-4">
                      <div className="text-sm font-semibold text-white">{claim.email}</div>
                      <div className="mt-1 text-xs text-white/42">{formatDateTime(claim.redeemed_at)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-white/8 bg-[#101010] px-5 py-6 text-sm text-white/42">
                  Nobody has claimed this code yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
