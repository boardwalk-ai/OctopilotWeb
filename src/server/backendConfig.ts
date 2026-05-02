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

export async function getOpenRouterConfig(
  kind: "primary" | "secondary" | "source_search" | "ghostwriter_write" | "ghostwriter_orchestrator",
) {
  const keys = await getBackendKeys();
  const needsSettings = kind === "source_search" || kind === "ghostwriter_write" || kind === "ghostwriter_orchestrator";
  const settings = needsSettings ? await getBackendSettings() : null;

  if (!keys.openrouter_api_key) {
    throw new Error("No active OpenRouter key is configured.");
  }

  let model: string | undefined;
  if (kind === "primary") {
    model = keys.primary_model;
  } else if (kind === "secondary") {
    model = keys.secondary_model;
  } else if (kind === "source_search") {
    model = settings?.source_search_model || keys.secondary_model;
  } else if (kind === "ghostwriter_write") {
    model = settings?.ghostwriter_write_model || keys.primary_model;
  } else if (kind === "ghostwriter_orchestrator") {
    model = settings?.ghostwriter_orchestrator_model || keys.secondary_model;
  }

  if (!model) {
    throw new Error(`No ${kind} model is configured.`);
  }

  return {
    apiKey: keys.openrouter_api_key,
    model,
  };
}

type ModelKind = Parameters<typeof getOpenRouterConfig>[0];

/**
 * Fetch a fresh OpenRouter key directly from the pool — bypasses the 30s
 * cache so the backend's LRU rotation actually fires. Call once per agent
 * run at startup; store the result in AgentRun (server-side only, never
 * sent to the client).
 */
export async function fetchFreshOpenRouterKey(): Promise<string> {
  const data = await fetchJson<BackendKeysResponse>("/api/v1/settings/keys");
  if (!data.openrouter_api_key) {
    throw new Error("No active OpenRouter key is configured in the pool.");
  }
  return data.openrouter_api_key;
}

/**
 * Build a {apiKey, model} pair using a key already assigned to the run.
 * Model names are still read from the 30s cache — they rarely change and
 * don't affect rate-limit spreading.
 *
 * Security: `runKey` is a server-side value from AgentRun — it is never
 * serialised to SSE events, API responses, or logs.
 */
export async function getOpenRouterConfigForRun(
  runKey: string,
  kind: ModelKind,
): Promise<{ apiKey: string; model: string }> {
  const needsSettings =
    kind === "source_search" ||
    kind === "ghostwriter_write" ||
    kind === "ghostwriter_orchestrator";

  const [keys, settings] = await Promise.all([
    getBackendKeys(),
    needsSettings ? getBackendSettings() : Promise.resolve(null),
  ]);

  let model: string | undefined;
  if (kind === "primary") model = keys.primary_model;
  else if (kind === "secondary") model = keys.secondary_model;
  else if (kind === "source_search") model = settings?.source_search_model || keys.secondary_model;
  else if (kind === "ghostwriter_write") model = settings?.ghostwriter_write_model || keys.primary_model;
  else if (kind === "ghostwriter_orchestrator") model = settings?.ghostwriter_orchestrator_model || keys.secondary_model;

  if (!model) throw new Error(`No ${kind} model is configured.`);

  // Substitute the pre-assigned run key — not the cached pool key.
  return { apiKey: runKey, model };
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
