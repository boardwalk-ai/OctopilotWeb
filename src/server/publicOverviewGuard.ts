import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type JsonEnvelope = {
  status: number;
  body: unknown;
};

type CachedJsonResponse = JsonEnvelope & {
  expiresAt: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitBucket>();
const idempotencyStore = new Map<string, CachedJsonResponse>();

const DEFAULT_RATE_LIMIT = Number(process.env.PUBLIC_OVERVIEW_RATE_LIMIT_MAX || 60);
const DEFAULT_RATE_LIMIT_WINDOW_MS = Number(process.env.PUBLIC_OVERVIEW_RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_IDEMPOTENCY_TTL_MS = Number(process.env.PUBLIC_OVERVIEW_IDEMPOTENCY_TTL_MS || 300_000);

function getClientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function getRateLimitKey(request: NextRequest, scope: string) {
  return `${scope}:${getClientAddress(request)}`;
}

function getIdempotencyKey(request: NextRequest) {
  return request.headers.get("idempotency-key")?.trim() || request.headers.get("x-idempotency-key")?.trim() || null;
}

function getIdempotencyCacheKey(request: NextRequest, scope: string, idempotencyKey: string) {
  return `${scope}:${request.nextUrl.pathname}:${idempotencyKey}`;
}

function cleanExpiredEntries() {
  const now = Date.now();

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  for (const [key, cached] of idempotencyStore.entries()) {
    if (cached.expiresAt <= now) {
      idempotencyStore.delete(key);
    }
  }
}

function applyRateLimit(request: NextRequest, scope: string) {
  cleanExpiredEntries();

  const now = Date.now();
  const key = getRateLimitKey(request, scope);
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    const nextBucket = {
      count: 1,
      resetAt: now + DEFAULT_RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(key, nextBucket);

    return {
      allowed: true,
      limit: DEFAULT_RATE_LIMIT,
      remaining: Math.max(0, DEFAULT_RATE_LIMIT - nextBucket.count),
      resetAt: nextBucket.resetAt,
    };
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  return {
    allowed: current.count <= DEFAULT_RATE_LIMIT,
    limit: DEFAULT_RATE_LIMIT,
    remaining: Math.max(0, DEFAULT_RATE_LIMIT - current.count),
    resetAt: current.resetAt,
  };
}

function buildRateLimitHeaders(rateLimit: { limit: number; remaining: number; resetAt: number }) {
  return {
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(Math.floor(rateLimit.resetAt / 1000)),
  };
}

export async function runPublicOverviewJsonRoute(
  request: NextRequest,
  scope: string,
  handler: () => Promise<JsonEnvelope>
) {
  const rateLimit = applyRateLimit(request, scope);
  const baseHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Retry later." },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (idempotencyKey) {
    const cacheKey = getIdempotencyCacheKey(request, scope, idempotencyKey);
    const cached = idempotencyStore.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: {
          ...baseHeaders,
          "X-Idempotency-Key": idempotencyKey,
          "X-Idempotency-Status": "replayed",
        },
      });
    }

    const result = await handler();
    idempotencyStore.set(cacheKey, {
      ...result,
      expiresAt: Date.now() + DEFAULT_IDEMPOTENCY_TTL_MS,
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        ...baseHeaders,
        "X-Idempotency-Key": idempotencyKey,
        "X-Idempotency-Status": "stored",
      },
    });
  }

  const result = await handler();
  return NextResponse.json(result.body, {
    status: result.status,
    headers: baseHeaders,
  });
}
