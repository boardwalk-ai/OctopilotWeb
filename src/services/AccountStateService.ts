type AccountSnapshot = {
  plan?: string | null;
  word_credits?: number | null;
  humanizer_credits?: number | null;
  source_credits?: number | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  wordCredits?: number | null;
  humanizerCredits?: number | null;
  sourceCredits?: number | null;
  subscriptionStatus?: string | null;
  subscriptionEndDate?: string | null;
};

const STORAGE_KEY = "octopilot.account.snapshot";
let memorySnapshot: AccountSnapshot | null = null;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export class AccountStateService {
  static read(): AccountSnapshot | null {
    if (memorySnapshot) {
      return memorySnapshot;
    }

    if (!canUseStorage()) {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      memorySnapshot = JSON.parse(raw) as AccountSnapshot;
      return memorySnapshot;
    } catch {
      return null;
    }
  }

  static write(snapshot?: AccountSnapshot | null): void {
    if (!snapshot) {
      return;
    }

    memorySnapshot = snapshot;
    if (!canUseStorage()) {
      return;
    }

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures.
    }
  }

  static clear(): void {
    memorySnapshot = null;
    if (!canUseStorage()) {
      return;
    }

    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
}
