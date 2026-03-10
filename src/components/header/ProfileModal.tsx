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

type ReferralCodeResponse = {
  code: string;
  current_uses?: number;
  max_uses?: number;
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
          inputMode="text"
          maxLength={1}
          value={char}
          onChange={(event) => {
            const digit = event.target.value.toUpperCase().replace(/[^A-Z1-9]/g, "").slice(-1);
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
      className={`relative overflow-hidden rounded-2xl border p-4 ${tone === "accent"
          ? "border-red-500/20 bg-[#110b0b]"
          : "border-white/8 bg-[#111111]"
        }`}
    >
      {tone === "accent" && (
        <span className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-red-500/60 via-red-500/20 to-transparent" />
      )}
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.25em] text-white/30">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ProfileModal({ open, onClose, user }: ProfileModalProps) {
  const [authReadyUser, setAuthReadyUser] = useState<ReturnType<typeof AuthService.getCurrentUser>>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [referralRedeemCode, setReferralRedeemCode] = useState("");
  const [referralMode, setReferralMode] = useState<"refer" | "redeem">("refer");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOpeningInvoices, setIsOpeningInvoices] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>({
    planName: getDisplayPlanName(getFallbackPlanName(user)),
    subscriptionStatus: "guest",
    subscriptionEndDate: null,
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [referralCode, setReferralCode] = useState("-----");
  const [referralCurrentUses, setReferralCurrentUses] = useState(0);
  const [referralMaxUses, setReferralMaxUses] = useState(5);
  const [isLoadingReferralCode, setIsLoadingReferralCode] = useState(false);
  const [isRedeemingPromo, setIsRedeemingPromo] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isRedeemingReferral, setIsRedeemingReferral] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);

  const profilePhotoUrl = useMemo(() => getProfilePhotoUrl(user), [user]);
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
    const snapshot = AccountStateService.read();
    if (snapshot) {
      setProfileState({
        planName: getDisplayPlanName(snapshot.plan || getFallbackPlanName(user)),
        subscriptionStatus: snapshot.subscription_status ?? snapshot.subscriptionStatus ?? "guest",
        subscriptionEndDate: snapshot.subscription_end_date ?? snapshot.subscriptionEndDate ?? null,
      });
    }

    setAuthReadyUser(AuthService.getCurrentUser());
    return AuthService.subscribe((nextUser) => {
      setAuthReadyUser(nextUser);
    });
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
    if (!open) {
      setPromoMessage(null);
      setPromoError(null);
      setReferralMessage(null);
      setReferralError(null);
      return;
    }

    if (!authReadyUser) {
      setReferralCode("-----");
      setReferralCurrentUses(0);
      setReferralMaxUses(5);
      return;
    }

    let cancelled = false;

    const loadReferralCode = async () => {
      setIsLoadingReferralCode(true);
      setReferralError(null);
      try {
        const response = await OctopilotAPIService.post<ReferralCodeResponse>("/api/v1/referral/generate");
        if (cancelled) {
          return;
        }
        setReferralCode(response.code || "-----");
        setReferralCurrentUses(response.current_uses ?? 0);
        setReferralMaxUses(response.max_uses ?? 5);
      } catch (error) {
        if (!cancelled) {
          setReferralError(error instanceof Error ? error.message : "Could not load your referral code.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingReferralCode(false);
        }
      }
    };

    void loadReferralCode();

    return () => {
      cancelled = true;
    };
  }, [authReadyUser, open]);

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
      const currentUser = authReadyUser;

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
  }, [authReadyUser, open, user]);

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

  async function redeemPromoCode() {
    if (redeemCode.length !== 6) {
      setPromoError("Enter the full 6-character promo code first.");
      setPromoMessage(null);
      return;
    }

    setIsRedeemingPromo(true);
    setPromoError(null);
    setPromoMessage(null);

    try {
      await OctopilotAPIService.post("/api/v1/promo/redeem", { code: redeemCode });
      setRedeemCode("");
      setPromoMessage("Promo code redeemed. Credits were added to the account.");
    } catch (error) {
      setPromoError(error instanceof Error ? error.message : "Could not redeem this promo code.");
    } finally {
      setIsRedeemingPromo(false);
    }
  }

  async function redeemReferralCode() {
    if (referralRedeemCode.length !== 5) {
      setReferralError("Enter the full 5-character referral code first.");
      setReferralMessage(null);
      return;
    }

    setIsRedeemingReferral(true);
    setReferralError(null);
    setReferralMessage(null);

    try {
      await OctopilotAPIService.post("/api/v1/referral/submit", { code: referralRedeemCode });
      setReferralRedeemCode("");
      setReferralMessage("Referral code redeemed. Rewards were added for both accounts.");
    } catch (error) {
      setReferralError(error instanceof Error ? error.message : "Could not redeem this referral code.");
    } finally {
      setIsRedeemingReferral(false);
    }
  }

  if (!open) {
    return null;
  }

  const statusDot =
    profileState.subscriptionStatus === "active" || profileState.subscriptionStatus === "trial"
      ? "bg-emerald-400"
      : profileState.subscriptionStatus === "cancelled"
        ? "bg-amber-400"
        : profileState.subscriptionStatus === "billing_retry"
          ? "bg-red-400"
          : "bg-neutral-500";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6 lg:px-8">
      <button
        type="button"
        aria-label="Close profile modal"
        className="absolute inset-0 bg-black/78 backdrop-blur-sm"
        onClick={onClose}
      />

      <section className="relative z-10 w-full max-w-[min(94vw,72rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_45px_120px_rgba(0,0,0,0.8)]">
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

        <div className="max-h-[90vh] overflow-y-auto p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[1.3rem] font-bold tracking-tight text-red-500">Profile</span>
              <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.2em] text-neutral-500">
                Account
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.7rem] text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* User card + Plan info — top row */}
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
            {/* User card */}
            <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#111]">
              {/* Accent stripe */}
              <div className="h-16 bg-gradient-to-r from-red-500/20 via-red-500/8 to-transparent" />
              <div className="-mt-8 px-5 pb-5">
                <div className="flex items-end gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#111] bg-black text-lg font-bold text-white shadow-lg ring-2 ring-white/10">
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
                  <div className="min-w-0 flex-1 pb-0.5">
                    <div className="truncate text-[1.1rem] font-bold tracking-tight text-white">
                      {user?.displayName || "Octopilot User"}
                    </div>
                    <div className="truncate text-[0.78rem] text-neutral-500">{user?.email || "Not signed in"}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-red-300">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                    {profileState.planName}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] ${user?.emailVerified
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                      : "border-white/10 bg-white/5 text-neutral-500"
                    }`}>
                    {user?.emailVerified ? "✓ Verified" : "Unverified"}
                  </span>
                </div>
              </div>
            </div>

            {/* Plan info & expiry */}
            <div className="grid gap-3">
              <Panel title="Plan Information">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusDot}`} />
                  <span className="text-[1.1rem] font-bold tracking-tight text-white">
                    {isLoadingProfile ? "Loading..." : planStatusCopy.title}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.74rem] leading-[1.6] text-neutral-500">
                  {planStatusCopy.detail}
                </p>
              </Panel>
              <Panel title="Billing Period Ends">
                <div className="text-[1.05rem] font-bold tracking-tight text-white">
                  {isLoadingProfile ? "Loading..." : formatExpiryDate(profileState.subscriptionEndDate)}
                </div>
                <p className="mt-1.5 text-[0.74rem] leading-[1.6] text-neutral-500">
                  {profileState.subscriptionStatus === "cancelled"
                    ? "Renewal has been cancelled. Access stays active until the date above."
                    : profileState.subscriptionStatus === "active" || profileState.subscriptionStatus === "trial"
                      ? "If renewal stays on, Stripe will extend it automatically."
                      : "No active paid subscription expiry is currently stored."}
                </p>
              </Panel>
            </div>
          </div>

          {/* Redeem + Referral — bottom row */}
          <div className="mt-4 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
            <Panel title="Redeem Code">
              <div className="flex flex-col gap-3">
                <CodeBoxes length={6} value={redeemCode} onChange={setRedeemCode} />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void redeemPromoCode()}
                    disabled={isRedeemingPromo}
                    className="rounded-full bg-red-500 px-5 py-2 text-[0.72rem] font-bold text-black transition hover:bg-white hover:text-red-500"
                  >
                    {isRedeemingPromo ? "Redeeming..." : "Redeem"}
                  </button>
                  <span className="text-[0.68rem] text-neutral-500">Six-digit access code</span>
                </div>
                {promoMessage ? <div className="text-[0.7rem] leading-6 text-emerald-300">{promoMessage}</div> : null}
                {promoError ? <div className="text-[0.7rem] leading-6 text-red-300">{promoError}</div> : null}
              </div>
            </Panel>

            <Panel title="Referral Program" tone="accent">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem] leading-relaxed text-neutral-400">
                <button
                  type="button"
                  onClick={() => setReferralMode("refer")}
                  className={`font-semibold underline underline-offset-4 transition ${referralMode === "refer" ? "text-red-400" : "text-neutral-300 hover:text-white"}`}
                >
                  Refer Octopilot AI
                </button>
                <span>to someone or</span>
                <button
                  type="button"
                  onClick={() => setReferralMode("redeem")}
                  className={`font-semibold underline underline-offset-4 transition ${referralMode === "redeem" ? "text-red-400" : "text-neutral-300 hover:text-white"}`}
                >
                  redeem your referral
                </button>
                <span>?</span>
              </div>

              {referralMode === "refer" ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-3">
                  <div>
                    <p className="text-[0.54rem] font-bold uppercase tracking-[0.22em] text-neutral-500">Your Code</p>
                    <div className="mt-1.5 inline-flex rounded-lg border border-white/10 bg-black px-3.5 py-2 text-base font-bold tracking-[0.2em] text-white">
                      {isLoadingReferralCode ? "....." : referralCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(referralCode);
                      setCopyLabel("Copied!");
                      window.setTimeout(() => setCopyLabel("Copy"), 1500);
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-neutral-400 transition hover:border-red-500/30 hover:text-white"
                  >
                    {copyLabel}
                  </button>
                  <p className="basis-full text-[0.72rem] leading-relaxed text-neutral-500">
                    Share this code with friends to earn bonus credits. Claimed: {referralCurrentUses}/{referralMaxUses}
                  </p>
                  {referralError ? <div className="basis-full text-[0.7rem] leading-6 text-red-300">{referralError}</div> : null}
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <CodeBoxes length={5} value={referralRedeemCode} onChange={setReferralRedeemCode} />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void redeemReferralCode()}
                      disabled={isRedeemingReferral}
                      className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-[0.72rem] font-bold text-white transition hover:border-red-500/30 hover:bg-white hover:text-red-500"
                    >
                      {isRedeemingReferral ? "Redeeming..." : "Redeem Referral"}
                    </button>
                    <span className="text-[0.68rem] text-neutral-500">Five-digit referral code</span>
                  </div>
                  {referralMessage ? <div className="text-[0.7rem] leading-6 text-emerald-300">{referralMessage}</div> : null}
                  {referralError ? <div className="text-[0.7rem] leading-6 text-red-300">{referralError}</div> : null}
                </div>
              )}
            </Panel>
          </div>

          {/* Bottom action bar */}
          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/6 bg-white/[0.02] px-5 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openInvoices()}
                disabled={isOpeningInvoices}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.72rem] font-semibold text-neutral-300 transition hover:border-white/20 hover:text-white"
              >
                {isOpeningInvoices ? "Opening..." : "Invoices & Billing"}
              </button>
            </div>
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
              className="rounded-full bg-red-500 px-5 py-2 text-[0.72rem] font-bold text-black transition hover:bg-white hover:text-red-500"
            >
              {isSigningOut ? "Logging out..." : "Log Out"}
            </button>
          </div>

          {invoiceError ? (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[0.74rem] text-red-300">
              {invoiceError}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
