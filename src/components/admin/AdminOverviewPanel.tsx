"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthService } from "@/services/AuthService";

type MetricAction = {
  label: string;
  href: string;
  sectionId?: string;
};

type CountMetric = {
  key:
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

type AdminOverviewResponse = {
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

type AdminOverviewPanelProps = {
  refreshKey: number;
  onOpenSection: (sectionId: string) => void;
};

async function adminFetch<T>(path: string) {
  const token = await AuthService.getIdToken(true);
  if (!token) {
    throw new Error("You need to be signed in as an admin.");
  }

  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "Admin request failed.");
  }

  return payload as T;
}

function formatCount(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString();
}

function OverviewMetricCard({
  metric,
  onOpenSection,
}: {
  metric: CountMetric;
  onOpenSection: (sectionId: string) => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[26px] border border-white/8 bg-[#101010] p-5">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-red-400/45 to-transparent" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/34">{metric.label}</div>
      <div className="mt-4 text-[2.6rem] font-semibold tracking-[-0.06em] text-white">{formatCount(metric.value)}</div>
      <p className="mt-3 min-h-[48px] text-sm leading-6 text-white/46">{metric.description}</p>
      {metric.action ? (
        <div className="mt-5">
          <button
            onClick={() => {
              if (metric.action?.sectionId) {
                onOpenSection(metric.action.sectionId);
              }
            }}
            className="rounded-full border border-white/10 bg-[#161616] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/78 transition hover:border-red-500/35 hover:text-red-200"
          >
            {metric.action.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default function AdminOverviewPanel({ refreshKey, onOpenSection }: AdminOverviewPanelProps) {
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      const payload = await adminFetch<AdminOverviewResponse>("/api/admin/overview");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load admin overview.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        void load();
      }
    };

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 60_000);

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const heroMetric = data?.metrics.usDateTime;
  const metricCards = data
    ? data.metricOrder
        .filter((key) => key !== "usDateTime")
        .map((key) => data.metrics[key as keyof AdminOverviewResponse["metrics"]])
        .filter((metric): metric is CountMetric => metric.kind === "count")
    : [];

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{error}</div> : null}

      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(255,110,91,0.22),_transparent_40%),linear-gradient(135deg,_#141414,_#080808)] p-6 lg:p-7">
        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/34">Admin Overview</div>
            <h2 className="mt-4 max-w-[10ch] text-[3rem] font-semibold leading-none tracking-[-0.08em] text-white">Overview Before Dashboard</h2>
            <p className="mt-4 max-w-[720px] text-sm leading-7 text-white/56">
              This is now the first screen after admin login. It surfaces live operations counts and lets you jump into the full dashboard only when you need to drill down.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onOpenSection("user-management")}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-red-500"
              >
                Open Main Dashboard
              </button>
              <button
                onClick={() => onOpenSection("reports")}
                className="rounded-full border border-white/10 bg-[#141414] px-5 py-3 text-sm font-semibold text-white/82 transition hover:border-red-500/35 hover:text-red-200"
              >
                Go To Reports
              </button>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/26 p-5 backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/34">
              {heroMetric?.label || "US Date & Time"}
            </div>
            <div className="mt-4 text-sm text-white/48">{heroMetric?.description || "Current US admin operations clock."}</div>
            <div className="mt-8 text-[1.15rem] font-medium text-white/72">{heroMetric?.date || (isBusy ? "Loading..." : "Unavailable")}</div>
            <div className="mt-2 text-[2.7rem] font-semibold tracking-[-0.08em] text-white">
              {heroMetric?.time || (isBusy ? "..." : "Unavailable")}
            </div>
            <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/58">
              {heroMetric ? `${heroMetric.timeZone} (${heroMetric.timeZoneName})` : "US/Eastern"}
            </div>
            <div className="mt-6 text-xs text-white/40">
              {data?.generatedAt ? `Last refreshed ${new Date(data.generatedAt).toLocaleString()}` : isBusy ? "Refreshing overview..." : "No overview data yet."}
            </div>
          </div>
        </div>
      </section>

      {data?.isPartial ? (
        <div className="rounded-[22px] border border-amber-500/25 bg-[#161109] px-5 py-4 text-sm text-amber-100">
          Some overview metrics are partially unavailable right now. The dashboard is still usable, but one or more source endpoints did not respond.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metricCards.length > 0 ? (
          metricCards.map((metric) => <OverviewMetricCard key={metric.key} metric={metric} onOpenSection={onOpenSection} />)
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-[#0f0f0f] px-5 py-10 text-center text-sm text-white/45 md:col-span-2 xl:col-span-3">
            {isBusy ? "Loading overview metrics..." : "No overview metrics are available yet."}
          </div>
        )}
      </div>
    </div>
  );
}
