import { getApiBaseUrl } from "@/server/backendConfig";
import { resolveDefaultServiceAuthorization } from "@/server/serviceAuthorization";

export type BetaFeatureKey = "ghostwriter" | "octopilotSlides";

export type BetaAccessEntry = {
  email: string;
  name: string;
  features: BetaFeatureKey[];
  addedAt: string;
};

export const SUPPORTED_BETA_FEATURES: BetaFeatureKey[] = ["ghostwriter", "octopilotSlides"];

const BETA_ACCESS_SETTINGS_KEY = "beta_access_list";

// Email of the original beta tester. Always granted access regardless of stored list.
const ALWAYS_ALLOWED_EMAILS = ["dev.trhein@gmail.com"];

type BackendSettingRow = {
  key: string;
  value: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function ensureFeatures(value: unknown): BetaFeatureKey[] {
  if (!Array.isArray(value)) {
    return [...SUPPORTED_BETA_FEATURES];
  }

  const cleaned = value
    .map((entry) => (typeof entry === "string" ? entry : ""))
    .filter((entry): entry is BetaFeatureKey => SUPPORTED_BETA_FEATURES.includes(entry as BetaFeatureKey));

  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [...SUPPORTED_BETA_FEATURES];
}

function normalizeEntry(raw: unknown): BetaAccessEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const email = typeof candidate.email === "string" ? normalizeEmail(candidate.email) : "";
  if (!email) return null;

  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const addedAt = typeof candidate.addedAt === "string" ? candidate.addedAt : new Date().toISOString();
  const features = ensureFeatures(candidate.features);

  return { email, name, features, addedAt };
}

function deduplicate(entries: BetaAccessEntry[]): BetaAccessEntry[] {
  const seen = new Map<string, BetaAccessEntry>();
  for (const entry of entries) {
    if (!seen.has(entry.email)) {
      seen.set(entry.email, entry);
    }
  }
  return Array.from(seen.values()).sort((left, right) => left.email.localeCompare(right.email));
}

function parseSerializedList(value: string | null | undefined): BetaAccessEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return deduplicate(parsed.map(normalizeEntry).filter((entry): entry is BetaAccessEntry => entry !== null));
  } catch {
    return [];
  }
}

async function fetchAllSettings(authorization: string): Promise<BackendSettingRow[]> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/settings`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail || payload?.error || `Failed to load settings (${response.status}).`;
    throw new Error(message);
  }

  const payload = (await response.json()) as BackendSettingRow[] | { settings?: BackendSettingRow[] };
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.settings) ? payload.settings : [];
}

async function patchSetting(authorization: string, key: string, value: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/settings/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify({ value }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail || payload?.error || `Failed to update settings (${response.status}).`;
    throw new Error(message);
  }
}

async function readListWithAuthorization(authorization: string): Promise<BetaAccessEntry[]> {
  const rows = await fetchAllSettings(authorization);
  const row = rows.find((entry) => entry?.key === BETA_ACCESS_SETTINGS_KEY);
  return parseSerializedList(row?.value);
}

async function writeListWithAuthorization(authorization: string, entries: BetaAccessEntry[]): Promise<BetaAccessEntry[]> {
  const normalized = deduplicate(entries);
  await patchSetting(authorization, BETA_ACCESS_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

function ensureServiceAuthorization(): string {
  const authorization = resolveDefaultServiceAuthorization();
  if (!authorization) {
    throw new Error("Beta access service is not configured (missing ADMIN_SERVICE_AUTHORIZATION).");
  }
  return authorization;
}

export async function loadBetaAccessList(authorization: string): Promise<BetaAccessEntry[]> {
  return readListWithAuthorization(authorization);
}

export async function saveBetaAccessList(authorization: string, entries: BetaAccessEntry[]): Promise<BetaAccessEntry[]> {
  return writeListWithAuthorization(authorization, entries);
}

export async function appendBetaAccessEntry(
  authorization: string,
  payload: { email: string; name?: string; features?: BetaFeatureKey[] },
): Promise<{ list: BetaAccessEntry[]; added: BetaAccessEntry }> {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error("Email is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const features = ensureFeatures(payload.features);
  const current = await readListWithAuthorization(authorization);

  const existing = current.find((entry) => entry.email === email);
  const next: BetaAccessEntry = existing
    ? {
        ...existing,
        name: payload.name?.trim() ? payload.name.trim() : existing.name,
        features: Array.from(new Set([...existing.features, ...features])),
      }
    : {
        email,
        name: payload.name?.trim() ?? "",
        features,
        addedAt: new Date().toISOString(),
      };

  const merged = deduplicate([...current.filter((entry) => entry.email !== email), next]);
  const saved = await writeListWithAuthorization(authorization, merged);
  const added = saved.find((entry) => entry.email === email) ?? next;
  return { list: saved, added };
}

export async function removeBetaAccessEntry(authorization: string, email: string): Promise<BetaAccessEntry[]> {
  const target = normalizeEmail(email);
  if (!target) {
    throw new Error("Email is required to remove an entry.");
  }
  const current = await readListWithAuthorization(authorization);
  const next = current.filter((entry) => entry.email !== target);
  if (next.length === current.length) {
    return current;
  }
  return writeListWithAuthorization(authorization, next);
}

export async function fetchBetaAccessForEmail(email: string): Promise<{
  allowed: boolean;
  features: Record<BetaFeatureKey, boolean>;
}> {
  const features: Record<BetaFeatureKey, boolean> = {
    ghostwriter: false,
    octopilotSlides: false,
  };

  const target = normalizeEmail(email);
  if (!target) {
    return { allowed: false, features };
  }

  if (ALWAYS_ALLOWED_EMAILS.includes(target)) {
    return {
      allowed: true,
      features: SUPPORTED_BETA_FEATURES.reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        features,
      ),
    };
  }

  let list: BetaAccessEntry[] = [];
  try {
    const authorization = ensureServiceAuthorization();
    list = await readListWithAuthorization(authorization);
  } catch {
    return { allowed: false, features };
  }

  const entry = list.find((row) => row.email === target);
  if (!entry) {
    return { allowed: false, features };
  }

  for (const featureKey of entry.features) {
    if (SUPPORTED_BETA_FEATURES.includes(featureKey)) {
      features[featureKey] = true;
    }
  }

  return { allowed: Object.values(features).some(Boolean), features };
}

export function isAlwaysAllowedEmail(email: string): boolean {
  return ALWAYS_ALLOWED_EMAILS.includes(normalizeEmail(email));
}
