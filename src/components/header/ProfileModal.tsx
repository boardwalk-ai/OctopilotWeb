"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { AccountStateService } from "@/services/AccountStateService";
import { AuthService } from "@/services/AuthService";
import { OctopilotAPIService } from "@/services/OctopilotAPIService";
import { StreamService } from "@/services/StreamService";

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
  user: User | null;
};

type MeResponse = {
  plan?: string | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  billing_period?: string | null;
  word_credits?: number | null;
  humanizer_credits?: number | null;
  source_credits?: number | null;
};

type StreamCreditsPayload = {
  plan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndDate?: string | null;
  wordCredits?: number | null;
  humanizerCredits?: number | null;
  sourceCredits?: number | null;
};

type ProfileState = {
  planName: string;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
};

function getFallbackPlanName(user: User | null): string {
  if (!user) return "Guest";
  if (user.providerData.some((provider) => provider.providerId === "google.com")) return "Google Access";
  if (user.providerData.some((provider) => provider.providerId === "password")) return "Email Access";
  return "Starter";
}

function getDisplayPlanName(planName: string | null | undefined): string {
  const normalized = (planName || "").trim();
  if (!normalized) return "Guest";
  if (/^guest/i.test(normalized)) return "Guest";
  return normalized.replace(/\s+plan$/i, "");
}

function formatExpiryDate(dateString: string | null | undefined): string {
  if (!dateString) return "No active expiry date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "No active expiry date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPlanStatusCopy(profile: ProfileState): { title: string; detail: string } {
  const planName = getDisplayPlanName(profile.planName);
  const status = (profile.subscriptionStatus || "").toLowerCase();
  const expiry = formatExpiryDate(profile.subscriptionEndDate);

  if (status === "cancelled") {
    return {
      title: `${planName} cancellation scheduled`,
      detail: `You cancelled renewal for this plan. Your ${planName} access stays active until ${expiry}, then your account will return to Guest access.`,
    };
  }

  if (status === "billing_retry") {
    return {
      title: `${planName} payment issue`,
      detail: `Stripe could not renew this subscription. Your access is still available for now, but it may end on ${expiry} if billing is not fixed.`,
    };
  }

  if (status === "active" || status === "trial") {
    return {
      title: planName,
      detail: `Your subscription is active right now. The current billing period ends on ${expiry}. If you cancel renewal, access still remains until that date.`,
    };
  }

  return {
    title: planName,
    detail: profile.subscriptionEndDate
      ? `Your current access is scheduled to end on ${expiry}.`
      : "You are currently on guest access with no active subscription.",
  };
}

function buildReferralCode(user: User | null): string {
  const seed = (user?.displayName || user?.email || "OCTOPILOT").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const head = (seed.slice(0, 4) || "OCTO").padEnd(4, "X");
  const tail = (seed.slice(-2) || "AI").padEnd(2, "0");
  return `${head}${tail}`;
}

function getProfilePhotoUrl(user: User | null): string | null {
  if (!user) return null;
  return user.photoURL || user.providerData.find((provider) => provider.photoURL)?.photoURL || null;
}

function CodeBoxes({
  length,
  value,
  onChange,
}: {
  length: number;
  value: string;
  onChange: (next: string) => void;
}) {
  const chars = Array.from({ length }, (_, index) => value[index] || "");

  return (
    <div className="flex flex-wrap gap-2">
      {chars.map((char, index) => (
        <input
          key={`${length}-${index}`}
          inputMode="numeric"
          maxLength={1}
          value={char}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            const next = value.split("");
            next[index] = digit;
            onChange(next.join("").slice(0, length));

            if (digit && event.currentTarget.nextElementSibling instanceof HTMLInputElement) {
              event.currentTarget.nextElementSibling.focus();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !char && event.currentTarget.previousElementSibling instanceof HTMLInputElement) {
              event.currentTarget.previousElementSibling.focus();
            }
          }}
          className="h-12 w-11 rounded-xl border border-white/10 bg-[#111111] text-center text-sm font-semibold text-white outline-none transition focus:border-red-500 focus:bg-[#161616]"
        />
      ))}
    </div>
  );
}

