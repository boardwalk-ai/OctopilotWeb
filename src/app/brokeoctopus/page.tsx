const statCards = [
  { label: "Active Users", value: "12,480", delta: "+8.2%", tone: "neutral" },
  { label: "MRR", value: "$18,240", delta: "+12.4%", tone: "up" },
  { label: "Failed Payments", value: "14", delta: "Needs review", tone: "warn" },
  { label: "Open Reports", value: "7", delta: "2 urgent", tone: "warn" },
];

const queueCards = [
  {
    title: "Billing Queue",
    body: "Stripe disputes, failed renewals, and pending manual reviews.",
    action: "Open billing ops",
  },
  {
    title: "Referral Ops",
    body: "Track issued codes, redemptions, and fraud flags across campaigns.",
    action: "Inspect referrals",
  },
  {
    title: "AI Key Health",
    body: "Monitor provider rotation, exhausted pools, and fallback model pressure.",
    action: "Review key status",
  },
];

const recentActivity = [
  { time: "2 min ago", title: "Pro plan upgraded", meta: "lucastobyshelby@gmail.com" },
  { time: "8 min ago", title: "Referral redeemed", meta: "Code SSXXSS applied successfully" },
  { time: "19 min ago", title: "Failed payout retry", meta: "Stripe invoice #9X2 marked unpaid" },
  { time: "41 min ago", title: "Humanizer key rotated", meta: "StealthGPT pool fallback engaged" },
];

function toneClass(tone: string) {
  if (tone === "up") return "text-emerald-400";
  if (tone === "warn") return "text-red-400";
  return "text-white/58";
}

export default function BrokeOctopusPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[#070707] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 lg:px-8">
        <div className="rounded-[30px] border border-white/8 bg-[#0e0e0e] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] lg:p-7">
          <div className="flex flex-col gap-5 border-b border-white/8 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/35">BrokeOctopus</p>
              <h1 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.06em] text-white">Admin Dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/52">
                Web operations panel for plans, referrals, support load, and infrastructure pressure.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-full border border-white/10 bg-[#151515] px-5 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-400">
                Refresh snapshot
              </button>
              <button className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500">
                Open control center
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Overview</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Live business pulse</div>
                </div>
                <div className="rounded-full border border-red-500/30 bg-[#170d0d] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200">
                  Today
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {statCards.map((card) => (
                  <article key={card.label} className="rounded-[22px] border border-white/8 bg-[#151515] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">{card.label}</div>
                    <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{card.value}</div>
                    <div className={`mt-2 text-sm font-medium ${toneClass(card.tone)}`}>{card.delta}</div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Priority Flags</div>
              <div className="mt-4 space-y-3">
                {[
                  "3 users are pending manual billing recovery.",
                  "Referral redemptions spiked 41% over baseline.",
                  "One AI provider pool is within 8% of quota.",
                ].map((item) => (
                  <div key={item} className="rounded-[18px] border border-red-500/18 bg-[#160d0d] px-4 py-3 text-sm leading-6 text-white/78">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Ops Queues</div>
                <button className="rounded-full border border-white/10 bg-[#161616] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/72 transition hover:border-red-500/35 hover:text-white">
                  View all
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {queueCards.map((card) => (
                  <article key={card.title} className="rounded-[22px] border border-white/8 bg-[#151515] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{card.title}</div>
                        <p className="mt-2 text-sm leading-6 text-white/52">{card.body}</p>
                      </div>
                      <button className="rounded-full border border-white/10 bg-[#0f0f0f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/75 transition hover:border-red-500/35 hover:text-white">
                        {card.action}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Recent Activity</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Operator timeline</div>
                </div>
                <div className="rounded-full border border-white/10 bg-[#151515] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/72">
                  Auto-updating
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {recentActivity.map((item) => (
                  <article key={`${item.time}-${item.title}`} className="flex items-start gap-4 rounded-[22px] border border-white/8 bg-[#151515] px-4 py-4">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-base font-semibold text-white">{item.title}</div>
                        <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/35">{item.time}</div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-white/52">{item.meta}</div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {[
              ["Plan Controls", "Manage plan mappings, credit bundles, and expiration rules."],
              ["Referral Settings", "Tune campaign windows, reward values, and abuse limits."],
              ["Invoice Audit", "Review invoice state, resend failures, and export records."],
            ].map(([title, body]) => (
              <section key={title} className="rounded-[24px] border border-white/8 bg-[#101010] p-5">
                <div className="text-lg font-semibold text-white">{title}</div>
                <p className="mt-3 text-sm leading-6 text-white/52">{body}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
