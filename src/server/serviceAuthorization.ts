function normalizeUpstreamAuthorization(rawValue?: string | null): string {
  const trimmed = rawValue?.trim() || "";
  if (!trimmed) {
    return "";
  }

  // Allow bare tokens in env and normalize them to bearer auth.
  if (/\s/.test(trimmed)) {
    return trimmed;
  }

  return `Bearer ${trimmed}`;
}

export function resolveConfiguredUpstreamAuthorization(...envNames: string[]): string {
  for (const envName of envNames) {
    const candidate = normalizeUpstreamAuthorization(process.env[envName]);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

export function resolveDefaultServiceAuthorization(): string {
  return resolveConfiguredUpstreamAuthorization(
    "ADMIN_SERVICE_AUTHORIZATION",
    "ADMIN_PUBLIC_UPSTREAM_AUTHORIZATION",
    "ADMIN_AGENT_UPSTREAM_AUTHORIZATION",
  );
}
