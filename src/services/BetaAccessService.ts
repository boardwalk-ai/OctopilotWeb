import { AuthService } from "./AuthService";

export type BetaAccessFeatures = {
  ghostwriter: boolean;
  octopilotSlides: boolean;
  humanizerHub: boolean;
  ghostCiter: boolean;
};

export const DEFAULT_BETA_ACCESS: BetaAccessFeatures = {
  ghostwriter: false,
  octopilotSlides: false,
  humanizerHub: false,
  ghostCiter: false,
};

// Bump the version suffix to invalidate stale client caches.
const STORAGE_KEY = "octopilot.betaAccess.v1";

let memorySnapshot: BetaAccessFeatures | null = null;
let hydratedUserId: string | null = null;
let inflight: Promise<BetaAccessFeatures> | null = null;
const listeners = new Set<(features: BetaAccessFeatures) => void>();

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function notifyListeners(features: BetaAccessFeatures): void {
  listeners.forEach((listener) => {
    try {
      listener(features);
    } catch {
      // ignore listener failures
    }
  });
}

/**
 * Client-side cache for the current user's beta-access feature flags.
 *
 * Mirrors AccountStateService: an in-memory + sessionStorage snapshot keyed by
 * the Firebase uid so a return visit reads the result synchronously (no flash of
 * the non-beta layout while a fresh /api/beta-access/me round-trips). bootstrap()
 * is fired once during the header's auth-resolve boot so the value is already
 * warm by the time the user reaches the methodology screen.
 */
export class BetaAccessService {
  static read(): BetaAccessFeatures | null {
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
      const parsed = JSON.parse(raw) as { uid?: string | null; features?: Partial<BetaAccessFeatures> };
      const currentUid = AuthService.getCurrentUser()?.uid ?? null;
      // Only reject when we positively know the cache belongs to a different user.
      // During the auth-resolving window currentUid is null — trust the cache then.
      if (parsed.uid && currentUid && parsed.uid !== currentUid) {
        return null;
      }
      memorySnapshot = { ...DEFAULT_BETA_ACCESS, ...(parsed.features ?? {}) };
      hydratedUserId = parsed.uid ?? hydratedUserId;
      return memorySnapshot;
    } catch {
      return null;
    }
  }

  static subscribe(listener: (features: BetaAccessFeatures) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  static clear(): void {
    memorySnapshot = null;
    hydratedUserId = null;
    inflight = null;
    if (canUseStorage()) {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
    }
    notifyListeners(DEFAULT_BETA_ACCESS);
  }

  static hasHydratedCurrentUser(): boolean {
    const currentUid = AuthService.getCurrentUser()?.uid ?? null;
    return !!currentUid && hydratedUserId === currentUid && !!memorySnapshot;
  }

  static async bootstrap(options?: { force?: boolean }): Promise<BetaAccessFeatures> {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) {
      BetaAccessService.clear();
      return DEFAULT_BETA_ACCESS;
    }

    if (!options?.force && BetaAccessService.hasHydratedCurrentUser()) {
      return memorySnapshot as BetaAccessFeatures;
    }
    if (!options?.force && inflight) {
      return inflight;
    }

    const requestedUid = currentUser.uid;
    inflight = (async () => {
      try {
        const token = await AuthService.getIdToken();
        if (!token) {
          return memorySnapshot ?? DEFAULT_BETA_ACCESS;
        }

        const response = await fetch("/api/beta-access/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) {
          return memorySnapshot ?? DEFAULT_BETA_ACCESS;
        }

        const payload = (await response.json()) as { features?: Partial<BetaAccessFeatures> };
        // Ignore if the user switched while the request was in flight.
        if (AuthService.getCurrentUser()?.uid !== requestedUid) {
          return memorySnapshot ?? DEFAULT_BETA_ACCESS;
        }

        const features: BetaAccessFeatures = {
          ghostwriter: Boolean(payload.features?.ghostwriter),
          octopilotSlides: Boolean(payload.features?.octopilotSlides),
          humanizerHub: Boolean(payload.features?.humanizerHub),
          ghostCiter: Boolean(payload.features?.ghostCiter),
        };

        memorySnapshot = features;
        hydratedUserId = requestedUid;
        if (canUseStorage()) {
          try {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid: requestedUid, features }));
          } catch {
            // ignore storage failures
          }
        }
        notifyListeners(features);
        return features;
      } catch {
        return memorySnapshot ?? DEFAULT_BETA_ACCESS;
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }
}
