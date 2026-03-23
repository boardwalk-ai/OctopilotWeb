import { getApiBaseUrl } from "./backendConfig";

const ADMIN_OVERVIEW_TIME_ZONE = "America/New_York";
const OVERVIEW_CACHE_TTL_MS = 30_000;

type CountMetricKey =
  | "todaysNewUsers"
  | "todaysNewPurchases"
  | "todaysSessionCount"
  | "todaysEventAppointments"
  | "proUsers"
  | "premiumUsers"
  | "freeUsers"
  | "activeUnclaimedRedeemCodes"
  | "unsolvedReports"
  | "reviews";

type MetricAction = {
  label: string;
  href: string;
  sectionId?: string;
};

type CountMetric = {
  key: CountMetricKey;
  slug: string;
  label: string;
  description: string;
  kind: "count";
  value: number | null;
  action?: MetricAction;
};

type DateTimeMetric = {
  key: "usDateTime";
  slug: string;
  label: string;
  description: string;
  kind: "datetime";
  value: string;
  iso: string;
  date: string;
  time: string;
  timeZone: string;
  timeZoneName: string;
};

export type AdminOverviewPayload = {
  dashboardHref: string;
  generatedAt: string;
  isPartial: boolean;
  errors: Record<string, string>;
  metricOrder: Array<CountMetric["key"] | DateTimeMetric["key"]>;
  metrics: {
    usDateTime: DateTimeMetric;
    todaysNewUsers: CountMetric;
    todaysNewPurchases: CountMetric;
    todaysSessionCount: CountMetric;
    todaysEventAppointments: CountMetric;
    proUsers: CountMetric;
    premiumUsers: CountMetric;
    freeUsers: CountMetric;
    activeUnclaimedRedeemCodes: CountMetric;
    unsolvedReports: CountMetric;
    reviews: CountMetric;
  };
};

type AdminCheckResponse = {
  isAdmin?: boolean;
  error?: string;
  detail?: string;
};

type ControlCenterResponse = {
  quickMetrics?: {
    openReports?: number | null;
  };
  sections?: {
    reports?: Array<Record<string, unknown>>;
  };
};

type DashboardUserRow = {
  id: string;
  createdAt?: string | number | { seconds?: number; toMillis?: () => number } | null;
};

type DashboardSessionRow = {
  id: string;
  sessionStartTime?: string | null;
};

type CustomerRow = {
  id: string;
  plan?: string | null;
  current_plan?: string | null;
};

type PromoCodeRow = {
  id: string;
  code_valid_until?: string | null;
  max_uses?: number | null;
  current_uses?: number | null;
  claimed_by?: string | null;
  is_active?: boolean | null;
};

type PromoCodesResponse = {
  codes?: PromoCodeRow[];
};

type EarlyAccessSlotRow = {
  event_date?: string | null;
};

type EarlyAccessBookingRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  review_rating?: number | null;
  review_text?: string | null;
  slot?: EarlyAccessSlotRow | null;
};

type EarlyAccessOverviewResponse = {
  bookings?: EarlyAccessBookingRow[];
};

type PurchaseSummaryRow = {
  id: string;
  has_purchases?: boolean | null;
  purchase_date?: string | null;
  latest_purchase_date?: string | null;
  last_purchase_date?: string | null;
  purchaseCountToday?: number | null;
  purchase_count_today?: number | null;
  today_purchase_count?: number | null;
};

type PurchaseHistoryRow = {
  purchase_date?: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: AdminOverviewPayload;
};

let overviewCache: CacheEntry | null = null;

const METRIC_SLUGS = {
  usDateTime: "us-date-time",
  todaysNewUsers: "today-new-users",
  todaysNewPurchases: "today-new-purchases",
  todaysSessionCount: "today-session-count",
  todaysEventAppointments: "today-event-appointments",
  proUsers: "pro-users",
  premiumUsers: "premium-users",
  freeUsers: "free-users",
  activeUnclaimedRedeemCodes: "active-unclaimed-redeem-codes",
  unsolvedReports: "unsolved-reports",
  reviews: "reviews",
} as const;

const METRIC_ORDER: AdminOverviewPayload["metricOrder"] = [
  "usDateTime",
  "todaysNewUsers",
  "todaysNewPurchases",
  "todaysSessionCount",
  "todaysEventAppointments",
  "proUsers",
  "premiumUsers",
  "freeUsers",
  "activeUnclaimedRedeemCodes",
  "unsolvedReports",
  "reviews",
];

