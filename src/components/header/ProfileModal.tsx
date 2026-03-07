"use client";

import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { AuthService } from "@/services/AuthService";

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
  user: User | null;
};

function formatPlanName(user: User | null): string {
  if (!user) {
    return "Guest";
  }

  if (user.providerData.some((provider) => provider.providerId === "google.com")) {
    return "Google Access";
  }

  if (user.providerData.some((provider) => provider.providerId === "password")) {
    return "Email Access";
  }

  return "Starter";
}

function formatPlanExpiry(user: User | null): string {
  if (!user) {
    return "Not available";
  }

  return "Pending server sync";
}

function buildReferralCode(user: User | null): string {
  const seed = (user?.displayName || user?.email || "OCTOPILOT").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const head = (seed.slice(0, 4) || "OCTO").padEnd(4, "X");
  const tail = (seed.slice(-2) || "AI").padEnd(2, "0");
  return `${head}${tail}`;
}

function getProfilePhotoUrl(user: User | null): string | null {
  if (!user) {
    return null;
  }

  return user.photoURL || user.providerData.find((provider) => provider.photoURL)?.photoURL || null;
}

function PillOtpInput({
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
    <div className="flex flex-wrap items-center gap-2.5">
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
          className="h-12 w-10 rounded-[14px] border border-white/12 bg-white/[0.03] text-center text-sm font-semibold text-white outline-none transition focus:border-red-500/55 focus:bg-white/[0.06] sm:w-11 sm:text-base"
        />
      ))}
    </div>
  );
}

export default function ProfileModal({ open, onClose, user }: ProfileModalProps) {
  const [redeemCode, setRedeemCode] = useState("");
  const [referralRedeemCode, setReferralRedeemCode] = useState("");
  const [referralMode, setReferralMode] = useState<"refer" | "redeem">("refer");
  const [isSigningOut, setIsSigningOut] = useState(false);

  const initials = useMemo(() => {
    const label = user?.displayName || user?.email || "U";
    return label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U";
  }, [user]);

  const referralCode = useMemo(() => buildReferralCode(user), [user]);
  const profilePhotoUrl = useMemo(() => getProfilePhotoUrl(user), [user]);
  const [copyLabel, setCopyLabel] = useState("Copy");

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6 lg:px-8">
      <button
        type="button"
        aria-label="Close profile modal"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      <section className="relative z-10 w-full max-w-[min(92vw,74rem)] rounded-[34px] border border-white/10 bg-[#090909] p-4 shadow-[0_45px_120px_rgba(0,0,0,0.72)]">
        <div className="absolute inset-0 rounded-[34px] bg-[radial-gradient(circle_at_top,rgba(164,18,18,0.22),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_38%)]" />

        <div className="relative max-h-[min(86vh,46rem)] overflow-y-auto rounded-[28px] border border-white/8 bg-[#101010] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/42">Profile Access</p>
              <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-white sm:text-[2.5rem]">
                Your cockpit
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/60 transition hover:border-red-500/35 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
            <div className="rounded-[26px] border border-white/10 bg-[#151515] p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black text-xl font-semibold text-white">
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
                  <div className="truncate text-xl font-semibold text-white">{user?.displayName || "Octopilot User"}</div>
                  <div className="mt-1 truncate text-sm text-white/52">{user?.email || "Not signed in"}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <div className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-red-100">
                      {formatPlanName(user)}
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/58">
                      {user?.emailVerified ? "Verified" : "Unverified"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[24px] border border-white/10 bg-[#151515] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Plan Information</div>
                <div className="mt-3 text-lg font-semibold text-white">{formatPlanName(user)}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-[#151515] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Plan Expiration Date</div>
                <div className="mt-3 text-lg font-semibold text-white">{formatPlanExpiry(user)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
            <div className="rounded-[26px] border border-white/10 bg-[#151515] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Redeem Area</div>
              <div className="mt-4 flex flex-col items-start gap-4">
                <PillOtpInput length={6} value={redeemCode} onChange={setRedeemCode} />
                <button
                  type="button"
                  className="rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500"
                >
                  Redeem
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#151515] p-4">
              <p className="text-sm leading-7 text-white/72">
                <button
                  type="button"
                  onClick={() => setReferralMode("refer")}
                  className={`underline decoration-white/30 underline-offset-4 transition ${referralMode === "refer" ? "text-red-500" : "text-white/75 hover:text-white"}`}
                >
                  Refer Octopilot AI
                </button>{" "}
                to someone or{" "}
                <button
                  type="button"
                  onClick={() => setReferralMode("redeem")}
                  className={`underline decoration-white/30 underline-offset-4 transition ${referralMode === "redeem" ? "text-red-500" : "text-white/75 hover:text-white"}`}
                >
                  redeem your referral
                </button>
                ?
              </p>

              {referralMode === "refer" ? (
                <div className="mt-4 rounded-[22px] border border-red-500/18 bg-[#1a1010] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Your Referral Code</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-full border border-white/12 bg-black px-4 py-2 text-lg font-semibold tracking-[0.26em] text-white">
                      {referralCode}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(referralCode);
                        setCopyLabel("Copied");
                        window.setTimeout(() => setCopyLabel("Copy"), 1500);
                      }}
                      className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/80 transition hover:border-red-500/35 hover:text-white"
                    >
                      {copyLabel}
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/65">Share this with your friends for rewards.</p>
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-start gap-4">
                  <PillOtpInput length={5} value={referralRedeemCode} onChange={setReferralRedeemCode} />
                  <button
                    type="button"
                    className="rounded-full border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-red-500/35 hover:bg-white hover:text-red-500"
                  >
                    Redeem
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:bg-white hover:text-red-500"
            >
              Invoices
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
              className="rounded-full border border-red-500/60 bg-red-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500"
            >
              {isSigningOut ? "Logging out..." : "Log Out"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
