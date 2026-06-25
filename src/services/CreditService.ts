import { AccountStateService } from "./AccountStateService";
import { OctopilotAPIService } from "./OctopilotAPIService";

export type CreditType = "word" | "humanizer" | "source";

type DeductOptions = {
  idempotencyKey?: string;
};

type MeResponse = {
  octo_credits?: number | null;
  word_credits?: number | null;
  humanizer_credits?: number | null;
  source_credits?: number | null;
};

type DeductResponse = {
  charge?: number;
  octo_credits?: number;
  word_credits?: number;
  humanizer_credits?: number;
  source_credits?: number;
};

export class CreditDeductionError extends Error {
  creditType: CreditType;
  amount: number;

  constructor(message: string, creditType: CreditType, amount: number) {
    super(message);
    this.name = "CreditDeductionError";
    this.creditType = creditType;
    this.amount = amount;
  }
}

export class CreditService {
  static createDeductionKey(scope: string): string {
    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${scope}:${randomPart}`;
  }

  static countWords(text: string): number {
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  static creditsFromWords(words: number): number {
    if (words <= 0) return 0;
    return Math.max(1, Math.round(words / 10));
  }

  static async deduct(creditType: CreditType, amount: number, options?: DeductOptions): Promise<DeductResponse | null> {
    if (amount <= 0) return null;

    try {
      const response = await OctopilotAPIService.post<DeductResponse>("/api/v1/me/credits/deduct", {
        credit_type: creditType,
        amount,
        idempotency_key: options?.idempotencyKey,
      });
      AccountStateService.write(response);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Credit deduction failed";
      throw new CreditDeductionError(message, creditType, amount);
    }
  }

  static async deductSourceCredits(amount: number, options?: DeductOptions): Promise<DeductResponse | null> {
    return CreditService.deduct("source", amount, options);
  }

  static async deductWordCreditsForWords(words: number, options?: DeductOptions): Promise<DeductResponse | null> {
    return CreditService.deduct("word", CreditService.creditsFromWords(words), options);
  }

  static async deductHumanizerCreditsForWords(words: number, options?: DeductOptions): Promise<DeductResponse | null> {
    return CreditService.deduct("humanizer", CreditService.creditsFromWords(words), options);
  }

  // ── Unified OctoCredit (single source of truth post-migration) ──────────────
  // Reference cost table (Pricing Final §3) — mirrors the server's pricing.py.
  static estimateCharge(wordsGen = 0, wordsHum = 0, sources = 0): number {
    const cost =
      Math.max(0, wordsGen) / 30000 +
      Math.max(0, wordsHum) / 3000 +
      Math.max(0, sources) / 50;
    const raw = cost * 100; // 100 OC = $1
    return Math.max(100, Math.ceil(raw / 100) * 100); // min 100, round up to 100
  }

  static async getOctoCredits(): Promise<number> {
    const snapshot = AccountStateService.read();
    const cached = snapshot?.octo_credits ?? snapshot?.octoCredits;
    if (cached != null) return Number(cached);
    const me = await AccountStateService.bootstrap();
    return Number(me?.octo_credits ?? me?.octoCredits ?? 0);
  }

  /** Throw if the user can't afford an estimated OctoCredit charge. */
  static async ensureSufficientOcto(charge: number, label = "this action"): Promise<void> {
    if (charge <= 0) return;
    const balance = await CreditService.getOctoCredits();
    if (balance >= charge) return;
    throw new CreditDeductionError(
      `${label} costs ${charge} credits, but you only have ${balance}.`,
      "word",
      charge,
    );
  }

  /** Legacy shape kept for back-compat — now returns the single OctoCredit balance. */
  static async getAvailableCredits(): Promise<Record<CreditType, number>> {
    const octo = await CreditService.getOctoCredits();
    return { word: octo, humanizer: octo, source: octo };
  }

  static async ensureSufficientCredits(creditType: CreditType, amount: number): Promise<void> {
    if (amount <= 0) return;
    const charge =
      creditType === "source"
        ? CreditService.estimateCharge(0, 0, amount)
        : creditType === "humanizer"
          ? CreditService.estimateCharge(0, amount * 10, 0)
          : CreditService.estimateCharge(amount * 10, 0, 0);
    await CreditService.ensureSufficientOcto(charge, "This");
  }

  static async ensureSufficientWordCreditsForWords(words: number): Promise<number> {
    await CreditService.ensureSufficientOcto(CreditService.estimateCharge(words, 0, 0), "Generating");
    return CreditService.creditsFromWords(words);
  }

  static async ensureSufficientHumanizerCreditsForWords(words: number): Promise<number> {
    await CreditService.ensureSufficientOcto(CreditService.estimateCharge(0, words, 0), "Humanizing");
    return CreditService.creditsFromWords(words);
  }
}
