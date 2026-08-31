import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES, ORDER_STATUSES, labelFor } from "@/lib/constants";
import { RFQ_QUEUE_STATUSES, isDeadDealItem } from "../rfq/queue-statuses";
import { ChartCard } from "./charts/ChartCard";
import { HorizontalBarChart } from "./charts/HorizontalBarChart";
import { VerticalBarChart } from "./charts/VerticalBarChart";
import { GroupedBarChart } from "./charts/GroupedBarChart";
import { buildWeeklyCounts, buildMonthlyBuckets, buildMonthlyMix } from "./charts/buckets";
import { fmtMoney, fmtCompactMoney, fmtCount } from "./charts/colors";
import { QueueCard, type QueueRow } from "./QueueCard";

export const dynamic = "force-dynamic";

const OPEN_STAGES = OPPORTUNITY_STAGES.filter((s) => s.value !== "won" && s.value !== "lost").map((s) => s.value);

type RangeKey = "month" | "90d" | "12m";
const RANGE_CONFIG: Record<RangeKey, { days: number; weeks: number; months: number; label: string }> = {
  month: { days: 30, weeks: 5, months: 3, label: "This Month" },
  "90d": { days: 90, weeks: 13, months: 6, label: "90 Days" },
  "12m": { days: 365, weeks: 26, months: 12, label: "12 Months" },
};

