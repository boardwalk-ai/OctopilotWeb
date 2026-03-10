import { AuthService } from "./AuthService";
import { OctopilotAPIService } from "./OctopilotAPIService";

export type AccountSnapshot = {
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
let hydratedUserId: string | null = null;
let bootstrapPromise: Promise<AccountSnapshot | null> | null = null;
const listeners = new Set<(snapshot: AccountSnapshot | null) => void>();

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function normalizeSnapshot(snapshot?: AccountSnapshot | null): AccountSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    plan: snapshot.plan ?? null,
    word_credits: snapshot.word_credits ?? snapshot.wordCredits ?? null,
    humanizer_credits: snapshot.humanizer_credits ?? snapshot.humanizerCredits ?? null,
    source_credits: snapshot.source_credits ?? snapshot.sourceCredits ?? null,
    subscription_status: snapshot.subscription_status ?? snapshot.subscriptionStatus ?? null,
    subscription_end_date: snapshot.subscription_end_date ?? snapshot.subscriptionEndDate ?? null,
    wordCredits: snapshot.wordCredits ?? snapshot.word_credits ?? null,
    humanizerCredits: snapshot.humanizerCredits ?? snapshot.humanizer_credits ?? null,
    sourceCredits: snapshot.sourceCredits ?? snapshot.source_credits ?? null,
    subscriptionStatus: snapshot.subscriptionStatus ?? snapshot.subscription_status ?? null,
    subscriptionEndDate: snapshot.subscriptionEndDate ?? snapshot.subscription_end_date ?? null,
  };
}

function notifyListeners(snapshot: AccountSnapshot | null): void {
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener failures.
    }
  });
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
      memorySnapshot = normalizeSnapshot(JSON.parse(raw) as AccountSnapshot);
      return memorySnapshot;
    } catch {
      return null;
    }
  }

  static write(snapshot?: AccountSnapshot | null): void {
    const normalized = normalizeSnapshot({
      ...(AccountStateService.read() ?? {}),
      ...(snapshot ?? {}),
    });
    if (!normalized) {
      return;
    }

    memorySnapshot = normalized;
    const currentUser = AuthService.getCurrentUser();
    hydratedUserId = currentUser?.uid ?? hydratedUserId;

    if (!canUseStorage()) {
      notifyListeners(memorySnapshot);
      return;
    }

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage failures.
    }

    notifyListeners(memorySnapshot);
  }

  static clear(): void {
    memorySnapshot = null;
    hydratedUserId = null;
    bootstrapPromise = null;
    if (!canUseStorage()) {
      notifyListeners(null);
      return;
    }

    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }

    notifyListeners(null);
  }

  static subscribe(listener: (snapshot: AccountSnapshot | null) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  static hasHydratedCurrentUser(): boolean {
    const currentUser = AuthService.getCurrentUser();
    return !!currentUser && hydratedUserId === currentUser.uid;
  }

  static async bootstrap(options?: { force?: boolean }): Promise<AccountSnapshot | null> {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) {
      AccountStateService.clear();
      return null;
    }

    const cachedSnapshot = AccountStateService.read();
    if (!options?.force && cachedSnapshot && hydratedUserId === currentUser.uid) {
      return cachedSnapshot;
    }

    if (!options?.force && bootstrapPromise) {
      return bootstrapPromise;
    }

    const requestedUserId = currentUser.uid;
    bootstrapPromise = OctopilotAPIService.get<AccountSnapshot>("/api/v1/me")
      .then((payload) => {
        const normalized = normalizeSnapshot(payload);
        if (AuthService.getCurrentUser()?.uid !== requestedUserId) {
          return AccountStateService.read();
        }

        hydratedUserId = requestedUserId;
        AccountStateService.write(normalized);
        return normalized;
      })
      .catch((error) => {
        if (cachedSnapshot) {
          hydratedUserId = requestedUserId;
          return cachedSnapshot;
        }
        throw error;
      })
      .finally(() => {
        bootstrapPromise = null;
      });

    return bootstrapPromise;
  }

  static async refresh(): Promise<AccountSnapshot | null> {
    return AccountStateService.bootstrap({ force: true });
  }
}
