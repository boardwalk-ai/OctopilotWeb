import { OctopilotAPIService } from "./OctopilotAPIService";

export type CreditType = "word" | "humanizer" | "source";

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
  static countWords(text: string): number {
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  static creditsFromWords(words: number): number {
    if (words <= 0) return 0;
    return Math.max(1, Math.round(words / 10));
  }

  static async deduct(creditType: CreditType, amount: number): Promise<DeductResponse | null> {
    if (amount <= 0) return null;

    try {
      return await OctopilotAPIService.post<DeductResponse>("/api/v1/me/credits/deduct", {
        credit_type: creditType,
        amount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Credit deduction failed";
      throw new CreditDeductionError(message, creditType, amount);
    }
  }

  static async deductSourceCredits(amount: number): Promise<DeductResponse | null> {
    return CreditService.deduct("source", amount);
  }

  static async deductWordCreditsForWords(words: number): Promise<DeductResponse | null> {
    return CreditService.deduct("word", CreditService.creditsFromWords(words));
  }

  static async deductHumanizerCreditsForWords(words: number): Promise<DeductResponse | null> {
    return CreditService.deduct("humanizer", CreditService.creditsFromWords(words));
  }
}
