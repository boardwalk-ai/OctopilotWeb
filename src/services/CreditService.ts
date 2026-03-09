import { OctopilotAPIService } from "./OctopilotAPIService";
import { AccountStateService } from "./AccountStateService";

export type CreditType = "word" | "humanizer" | "source";

type DeductOptions = {
  idempotencyKey?: string;
};

type MeResponse = {
  word_credits?: number | null;
  humanizer_credits?: number | null;
  source_credits?: number | null;
};

type DeductResponse = {
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
      return await OctopilotAPIService.post<DeductResponse>("/api/v1/me/credits/deduct", {
        credit_type: creditType,
        amount,
        idempotency_key: options?.idempotencyKey,
      });
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

  static async getAvailableCredits(): Promise<Record<CreditType, number>> {
    const snapshot = AccountStateService.read();
    if (snapshot) {
      const cachedWord = snapshot.word_credits ?? snapshot.wordCredits;
      const cachedHumanizer = snapshot.humanizer_credits ?? snapshot.humanizerCredits;
      const cachedSource = snapshot.source_credits ?? snapshot.sourceCredits;
      if (cachedWord != null || cachedHumanizer != null || cachedSource != null) {
        return {
          word: Number(cachedWord ?? 0),
          humanizer: Number(cachedHumanizer ?? 0),
          source: Number(cachedSource ?? 0),
        };
      }
    }

    const me = await OctopilotAPIService.get<MeResponse>("/api/v1/me");
    return {
      word: Number(me.word_credits ?? 0),
      humanizer: Number(me.humanizer_credits ?? 0),
      source: Number(me.source_credits ?? 0),
    };
  }

  static async ensureSufficientCredits(creditType: CreditType, amount: number): Promise<void> {
    if (amount <= 0) return;

    const available = await CreditService.getAvailableCredits();
    const current = available[creditType];
    if (current >= amount) return;

    const label = creditType === "word" ? "word" : creditType === "humanizer" ? "humanizer" : "source";
    throw new CreditDeductionError(
      `You need ${amount} ${label} credits, but only ${current} are available.`,
      creditType,
      amount,
    );
  }

  static async ensureSufficientWordCreditsForWords(words: number): Promise<number> {
    const amount = CreditService.creditsFromWords(words);
    await CreditService.ensureSufficientCredits("word", amount);
    return amount;
  }

  static async ensureSufficientHumanizerCreditsForWords(words: number): Promise<number> {
    const amount = CreditService.creditsFromWords(words);
    await CreditService.ensureSufficientCredits("humanizer", amount);
    return amount;
  }
}