function getAdminBackendBaseUrl() {
  return (process.env.ADMIN_BACKEND_BASE_URL || "http://187.124.92.119:8000").replace(/\/$/, "");
}

async function fetchJson<T>(url: string, authorization: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail?.message || payload.error || `Request failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

async function fetchAdminDashboardJson<T>(path: string, authorization: string) {
  return fetchJson<T>(`${getAdminBackendBaseUrl()}${path}`, authorization);
}

async function fetchApiJson<T>(path: string, authorization: string) {
  return fetchJson<T>(`${getApiBaseUrl()}${path}`, authorization);
}

async function assertAdminAccess(authorization: string) {
  const payload = await fetchAdminDashboardJson<AdminCheckResponse>("/api/v1/dashboard/check-admin", authorization);
  if (!payload.isAdmin) {
    throw new Error(payload.error || payload.detail || "This account does not have admin access.");
  }
}

function toDateKeyInTimeZone(value: Date | string | number, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function extractTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (value && typeof value === "object") {
    if ("toMillis" in value && typeof value.toMillis === "function") {
      const millis = value.toMillis();
      return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
    }

    if ("seconds" in value && typeof value.seconds === "number") {
      return value.seconds * 1000;
    }
  }

  return null;
}

function readRecordDateKey(record: Record<string, unknown>, keys: string[], timeZone: string) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const dateKey = toDateKeyInTimeZone(value, timeZone);
    if (dateKey) {
      return dateKey;
    }
  }

  return null;
}

function normalizePlan(value: string | null | undefined) {
  const plan = `${value || ""}`.trim().toLowerCase();
  if (plan.includes("premium")) {
    return "premium";
  }
  if (plan.includes("pro")) {
    return "pro";
  }
  return "free";
}

function isPromoCodeActiveUnclaimed(row: PromoCodeRow, now: Date) {
  if (!row.is_active) {
    return false;
  }

  if (row.claimed_by) {
    return false;
  }

  const currentUses = Number(row.current_uses || 0);
  const maxUses = Number(row.max_uses || 1);
  if (currentUses >= maxUses) {
    return false;
  }

  if (row.code_valid_until) {
    const expiresAt = new Date(row.code_valid_until);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
      return false;
    }
  }

  return true;
}

function isReportStatusUnsolved(status: unknown) {
  const normalized = `${status || ""}`.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return !["resolved", "solve", "solved", "closed", "done"].some((keyword) => normalized.includes(keyword));
}

function countUnsolvedReports(payload: ControlCenterResponse | null | undefined) {
  if (!payload) {
    return null;
  }

  const reports = payload.sections?.reports;
  if (Array.isArray(reports) && reports.length > 0) {
    return reports.filter((report) => isReportStatusUnsolved(report.status)).length;
  }

  return typeof payload.quickMetrics?.openReports === "number" ? payload.quickMetrics.openReports : null;
}

function countReviews(bookings: EarlyAccessBookingRow[]) {
  return bookings.filter((booking) => {
    const rating = Number(booking.review_rating || 0);
    const reviewText = `${booking.review_text || ""}`.trim();
    return rating > 0 || reviewText.length > 0;
  }).length;
}

function formatUsDateTime(now: Date) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_OVERVIEW_TIME_ZONE,
    dateStyle: "full",
  }).format(now);

  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_OVERVIEW_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(now);

  const time = timeParts
    .filter((part) => part.type !== "timeZoneName")
    .map((part) => part.value)
    .join("")
    .trim();
  const timeZoneName = timeParts.find((part) => part.type === "timeZoneName")?.value || "ET";

  return {
    date: formattedDate,
    time,
    timeZone: ADMIN_OVERVIEW_TIME_ZONE,
    timeZoneName,
    value: `${formattedDate} ${time} ${timeZoneName}`.trim(),
  };
}

async function countTodaysPurchases(
  purchaseSummaryRows: PurchaseSummaryRow[] | null,
  authorization: string,
  todayKey: string
) {
  if (!purchaseSummaryRows) {
    return { value: null as number | null, hadErrors: false };
  }

  let count = 0;
  const userIdsNeedingDetail: string[] = [];

  for (const row of purchaseSummaryRows) {
    const numericDirectCount =
      Number(row.purchaseCountToday ?? row.purchase_count_today ?? row.today_purchase_count ?? Number.NaN);
    if (Number.isFinite(numericDirectCount)) {
      count += Math.max(0, numericDirectCount);
      continue;
    }

    const directDateKey = readRecordDateKey(
      row as Record<string, unknown>,
      ["purchase_date", "latest_purchase_date", "last_purchase_date"],
      ADMIN_OVERVIEW_TIME_ZONE
    );

    if (directDateKey) {
      if (directDateKey === todayKey) {
        count += 1;
      }
      continue;
    }

    if (row.has_purchases && row.id) {
      userIdsNeedingDetail.push(row.id);
    }
  }

  if (userIdsNeedingDetail.length === 0) {
    return { value: count, hadErrors: false };
  }

  const detailResults = await Promise.allSettled(
    userIdsNeedingDetail.map((userId) =>
      fetchApiJson<PurchaseHistoryRow[]>(`/api/v1/customers/${userId}/purchase-history`, authorization)
    )
  );

  let hadErrors = false;

  detailResults.forEach((result) => {
    if (result.status !== "fulfilled") {
      hadErrors = true;
      return;
    }

    result.value.forEach((purchase) => {
      const purchaseDateKey = toDateKeyInTimeZone(purchase.purchase_date || "", ADMIN_OVERVIEW_TIME_ZONE);
      if (purchaseDateKey === todayKey) {
        count += 1;
      }
    });
  });

  return { value: count, hadErrors };
}

function createCountMetric(
  key: CountMetricKey,
  label: string,
  description: string,
  value: number | null,
  action?: MetricAction
): CountMetric {
  return {
    key,
    slug: METRIC_SLUGS[key],
    label,
    description,
    kind: "count",
    value,
    action,
  };
}

async function buildAdminOverviewPayload(authorization: string): Promise<AdminOverviewPayload> {
  const now = new Date();
  const todayKey = toDateKeyInTimeZone(now, ADMIN_OVERVIEW_TIME_ZONE) || "";

  const [controlCenterResult, usersResult, sessionsResult, customersResult, promoCodesResult, earlyAccessResult, purchaseSummaryResult] =
    await Promise.allSettled([
      fetchAdminDashboardJson<ControlCenterResponse>("/api/v1/dashboard/control-center", authorization),
      fetchAdminDashboardJson<DashboardUserRow[]>("/api/v1/dashboard/users", authorization),
      fetchAdminDashboardJson<DashboardSessionRow[]>("/api/v1/dashboard/sessions", authorization),
      fetchApiJson<CustomerRow[]>("/api/v1/customers", authorization),
      fetchApiJson<PromoCodesResponse>("/api/v1/promo/admin/codes", authorization),
      fetchApiJson<EarlyAccessOverviewResponse>("/api/v1/appointments/admin/early-access/overview", authorization),
      fetchApiJson<PurchaseSummaryRow[]>("/api/v1/customers/purchase-history-all", authorization),
    ]);

  const errors: Record<string, string> = {};
  const getSettledValue = <T,>(key: string, result: PromiseSettledResult<T>) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    errors[key] = result.reason instanceof Error ? result.reason.message : "Request failed.";
    return null;
  };

  const controlCenter = getSettledValue("controlCenter", controlCenterResult);
  const users = getSettledValue("users", usersResult);
  const sessions = getSettledValue("sessions", sessionsResult);
  const customers = getSettledValue("customers", customersResult);
  const promoCodes = getSettledValue("promoCodes", promoCodesResult);
  const earlyAccess = getSettledValue("earlyAccess", earlyAccessResult);
  const purchaseSummary = getSettledValue("purchaseSummary", purchaseSummaryResult);

  const todaysNewUsers =
    users?.filter((user) => {
      const createdAt = extractTimestamp(user.createdAt);
      return createdAt ? toDateKeyInTimeZone(createdAt, ADMIN_OVERVIEW_TIME_ZONE) === todayKey : false;
    }).length ?? null;

  const todaysSessionCount =
    sessions?.filter((session) => {
      return session.sessionStartTime ? toDateKeyInTimeZone(session.sessionStartTime, ADMIN_OVERVIEW_TIME_ZONE) === todayKey : false;
    }).length ?? null;

  const todaysEventAppointments =
    earlyAccess?.bookings?.filter((booking) => {
      const status = `${booking.status || ""}`.trim().toLowerCase();
      return booking.slot?.event_date === todayKey && status !== "cancelled" && status !== "canceled";
    }).length ?? null;

  const customerRows = customers || [];
  const proUsers = customers ? customerRows.filter((customer) => normalizePlan(customer.plan || customer.current_plan) === "pro").length : null;
  const premiumUsers = customers
    ? customerRows.filter((customer) => normalizePlan(customer.plan || customer.current_plan) === "premium").length
    : null;
  const freeUsers = customers
    ? customerRows.filter((customer) => normalizePlan(customer.plan || customer.current_plan) === "free").length
    : null;

  const activeUnclaimedRedeemCodes = promoCodes?.codes ? promoCodes.codes.filter((row) => isPromoCodeActiveUnclaimed(row, now)).length : null;
  const unsolvedReports = countUnsolvedReports(controlCenter);
  const reviews = earlyAccess?.bookings ? countReviews(earlyAccess.bookings) : null;
  const todaysPurchaseResult = await countTodaysPurchases(purchaseSummary, authorization, todayKey);
  if (todaysPurchaseResult.hadErrors) {
    errors.purchaseHistoryDetail = "One or more purchase-history detail requests failed.";
  }
  const todaysNewPurchases = todaysPurchaseResult.value;

  const usDateTime = formatUsDateTime(now);

  return {
    dashboardHref: "/brokeoctopus?section=user-management",
    generatedAt: now.toISOString(),
    isPartial: Object.keys(errors).length > 0,
    errors,
    metricOrder: METRIC_ORDER,
    metrics: {
      usDateTime: {
        key: "usDateTime",
        slug: METRIC_SLUGS.usDateTime,
        label: "US Date & Time",
        description: "Current admin operations clock in US Eastern time.",
        kind: "datetime",
        value: usDateTime.value,
        iso: now.toISOString(),
        date: usDateTime.date,
        time: usDateTime.time,
        timeZone: usDateTime.timeZone,
        timeZoneName: usDateTime.timeZoneName,
      },
      todaysNewUsers: createCountMetric(
        "todaysNewUsers",
        "Today's New Users",
        "Accounts created today in US Eastern time.",
        todaysNewUsers
      ),
      todaysNewPurchases: createCountMetric(
        "todaysNewPurchases",
        "Today's New Purchases",
        "Purchase records created today.",
        todaysNewPurchases
      ),
      todaysSessionCount: createCountMetric(
        "todaysSessionCount",
        "Today's Session Count",
        "Sessions started today.",
        todaysSessionCount
      ),
      todaysEventAppointments: createCountMetric(
        "todaysEventAppointments",
        "Today's Event Appointments",
        "Early-access appointments scheduled for today.",
        todaysEventAppointments
      ),
      proUsers: createCountMetric("proUsers", "Pro Users", "Users currently on the Pro plan.", proUsers),
      premiumUsers: createCountMetric("premiumUsers", "Premium Users", "Users currently on the Premium plan.", premiumUsers),
      freeUsers: createCountMetric("freeUsers", "Free Users", "Users not on Pro or Premium.", freeUsers),
      activeUnclaimedRedeemCodes: createCountMetric(
        "activeUnclaimedRedeemCodes",
        "Active Unclaimed Redeem Codes",
        "Promo codes that are active, not expired, and not yet claimed.",
        activeUnclaimedRedeemCodes
      ),
      unsolvedReports: createCountMetric(
        "unsolvedReports",
        "Unsolved Reports",
        "Open issue reports that still need admin action.",
        unsolvedReports,
        {
          label: "Check",
          href: "/brokeoctopus?section=reports",
          sectionId: "reports",
        }
      ),
      reviews: createCountMetric("reviews", "Reviews", "Submitted review records linked to early-access bookings.", reviews),
    },
  };
}

export async function getAdminOverviewPayload(authorization: string) {
  await assertAdminAccess(authorization);

  if (overviewCache && overviewCache.expiresAt > Date.now()) {
    return overviewCache.value;
  }

  const value = await buildAdminOverviewPayload(authorization);
  overviewCache = {
    value,
    expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
  };

  return value;
}

export function getOverviewMetricBySlug(payload: AdminOverviewPayload, slug: string) {
  const metricEntry = Object.values(payload.metrics).find((metric) => metric.slug === slug);
  return metricEntry || null;
}