/** Days between two dates, floored — used for every "N days ago / waiting" queue label. */
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="stat-card" style={{ "--accent-bar": accent } as React.CSSProperties}>
      <div className="section-label">{label}</div>
      <div className="stat-value mt-1">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range: RangeKey = rawRange === "month" || rawRange === "12m" ? rawRange : "90d";
  const cfg = RANGE_CONFIG[range];

  const now = new Date();
  const rangeStart = new Date(now.getTime() - cfg.days * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    urgentOrders,
    opportunityStageGroups,
    wonOpportunities,
    orderStatusGroups,
    needsPricingItemsRaw,
    rfqStageGroups,
    intakeOpportunities,
    standaloneOrders,
    mixOrders,
    followUpOpportunities,
    overdueTasks,
    ordersAwaitingPayment,
    posInFlight,
    poDeliveriesThisWeek,
    ordersDueThisWeek,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { urgency: { in: ["same_day", "emergency"] }, status: { notIn: ["delivered", "complete"] } },
      select: { id: true, title: true },
      orderBy: { neededByDate: "asc" },
    }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      where: { stage: { notIn: ["won", "lost"] } },
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.opportunity.findMany({
      where: { stage: "won" },
      select: {
        value: true,
        createdAt: true,
        orders: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { orderValue: true },
    }),
    prisma.lineItem.findMany({
      where: { rfqStatus: "needs_pricing" },
      select: { id: true, name: true, createdAt: true, orderId: true, opportunity: { select: { stage: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lineItem.groupBy({
      by: ["rfqStatus"],
      where: { rfqStatus: { in: RFQ_QUEUE_STATUSES.map((s) => s.value) as string[] } },
      _count: { _all: true },
    }),
    prisma.opportunity.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: rangeStart }, opportunityId: null },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { orderType: true, createdAt: true },
    }),
    // ---- Queue 2: follow-ups due (opportunities) ----
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["won", "lost"] }, nextFollowUp: { lte: endOfToday } },
      select: { id: true, title: true, nextFollowUp: true },
      orderBy: { nextFollowUp: "asc" },
    }),
    // ---- Queue 2: follow-ups due (overdue tasks) ----
    prisma.task.findMany({
      where: { dueDate: { lt: startOfToday }, status: { not: "done" } },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    }),
    // ---- Queue 4: orders awaiting payment (also feeds the stat tile) ----
    prisma.order.findMany({
      where: {
        OR: [{ status: "awaiting_payment" }, { status: "new", payments: { some: { status: { not: "paid" } } } }],
      },
      select: {
        id: true,
        title: true,
        orderType: true,
        orderValue: true,
        createdAt: true,
        payments: { select: { amount: true, status: true, type: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    // ---- Queue 5: POs awaiting acknowledgment / in transit ----
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["sent", "shipped"] } },
      select: {
        id: true,
        poNumber: true,
        status: true,
        sentDate: true,
        orderId: true,
        order: { select: { title: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { sentDate: "asc" },
    }),
    // ---- Queue 6: deliveries this week (POs) ----
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { scheduledDeliveryDate: { gte: now, lte: in7Days } },
          { expectedDelivery: { gte: now, lte: in7Days } },
        ],
      },
      select: {
        id: true,
        poNumber: true,
        orderId: true,
        scheduledDeliveryDate: true,
        expectedDelivery: true,
        order: { select: { title: true } },
      },
    }),
    // ---- Queue 6: deliveries this week (orders by neededByDate) ----
    prisma.order.findMany({
      where: { neededByDate: { gte: now, lte: in7Days }, status: { notIn: ["delivered", "complete"] } },
      select: { id: true, title: true, neededByDate: true },
    }),
  ]);

  // ---- KPI tiles ----
  const openPipelineValue = opportunityStageGroups.reduce((sum, g) => sum + (g._sum.value ?? 0), 0);
  const openPipelineCount = opportunityStageGroups.reduce((sum, g) => sum + g._count._all, 0);

  // "Won" date proxy: an opportunity has no wonAt timestamp, so we use the
  // createdAt of its earliest linked order (an order is created at the won
  // transition) — falling back to the opportunity's own createdAt for the
  // rare won opportunity with no order yet.
  const wonInRange = wonOpportunities
    .map((o) => ({ value: o.value ?? 0, date: o.orders[0]?.createdAt ?? o.createdAt }))
    .filter((o) => o.date >= rangeStart);
  const wonValueInRange = wonInRange.reduce((sum, o) => sum + o.value, 0);

  const openOrdersValue = orderStatusGroups
    .filter((g) => g.status !== "complete")
    .reduce((sum, g) => sum + (g._sum.orderValue ?? 0), 0);
  const openOrdersCount = orderStatusGroups
    .filter((g) => g.status !== "complete")
    .reduce((sum, g) => sum + g._count._all, 0);

  // ---- Chart (a): pipeline value by stage — current snapshot, not range-bound ----
  const stageChartData = OPEN_STAGES.map((stage) => {
    const g = opportunityStageGroups.find((x) => x.stage === stage);
    return { label: labelFor(OPPORTUNITY_STAGES, stage), value: g?._sum.value ?? 0 };
  });

  // ---- Chart (b): new intake per week ----
  // "New intake" = every opportunity's createdAt (every opportunity started as
  // an intake event) PLUS orders with no opportunityId (orders created directly
  // from a simple, no-pricing-needed intake). Orders that stem from a WON
  // opportunity are intentionally excluded — counting both would double the
  // same underlying intake event. Includes both form and manual submissions.
  const intakeDates = [...intakeOpportunities.map((o) => o.createdAt), ...standaloneOrders.map((o) => o.createdAt)];
  const intakeChartData = buildWeeklyCounts(intakeDates, cfg.weeks, now);

  // ---- Chart (c): won value by month ----
  const wonForChart = wonOpportunities.map((o) => ({
    amount: o.value ?? 0,
    date: o.orders[0]?.createdAt ?? o.createdAt,
  }));
  const wonChartData = buildMonthlyBuckets(wonForChart, cfg.months, now, "sum");

  // ---- Chart (d): orders by status — full fulfillment ladder, not range-bound ----
  const statusChartData = ORDER_STATUSES.map((s) => {
    const g = orderStatusGroups.find((x) => x.status === s.value);
    return { label: s.label, value: g?._count._all ?? 0 };
  });

  // ---- Chart (e): project vs order mix by month (the one 2-series chart) ----
  const mixChartData = buildMonthlyMix(
    mixOrders.map((o) => ({ date: o.createdAt, type: o.orderType })),
    cfg.months,
    now,
    "project"
  );

  // ---- Queue 3 / RFQ health: items needing pricing, minus dead deals (same rule as /rfq) ----
  const pricingItems = needsPricingItemsRaw.filter((i) => !isDeadDealItem(i));
  const avgDaysWaiting =
    pricingItems.length > 0
      ? Math.round(pricingItems.reduce((sum, i) => sum + daysBetween(now, i.createdAt), 0) / pricingItems.length)
      : 0;
  const rfqCounts: Record<string, number> = {};
  for (const s of RFQ_QUEUE_STATUSES) rfqCounts[s.value] = 0;
  for (const g of rfqStageGroups) rfqCounts[g.rfqStatus] = g._count._all;

  // ---- Queue 2: follow-ups due + overdue tasks, oldest first ----
  type FollowUpRow = { href: string; label: string; date: Date; overdue: boolean; kind: "Opportunity" | "Task" };
  const followUpRows: FollowUpRow[] = [
    ...followUpOpportunities.map((o) => ({
      href: `/pipeline/${o.id}`,
      label: o.title,
      date: o.nextFollowUp as Date,
      overdue: (o.nextFollowUp as Date) < startOfToday,
      kind: "Opportunity" as const,
    })),
    ...overdueTasks.map((t) => ({
      href: "/tasks",
      label: t.title,
      date: t.dueDate as Date,
      overdue: true,
      kind: "Task" as const,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // ---- Queue 4: orders awaiting payment (amount due + type), also drives the stat tile ----
  const awaitingPaymentRows = ordersAwaitingPayment.map((o) => {
    const nonPaid = o.payments.filter((p) => p.status !== "paid");
    const amountDue = nonPaid.length > 0 ? nonPaid.reduce((sum, p) => sum + p.amount, 0) : o.orderValue ?? 0;
    const paymentType = nonPaid[0]?.type ?? (o.orderType === "project" ? "deposit" : "full");
    return { id: o.id, title: o.title, amountDue, paymentType };
  });
  const awaitingPaymentValue = awaitingPaymentRows.reduce((sum, r) => sum + r.amountDue, 0);

  // ---- Queue 5: POs awaiting acknowledgment (sent) / in transit (shipped) ----
  const poQueueRows: QueueRow[] = posInFlight.slice(0, 5).map((po) => {
    const sentDaysAgo = po.status === "sent" && po.sentDate ? daysBetween(now, po.sentDate) : null;
    return {
      href: `/orders/${po.orderId}#purchase-orders`,
      primary: `${po.poNumber ?? "PO"} — ${po.order.title}`,
      secondary: po.supplier?.name ?? "No vendor",
      meta:
        po.status === "sent" ? (
          <span className={sentDaysAgo != null && sentDaysAgo > 5 ? "badge badge-orange" : "badge badge-blue"}>
            {sentDaysAgo != null ? `sent ${sentDaysAgo}d ago` : "sent"}
          </span>
        ) : (
          <span className="badge badge-blue">shipped</span>
        ),
    };
  });

  // ---- Queue 6: deliveries this week (POs + orders by neededByDate) ----
  type DeliveryRow = { href: string; label: string; date: Date; meta: string };
  const deliveryRows: DeliveryRow[] = [
    ...poDeliveriesThisWeek.map((po) => {
      const date = (po.scheduledDeliveryDate ?? po.expectedDelivery) as Date;
      return {
        href: `/orders/${po.orderId}#purchase-orders`,
        label: `${po.poNumber ?? "PO"} — ${po.order.title}`,
        date,
        meta: po.scheduledDeliveryDate ? "scheduled" : "expected",
      };
    }),
    ...ordersDueThisWeek.map((o) => ({
      href: `/orders/${o.id}`,
      label: o.title,
      date: o.neededByDate as Date,
      meta: "needed by",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Business health at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard?range=month" className={range === "month" ? "chip chip-active" : "chip"}>
            This month
          </Link>
          <Link href="/dashboard?range=90d" className={range === "90d" ? "chip chip-active" : "chip"}>
            90 days
          </Link>
          <Link href="/dashboard?range=12m" className={range === "12m" ? "chip chip-active" : "chip"}>
            12 months
          </Link>
        </div>
      </div>

      {urgentOrders.length > 0 && (
        <Link
          href="/orders"
          className="card card-interactive flex items-center gap-3 text-sm"
          style={{ borderLeftWidth: 4, borderLeftColor: "var(--red)", padding: "14px 20px" }}
        >
          <span className="badge badge-red shrink-0">{urgentOrders.length} urgent</span>
          <span className="truncate text-ink">
            {urgentOrders
              .slice(0, 3)
              .map((o) => o.title)
              .join(" · ")}
            {urgentOrders.length > 3 ? ` +${urgentOrders.length - 3} more` : ""}
          </span>
          <span className="ml-auto shrink-0 text-xs font-medium text-blue">View all →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label="Open Pipeline Value"
          value={fmtMoney(openPipelineValue)}
          sub={`${openPipelineCount} open`}
          accent="var(--primary)"
        />
        <StatTile label={`Won (${cfg.label})`} value={fmtMoney(wonValueInRange)} accent="var(--green)" />
        <StatTile
          label="Open Orders Value"
          value={fmtMoney(openOrdersValue)}
          sub={`${openOrdersCount} open`}
          accent="var(--primary)"
        />
        <StatTile
          label="Awaiting Payment"
          value={fmtMoney(awaitingPaymentValue)}
          sub={`${awaitingPaymentRows.length} order${awaitingPaymentRows.length === 1 ? "" : "s"}`}
          accent="var(--accent)"
        />
        <StatTile label="Items Needing Pricing" value={fmtCount(pricingItems.length)} accent="var(--primary)" />
      </div>

      {/* Queue 2: Follow-ups due — opportunities + overdue tasks share one card, but each
          record type keeps its own "View all" (opportunities have no combined view). */}
      <div className="card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="section-label flex items-center gap-2">
            Follow-ups Due
            <span className="badge badge-gray">{followUpRows.length}</span>
          </h3>
          {followUpRows.length > 0 && (
            <div className="flex shrink-0 gap-3 text-xs font-medium">
              <Link href="/pipeline" className="text-blue transition-colors hover:underline">
                Pipeline →
              </Link>
              <Link href="/tasks" className="text-blue transition-colors hover:underline">
                Tasks →
              </Link>
            </div>
          )}
        </div>
        {followUpRows.length === 0 ? (
          <div className="empty-state mt-2">
            Nothing due. Follow-ups come from an opportunity&apos;s next-follow-up date and task due dates.
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {followUpRows.slice(0, 5).map((row, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={row.href} className="min-w-0 flex-1 truncate text-blue transition-colors hover:underline">
                  {row.label}
                </Link>
                <span className="shrink-0 text-xs text-gray-dark">{row.kind}</span>
                {row.overdue ? (
                  <span className="badge badge-orange shrink-0">Overdue</span>
                ) : (
                  <span className="shrink-0 text-xs text-gray-dark">{row.date.toLocaleDateString()}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Queue 3: Items needing pricing */}
        <QueueCard
          title="Items Needing Pricing"
          count={pricingItems.length}
          viewAllHref="/rfq"
          rows={pricingItems.slice(0, 5).map(
            (item): QueueRow => {
              const wait = daysBetween(now, item.createdAt);
              return {
                href: `/rfq#li-${item.id}`,
                primary: item.name,
                meta: <span className={wait > 7 ? "font-medium text-orange" : "text-gray-dark"}>{wait}d waiting</span>,
              };
            }
          )}
          emptyText={
            <>
              Nothing needs pricing. Items land here from Intake when they need a price.
            </>
          }
        />

        {/* Queue 4: Orders awaiting payment */}
        <QueueCard
          title="Orders Awaiting Payment"
          count={awaitingPaymentRows.length}
          viewAllHref="/orders?status=awaiting_payment"
          rows={awaitingPaymentRows.slice(0, 5).map(
            (o): QueueRow => ({
              href: `/orders/${o.id}#payments`,
              primary: o.title,
              secondary: o.paymentType,
              meta: fmtMoney(o.amountDue),
            })
          )}
          emptyText="Nothing awaiting payment. Orders land here once a deposit or full payment is due but not yet paid."
        />

        {/* Queue 5: POs awaiting acknowledgment / in transit */}
        <QueueCard
          title="POs Awaiting Acknowledgment / In Transit"
          count={posInFlight.length}
          viewAllHref="/orders"
          rows={poQueueRows}
          emptyText="No POs in flight. They'll show up here once one is sent to a vendor."
        />

        {/* Queue 6: Deliveries this week */}
        <QueueCard
          title="Deliveries This Week"
          count={deliveryRows.length}
          viewAllHref="/orders?due=week"
          rows={deliveryRows.slice(0, 5).map(
            (row): QueueRow => ({
              href: row.href,
              primary: row.label,
              secondary: row.meta,
              meta: row.date.toLocaleDateString(),
            })
          )}
          emptyText="Nothing scheduled to arrive this week."
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ChartCard
          title="Pipeline value by stage"
          hasData={stageChartData.some((d) => d.value > 0)}
          tableHead={["Stage", "Value"]}
          tableRows={stageChartData.map((d) => [d.label, fmtMoney(d.value)])}
          emptyText="No open pipeline yet."
        >
          <HorizontalBarChart data={stageChartData} formatValue={fmtCompactMoney} />
        </ChartCard>

        <ChartCard
          title="New intake per week"
          hasData={intakeChartData.some((d) => d.value > 0)}
          tableHead={["Week of", "New intake"]}
          tableRows={intakeChartData.map((d) => [d.label, d.value])}
          emptyText="No intake in this period."
        >
          <VerticalBarChart data={intakeChartData} formatValue={fmtCount} />
        </ChartCard>

        <ChartCard
          title="Won value by month"
          hasData={wonChartData.some((d) => d.value > 0)}
          tableHead={["Month", "Won value"]}
          tableRows={wonChartData.map((d) => [d.label, fmtMoney(d.value)])}
          emptyText="Nothing won in this period."
        >
          <VerticalBarChart data={wonChartData} formatValue={fmtCompactMoney} />
        </ChartCard>

        <ChartCard
          title="Orders by status"
          hasData={statusChartData.some((d) => d.value > 0)}
          tableHead={["Status", "Orders"]}
          tableRows={statusChartData.map((d) => [d.label, d.value])}
          emptyText="No orders yet."
        >
          <HorizontalBarChart data={statusChartData} formatValue={fmtCount} />
        </ChartCard>

        <ChartCard
          title="Project vs Order mix by month"
          hasData={mixChartData.some((d) => d.a > 0 || d.b > 0)}
          tableHead={["Month", "Project", "Order"]}
          tableRows={mixChartData.map((d) => [d.label, d.a, d.b])}
          emptyText="No orders in this period."
        >
          <GroupedBarChart data={mixChartData} seriesLabels={["Project", "Order"]} formatValue={fmtCount} />
        </ChartCard>
      </div>

      <div className="card">
        <h3 className="section-label">RFQ Health</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip cursor-default">Avg wait: {avgDaysWaiting}d</span>
          {RFQ_QUEUE_STATUSES.map((s) => (
            <span key={s.value} className="chip cursor-default">
              {s.label}: {rfqCounts[s.value] ?? 0}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
