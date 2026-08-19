import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { URGENCY_COLORS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function fmtMoney(v: number | null | undefined) {
  if (v == null) return "$0";
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function DashboardPage() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const [
    openOpportunities,
    needsPricingCount,
    ordersInFlight,
    overdueOpps,
    overdueOrders,
    overdueItems,
    urgentOrders,
    followUpOpps,
    followUpOrders,
    followUpItems,
    awaitingPaymentOrders,
    staleNeedsPricingItems,
    recentActivity,
  ] = await Promise.all([
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["won", "lost"] } },
      select: { value: true },
    }),
    prisma.lineItem.count({ where: { rfqStatus: "needs_pricing" } }),
    prisma.order.count({ where: { status: { notIn: ["complete", "delivered"] } } }),
    prisma.opportunity.count({ where: { nextFollowUp: { lt: now }, stage: { notIn: ["won", "lost"] } } }),
    prisma.order.count({ where: { nextFollowUp: { lt: now }, status: { notIn: ["complete"] } } }),
    prisma.lineItem.count({ where: { nextFollowUp: { lt: now }, followedUp: false, rfqStatus: { not: "removed" } } }),
    prisma.order.findMany({
      where: { urgency: { in: ["same_day", "emergency"] }, status: { notIn: ["delivered", "complete"] } },
      include: { company: true },
    }),
    prisma.opportunity.findMany({
      where: { nextFollowUp: { gte: now, lte: in7Days }, stage: { notIn: ["won", "lost"] } },
      select: { id: true, title: true, nextFollowUp: true },
    }),
    prisma.order.findMany({
      where: { nextFollowUp: { gte: now, lte: in7Days } },
      select: { id: true, title: true, nextFollowUp: true },
    }),
    prisma.lineItem.findMany({
      where: { nextFollowUp: { gte: now, lte: in7Days }, rfqStatus: { not: "removed" } },
      select: { id: true, name: true, nextFollowUp: true, orderId: true, opportunityId: true },
    }),
    prisma.order.findMany({
      where: { status: "awaiting_payment" },
      select: { id: true, title: true },
    }),
    prisma.lineItem.findMany({
      where: { rfqStatus: "needs_pricing", createdAt: { lt: threeDaysAgo } },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.activityLog.findMany({ orderBy: { at: "desc" }, take: 10 }),
  ]);

  const pipelineValue = openOpportunities.reduce((sum, o) => sum + (o.value ?? 0), 0);
  const overdueFollowUps = overdueOpps + overdueOrders + overdueItems;

  urgentOrders.sort((a, b) => {
    const rank: Record<string, number> = { emergency: 0, same_day: 1 };
    return (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9);
  });

  const followUps = [
    ...followUpOpps.map((o) => ({ href: `/pipeline/${o.id}`, label: `Opportunity: ${o.title}`, date: o.nextFollowUp })),
    ...followUpOrders.map((o) => ({ href: `/orders/${o.id}`, label: `Order: ${o.title}`, date: o.nextFollowUp })),
    ...followUpItems.map((i) => ({
      href: i.orderId ? `/orders/${i.orderId}` : i.opportunityId ? `/pipeline/${i.opportunityId}` : "#",
      label: `Line item: ${i.name}`,
      date: i.nextFollowUp,
    })),
  ].sort((a, b) => (a.date && b.date ? new Date(a.date).getTime() - new Date(b.date).getTime() : 0));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">What needs attention across sales, RFQ, and fulfillment.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open Opportunities" value={String(openOpportunities.length)} sub={fmtMoney(pipelineValue)} />
        <StatCard label="Needs Pricing" value={String(needsPricingCount)} sub="line items" />
        <StatCard label="Orders In Flight" value={String(ordersInFlight)} sub="not complete/delivered" />
        <StatCard label="Overdue Follow-ups" value={String(overdueFollowUps)} sub="across all records" alert={overdueFollowUps > 0} />
      </div>

      <section>
        <h2 className="section-label mb-2 text-red" style={{ color: "var(--red)" }}>
          Urgent — Same Day / Emergency
        </h2>
        {urgentOrders.length === 0 ? (
          <div className="empty-state">No urgent orders outstanding.</div>
        ) : (
          <div className="space-y-2">
            {urgentOrders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className={`card flex items-center justify-between border-l-4 px-4 py-3 text-sm hover:bg-hover ${
                  o.urgency === "emergency" ? "border-l-red" : "border-l-orange"
                }`}
                style={{ borderLeftColor: o.urgency === "emergency" ? "var(--red)" : "var(--orange)" }}
              >
                <div>
                  <span className="font-medium text-ink">{o.title}</span>{" "}
                  <span className="text-gray-dark">— {o.company?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${URGENCY_COLORS[o.urgency] ?? "badge-gray"}`}>
                    {o.urgency.replace("_", " ")}
                  </span>
                  <span className="text-xs text-gray-dark">Needed: {fmtDate(o.neededByDate)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="section-label mb-2">Follow-ups Due (next 7 days)</h2>
          {followUps.length === 0 ? (
            <div className="empty-state">Nothing due this week.</div>
          ) : (
            <ul className="card space-y-1.5 p-3">
              {followUps.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <Link href={f.href} className="text-blue hover:underline">
                    {f.label}
                  </Link>
                  <span className="text-xs text-gray-dark">{fmtDate(f.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="section-label mb-2">Needs Attention</h2>
          <ul className="card space-y-1.5 p-3 text-sm">
            {awaitingPaymentOrders.map((o) => (
              <li key={`o-${o.id}`}>
                <Link href={`/orders/${o.id}`} className="text-blue hover:underline">
                  Order awaiting payment: {o.title}
                </Link>
              </li>
            ))}
            {staleNeedsPricingItems.map((i) => (
              <li key={`i-${i.id}`}>
                <Link href="/rfq" className="text-blue hover:underline">
                  Needs pricing (3+ days): {i.name}
                </Link>
              </li>
            ))}
            {awaitingPaymentOrders.length === 0 && staleNeedsPricingItems.length === 0 && (
              <li className="text-gray">Nothing needs attention right now.</li>
            )}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="section-label mb-2">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <div className="empty-state">No activity yet.</div>
        ) : (
          <ul className="card space-y-1 p-3 text-sm">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className="text-gray-dark">
                  <span className="text-gray">[{a.action}]</span> {a.detail}
                </span>
                <span className="text-xs text-gray">{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`stat-card ${alert ? "border-red" : ""}`} style={alert ? { borderColor: "var(--red)" } : undefined}>
      <div className="section-label">{label}</div>
      <div className={`stat-value mt-1 ${alert ? "text-red" : ""}`} style={alert ? { color: "var(--red)" } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-gray">{sub}</div>}
    </div>
  );
}
