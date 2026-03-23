import { resolveDefaultServiceAuthorization } from "@/server/serviceAuthorization";

type BackendKeysResponse = {
  openrouter_api_key?: string;
  brave_api_key?: string;
  primary_model?: string;
  secondary_model?: string;
};

type BackendSettingRow = {
  key: string;
  value: string;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000;

let keysCache: CacheEntry<BackendKeysResponse> | null = null;
let settingsCache: CacheEntry<Record<string, string>> | null = null;

function getApiBaseUrl(): string {
  return (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.octopilotai.com").replace(/\/$/, "");
}

async function fetchJson<T>(path: string): Promise<T> {
  const authorization = resolveDefaultServiceAuthorization();
  if (!authorization) {
    throw new Error("Missing ADMIN_SERVICE_AUTHORIZATION for backend config access.");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Backend config request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getBackendKeys(): Promise<BackendKeysResponse> {
  if (keysCache && keysCache.expiresAt > Date.now()) {
    return keysCache.value;
  }

  const value = await fetchJson<BackendKeysResponse>("/api/v1/settings/keys");
  keysCache = {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return value;
}

async function getBackendSettings(): Promise<Record<string, string>> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.value;
  }

  const rows = await fetchJson<BackendSettingRow[]>("/api/v1/admin/settings");
  const value = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  settingsCache = {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return value;
}

export async function getOpenRouterConfig(kind: "primary" | "secondary" | "source_search") {
  const keys = await getBackendKeys();
  const settings = kind === "source_search" ? await getBackendSettings() : null;

  if (!keys.openrouter_api_key) {
    throw new Error("No active OpenRouter key is configured.");
  }

  const model =
    kind === "primary"
      ? keys.primary_model
      : kind === "source_search"
        ? settings?.source_search_model || keys.secondary_model
        : keys.secondary_model;

  if (!model) {
    throw new Error(`No ${kind} model is configured.`);
  }

  return {
    apiKey: keys.openrouter_api_key,
    model,
  };
}

export async function getHumanizerApiKey(provider: "stealthgpt" | "undetectable") {
  const settings = await getBackendSettings();
  const key = provider === "stealthgpt" ? settings.stealthgpt_api_key : settings.undetectable_api_key;

  if (!key) {
    throw new Error(`No ${provider} API key is configured.`);
  }

  return key;
}

export { getApiBaseUrl };
