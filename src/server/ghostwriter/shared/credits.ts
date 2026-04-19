// Server-side credit deduction for the agentic Ghostwriter pipeline.
//
// The legacy CreditService lives on the client (uses fetchWithUserAuthorization
// which needs the browser session). Agentic tools run server-side, so we call
// the Octopilot API directly using the auth token stored on the AgentRun.
//
// Deduction points:
//   write_essay    → word credits   (based on ctx.draftSettings.wordCount)
//   scrape_sources → source credits (1 per successfully scraped URL)
//   humanize_essay → humanizer credits (based on essay word count)

import { getApiBaseUrl } from "@/server/backendConfig";

export type CreditType = "word" | "humanizer" | "source";

// 10 words = 1 credit, minimum 1.
export function creditsFromWords(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / 10));
}

export function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// Deduct credits server-side. Throws a CreditDeductionError if the account
// has insufficient credits or the API call fails.
// idempotencyKey prevents double-deduction on tool retry — use a key that is
// stable within a run+tool invocation (e.g. `${run.id}:word`).
export async function deductCredits(
  authToken: string,
  creditType: CreditType,
  amount: number,
  idempotencyKey?: string,
): Promise<void> {
  if (amount <= 0) return;

  const url = `${getApiBaseUrl()}/api/v1/me/credits/deduct`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authToken,
    },
    body: JSON.stringify({
      credit_type: creditType,
      amount,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.detail === "string"
          ? body.detail
          : `Credit deduction failed: ${response.status}`;
    throw new CreditDeductionError(message, creditType, amount);
  }
}

export class CreditDeductionError extends Error {
  readonly creditType: CreditType;
  readonly amount: number;

  constructor(message: string, creditType: CreditType, amount: number) {
    super(message);
    this.name = "CreditDeductionError";
    this.creditType = creditType;
    this.amount = amount;
  }
}