function Panel({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <section
      className={`rounded-[26px] border p-4 ${
        tone === "accent"
          ? "border-red-500/20 bg-[#160d0d]"
          : "border-white/8 bg-[#111111]"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/32">{title}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ProfileModal({ open, onClose, user }: ProfileModalProps) {
  const cachedSnapshot = AccountStateService.read();
  const [redeemCode, setRedeemCode] = useState("");
  const [referralRedeemCode, setReferralRedeemCode] = useState("");
  const [referralMode, setReferralMode] = useState<"refer" | "redeem">("refer");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOpeningInvoices, setIsOpeningInvoices] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>({
    planName: getDisplayPlanName(cachedSnapshot?.plan || getFallbackPlanName(user)),
    subscriptionStatus: cachedSnapshot?.subscription_status ?? cachedSnapshot?.subscriptionStatus ?? "guest",
    subscriptionEndDate: cachedSnapshot?.subscription_end_date ?? cachedSnapshot?.subscriptionEndDate ?? null,
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const profilePhotoUrl = useMemo(() => getProfilePhotoUrl(user), [user]);
  const referralCode = useMemo(() => buildReferralCode(user), [user]);
  const planStatusCopy = useMemo(() => getPlanStatusCopy(profileState), [profileState]);
  const initials = useMemo(() => {
    const label = user?.displayName || user?.email || "U";
    return label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U";
  }, [user]);

  useEffect(() => {
    const resetInvoiceState = () => {
      setIsOpeningInvoices(false);
      setInvoiceError(null);
    };

    if (!open) {
      resetInvoiceState();
      return;
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        resetInvoiceState();
      }
    };

    const handlePageShow = () => {
      resetInvoiceState();
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    let stopStream: (() => void) | undefined;

    if (!open) {
      return;
    }

    const applyPayload = (payload?: MeResponse | StreamCreditsPayload | null) => {
      if (cancelled || !payload) {
        return;
      }

      AccountStateService.write(payload);
      const mePayload = payload as MeResponse;
      const streamPayload = payload as StreamCreditsPayload;
      const nextPlan = mePayload.plan ?? streamPayload.plan;
      const nextStatus = mePayload.subscription_status ?? streamPayload.subscriptionStatus;
      const nextEndDate = mePayload.subscription_end_date ?? streamPayload.subscriptionEndDate;

      setProfileState((current) => ({
        planName: getDisplayPlanName(nextPlan || current.planName || getFallbackPlanName(user)),
        subscriptionStatus: nextStatus || current.subscriptionStatus || "guest",
        subscriptionEndDate: nextEndDate || current.subscriptionEndDate || null,
      }));
    };

    const boot = async () => {
      const currentUser = AuthService.getCurrentUser();

      if (!currentUser) {
        AccountStateService.clear();
        setProfileState({
          planName: getFallbackPlanName(currentUser),
          subscriptionStatus: "guest",
          subscriptionEndDate: null,
        });
        return;
      }

      setIsLoadingProfile(true);
      try {
        const me = await OctopilotAPIService.get<MeResponse>("/api/v1/me");
        applyPayload(me);
      } catch {
        // Fallback state is already set above.
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }

      try {
        stopStream = await StreamService.connect({
          onEvent: (event) => {
            if (event.type !== "sync_credits" || !event.data) {
              return;
            }

            try {
              const parsed = JSON.parse(event.data) as StreamCreditsPayload;
              applyPayload(parsed);
            } catch {
              // Ignore malformed realtime events.
            }
          },
        });
      } catch {
        // Streaming is optional here.
      }
    };

    void boot();

    return () => {
      cancelled = true;
      stopStream?.();
    };
  }, [open, user]);

  async function openInvoices() {
    try {
      setInvoiceError(null);
      setIsOpeningInvoices(true);

      if (!AuthService.getCurrentUser()) {
        throw new Error("Sign in first before opening invoices.");
      }

      const response = await OctopilotAPIService.post<{ url: string }>("/api/v1/billing/portal-session");
      window.location.assign(response.url);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Could not open invoices.");
      setIsOpeningInvoices(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6 lg:px-8">
      <button
        type="button"
        aria-label="Close profile modal"
        className="absolute inset-0 bg-black/78"
        onClick={onClose}
      />

      <section className="relative z-10 w-full max-w-[min(94vw,74rem)] overflow-hidden rounded-[34px] border border-white/10 bg-[#080808] shadow-[0_45px_120px_rgba(0,0,0,0.8)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

        <div className="max-h-[88vh] overflow-y-auto p-5 sm:p-6 lg:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/35">Profile Access</p>
              <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-white sm:text-[2.6rem]">Your cockpit</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#111111] text-white/60 transition hover:border-red-500/40 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.28fr_0.72fr]">
            <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black text-2xl font-semibold text-white">
                  {profilePhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profilePhotoUrl}
                      alt={user?.displayName || user?.email || "User"}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    initials
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[2rem] font-semibold tracking-[-0.04em] text-white">
                    {user?.displayName || "Octopilot User"}
                  </div>
                  <div className="mt-1 truncate text-base text-white/50">{user?.email || "Not signed in"}</div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <div className="rounded-full border border-red-500/30 bg-[#1a0d0d] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-100">
                      {profileState.planName}
                    </div>
                    <div className="rounded-full border border-white/10 bg-[#161616] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                      {user?.emailVerified ? "Verified" : "Unverified"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4">
              <Panel title="Plan Information">
                <div className="text-3xl font-semibold tracking-[-0.04em] text-white">
                  {isLoadingProfile ? "Loading..." : planStatusCopy.title}
                </div>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  {planStatusCopy.detail}
                </p>
              </Panel>
              <Panel title="Plan Expiration Date">
                <div className="text-2xl font-semibold tracking-[-0.04em] text-white">
                  {isLoadingProfile ? "Loading..." : formatExpiryDate(profileState.subscriptionEndDate)}
                </div>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  {profileState.subscriptionStatus === "cancelled"
                    ? "Renewal has been cancelled. You can keep using the paid plan until the date above, then the account will downgrade automatically."
                    : profileState.subscriptionStatus === "active" || profileState.subscriptionStatus === "trial"
                      ? "This is the end of the current billing period. If renewal stays on, Stripe will extend it automatically."
                      : "No active paid subscription expiry is currently stored."}
                </p>
              </Panel>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
            <Panel title="Redeem Area">
              <div className="flex flex-col gap-4">
                <CodeBoxes length={6} value={redeemCode} onChange={setRedeemCode} />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500"
                  >
                    Redeem
                  </button>
                  <span className="text-sm text-white/40">Six-digit access code</span>
                </div>
              </div>
            </Panel>

            <Panel title="Referral" tone="accent">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1.05rem] leading-7 text-white/72">
                <button
                  type="button"
                  onClick={() => setReferralMode("refer")}
                  className={`font-medium underline underline-offset-4 transition ${referralMode === "refer" ? "text-red-500" : "text-white/82"}`}
                >
                  Refer Octopilot AI
                </button>
                <span>to someone or</span>
                <button
                  type="button"
                  onClick={() => setReferralMode("redeem")}
                  className={`font-medium underline underline-offset-4 transition ${referralMode === "redeem" ? "text-red-500" : "text-white/82"}`}
                >
                  redeem your referral
                </button>
                <span>?</span>
              </div>

              {referralMode === "refer" ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[22px] border border-red-500/18 bg-[#100b0b] px-4 py-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/32">Your Referral Code</div>
                    <div className="mt-2 inline-flex rounded-xl border border-white/10 bg-black px-4 py-3 text-xl font-semibold tracking-[0.22em] text-white">
                      {referralCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(referralCode);
                      setCopyLabel("Copied");
                      window.setTimeout(() => setCopyLabel("Copy"), 1500);
                    }}
                    className="rounded-full border border-white/10 bg-[#171717] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.24em] text-white/80 transition hover:border-red-500/35 hover:text-white"
                  >
                    {copyLabel}
                  </button>
                  <p className="basis-full text-sm leading-6 text-white/52">Share this with your friends for rewards.</p>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-4">
                  <CodeBoxes length={5} value={referralRedeemCode} onChange={setReferralRedeemCode} />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-white/10 bg-[#171717] px-6 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:bg-white hover:text-red-500"
                    >
                      Redeem Referral
                    </button>
                    <span className="text-sm text-white/40">Five-digit referral code</span>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void openInvoices()}
              className="rounded-full border border-white/10 bg-[#121212] px-6 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-400"
            >
              {isOpeningInvoices ? "Opening invoices..." : "Invoices"}
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsSigningOut(true);
                try {
                  await AuthService.signOut();
                } finally {
                  setIsSigningOut(false);
                  onClose();
                }
              }}
              className="rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500"
            >
              {isSigningOut ? "Logging out..." : "Log Out"}
            </button>
          </div>

          {invoiceError ? (
            <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {invoiceError}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
