import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES, ORDER_STATUSES, labelFor } from "@/lib/constants";
import { RFQ_QUEUE_STATUSES } from "../rfq/queue-statuses";
import { ChartCard } from "./charts/ChartCard";
import { HorizontalBarChart } from "./charts/HorizontalBarChart";
import { VerticalBarChart } from "./charts/VerticalBarChart";
import { GroupedBarChart } from "./charts/GroupedBarChart";
import { buildWeeklyCounts, buildMonthlyBuckets, buildMonthlyMix } from "./charts/buckets";
import { fmtMoney, fmtCompactMoney, fmtCount } from "./charts/colors";

export const dynamic = "force-dynamic";

const OPEN_STAGES = OPPORTUNITY_STAGES.filter((s) => s.value !== "won" && s.value !== "lost").map((s) => s.value);

type RangeKey = "month" | "90d" | "12m";
const RANGE_CONFIG: Record<RangeKey, { days: number; weeks: number; months: number; label: string }> = {
  month: { days: 30, weeks: 5, months: 3, label: "This Month" },
  "90d": { days: 90, weeks: 13, months: 6, label: "90 Days" },
  "12m": { days: 365, weeks: 26, months: 12, label: "12 Months" },
};

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

  const [
    urgentOrders,
    opportunityStageGroups,
    wonOpportunities,
    orderStatusGroups,
    needsPricingItems,
    rfqStageGroups,
    intakeOpportunities,
    standaloneOrders,
    mixOrders,
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
      select: { createdAt: true },
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
  const awaitingPaymentValue = orderStatusGroups.find((g) => g.status === "awaiting_payment")?._sum.orderValue ?? 0;

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

  // ---- RFQ health ----
  const avgDaysWaiting =
    needsPricingItems.length > 0
      ? Math.round(
          needsPricingItems.reduce((sum, i) => sum + (now.getTime() - i.createdAt.getTime()) / 86400000, 0) /
            needsPricingItems.length
        )
      : 0;
  const rfqCounts: Record<string, number> = {};
  for (const s of RFQ_QUEUE_STATUSES) rfqCounts[s.value] = 0;
  for (const g of rfqStageGroups) rfqCounts[g.rfqStatus] = g._count._all;

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
        <StatTile label="Awaiting Payment" value={fmtMoney(awaitingPaymentValue)} accent="var(--accent)" />
        <StatTile label="Items Needing Pricing" value={fmtCount(needsPricingItems.length)} accent="var(--primary)" />
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
