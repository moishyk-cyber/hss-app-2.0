import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  OPPORTUNITY_STAGES,
  ORDER_STATUSES,
  RFQ_STATUSES,
  TASK_STATUSES,
  ORDER_STATUS_COLORS,
  RFQ_STATUS_COLORS,
  STAGE_COLORS,
  labelFor,
} from "@/lib/constants";
import { currentUserId } from "@/lib/identityServer";
import { RFQ_QUEUE_STATUSES, isDeadDealItem } from "../rfq/queue-statuses";
import { ChartCard } from "./charts/ChartCard";
import { HorizontalBarChart } from "./charts/HorizontalBarChart";
import { VerticalBarChart } from "./charts/VerticalBarChart";
import { GroupedBarChart } from "./charts/GroupedBarChart";
import { buildWeeklyCounts, buildMonthlyBuckets, buildMonthlyMix } from "./charts/buckets";
import { fmtMoney, fmtCompactMoney, fmtCount } from "./charts/colors";
import { QueueCard, type QueueRow } from "./QueueCard";
import { DashboardTabs } from "./DashboardTabs";
import { RangePicker } from "./RangePicker";
import { resolveRange } from "./ranges";

export const dynamic = "force-dynamic";

const OPEN_STAGES = OPPORTUNITY_STAGES.filter((s) => s.value !== "won" && s.value !== "lost").map((s) => s.value);
const RFQ_QUEUE_VALUES = RFQ_QUEUE_STATUSES.map((s) => s.value) as string[];

/** Days between two dates, floored - used for every "N days ago / waiting" queue label. */
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <div className="section-label">{label}</div>
      <div className="stat-value mt-1">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray">{sub}</div>}
    </div>
  );
}

/** Date chip for a follow-up / due / needed-by date, flagged when it is past due. */
function DateChip({ date, overdue, prefix }: { date: Date | null; overdue: boolean; prefix: string }) {
  if (!date) return <span className="empty-value text-xs">no date</span>;
  return (
    <span className={overdue ? "badge badge-orange" : "badge badge-gray"}>
      {overdue ? "Overdue " : `${prefix} `}
      {date.toLocaleDateString()}
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range: rawRange, from, to } = await searchParams;

  const now = new Date();
  const cfg = resolveRange(now, rawRange, from, to);
  const rangeStart = cfg.start;
  const rangeEnd = cfg.end;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // "Working as" identity from the sidebar cookie. The sentinel keeps the
  // My Items queries in the same parallel batch without matching any row.
  const userId = await currentUserId();
  const mineId = userId ?? "__no_identity__";

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
    ordersAwaitingPayment,
    posInFlight,
    poDeliveriesThisWeek,
    ordersDueThisWeek,
    myDeals,
    myOrders,
    myTasks,
    myPricingItemsRaw,
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
      where: { rfqStatus: { in: RFQ_QUEUE_VALUES } },
      _count: { _all: true },
    }),
    prisma.opportunity.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd }, opportunityId: null },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { orderType: true, createdAt: true },
    }),
    // ---- Team queue: orders awaiting payment (also feeds the stat tile) ----
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
    // ---- Team queue: POs awaiting acknowledgment / in transit ----
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
    // ---- Team queue: deliveries this week (POs) ----
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
    // ---- Team queue: deliveries this week (orders by neededByDate) ----
    prisma.order.findMany({
      where: { neededByDate: { gte: now, lte: in7Days }, status: { notIn: ["delivered", "complete"] } },
      select: { id: true, title: true, neededByDate: true },
    }),
    // ---- My Items: everything OPEN with my name on it. With no identity
    // picked, `mineId` matches nothing, so these come back empty and the tab
    // shows its "pick your name" empty state instead. ----
    prisma.opportunity.findMany({
      where: { salespersonId: mineId, stage: { notIn: ["won", "lost"] } },
      select: { id: true, title: true, stage: true, nextFollowUp: true },
      orderBy: [{ nextFollowUp: "asc" }, { createdAt: "desc" }],
    }),
    prisma.order.findMany({
      where: { ownerId: mineId, status: { not: "complete" } },
      select: { id: true, title: true, status: true, neededByDate: true },
      orderBy: [{ neededByDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.task.findMany({
      where: { assigneeId: mineId, status: { not: "done" } },
      select: { id: true, title: true, status: true, dueDate: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.lineItem.findMany({
      where: { assigneeId: mineId, rfqStatus: { in: RFQ_QUEUE_VALUES } },
      select: {
        id: true,
        name: true,
        rfqStatus: true,
        createdAt: true,
        orderId: true,
        opportunity: { select: { stage: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Same dead-deal rule as /rfq: a lost opportunity's item stops being work.
  const myPricingItems = myPricingItemsRaw.filter((i) => !isDeadDealItem(i));

  // ---- KPI tiles ----
  const openPipelineValue = opportunityStageGroups.reduce((sum, g) => sum + (g._sum.value ?? 0), 0);
  const openPipelineCount = opportunityStageGroups.reduce((sum, g) => sum + g._count._all, 0);

  // "Won" date proxy: an opportunity has no wonAt timestamp, so we use the
  // createdAt of its earliest linked order (an order is created at the won
  // transition) - falling back to the opportunity's own createdAt for the
  // rare won opportunity with no order yet.
  const wonInRange = wonOpportunities
    .map((o) => ({ value: o.value ?? 0, date: o.orders[0]?.createdAt ?? o.createdAt }))
    .filter((o) => o.date >= rangeStart && o.date <= rangeEnd);
  const wonValueInRange = wonInRange.reduce((sum, o) => sum + o.value, 0);

  const openOrdersValue = orderStatusGroups
    .filter((g) => g.status !== "complete")
    .reduce((sum, g) => sum + (g._sum.orderValue ?? 0), 0);
  const openOrdersCount = orderStatusGroups
    .filter((g) => g.status !== "complete")
    .reduce((sum, g) => sum + g._count._all, 0);

  // ---- Chart (a): pipeline value by stage - current snapshot, not range-bound ----
  const stageChartData = OPEN_STAGES.map((stage) => {
    const g = opportunityStageGroups.find((x) => x.stage === stage);
    return { label: labelFor(OPPORTUNITY_STAGES, stage), value: g?._sum.value ?? 0 };
  });

  // ---- Chart (b): new intake per week ----
  // "New intake" = every opportunity's createdAt (every opportunity started as
  // an intake event) PLUS orders with no opportunityId (orders created directly
  // from a simple, no-pricing-needed intake). Orders that stem from a WON
  // opportunity are intentionally excluded - counting both would double the
  // same underlying intake event. Includes both form and manual submissions.
  const intakeDates = [...intakeOpportunities.map((o) => o.createdAt), ...standaloneOrders.map((o) => o.createdAt)];
  const intakeChartData = buildWeeklyCounts(intakeDates, cfg.weeks, rangeEnd);

  // ---- Chart (c): won value by month ----
  const wonForChart = wonOpportunities.map((o) => ({
    amount: o.value ?? 0,
    date: o.orders[0]?.createdAt ?? o.createdAt,
  }));
  const wonChartData = buildMonthlyBuckets(wonForChart, cfg.months, rangeEnd, "sum");

  // ---- Chart (d): orders by status - full fulfillment ladder, not range-bound ----
  const statusChartData = ORDER_STATUSES.map((s) => {
    const g = orderStatusGroups.find((x) => x.status === s.value);
    return { label: s.label, value: g?._count._all ?? 0 };
  });

  // ---- Chart (e): project vs order mix by month (the one 2-series chart) ----
  const mixChartData = buildMonthlyMix(
    mixOrders.map((o) => ({ date: o.createdAt, type: o.orderType })),
    cfg.months,
    rangeEnd,
    "project"
  );

  // ---- RFQ health: items needing pricing, minus dead deals (same rule as /rfq) ----
  const pricingItems = needsPricingItemsRaw.filter((i) => !isDeadDealItem(i));
  const avgDaysWaiting =
    pricingItems.length > 0
      ? Math.round(pricingItems.reduce((sum, i) => sum + daysBetween(now, i.createdAt), 0) / pricingItems.length)
      : 0;
  const rfqCounts: Record<string, number> = {};
  for (const s of RFQ_QUEUE_STATUSES) rfqCounts[s.value] = 0;
  for (const g of rfqStageGroups) rfqCounts[g.rfqStatus] = g._count._all;

  // ---- Team queue: orders awaiting payment (amount due + type), also drives the stat tile ----
  const awaitingPaymentRows = ordersAwaitingPayment.map((o) => {
    const nonPaid = o.payments.filter((p) => p.status !== "paid");
    const amountDue = nonPaid.length > 0 ? nonPaid.reduce((sum, p) => sum + p.amount, 0) : o.orderValue ?? 0;
    const paymentType = nonPaid[0]?.type ?? (o.orderType === "project" ? "deposit" : "full");
    return { id: o.id, title: o.title, amountDue, paymentType };
  });
  const awaitingPaymentValue = awaitingPaymentRows.reduce((sum, r) => sum + r.amountDue, 0);

  // ---- Team queue: POs awaiting acknowledgment (sent) / in transit (shipped) ----
  const poQueueRows: QueueRow[] = posInFlight.slice(0, 8).map((po) => {
    const sentDaysAgo = po.status === "sent" && po.sentDate ? daysBetween(now, po.sentDate) : null;
    return {
      href: `/orders/${po.orderId}#purchase-orders`,
      primary: `${po.poNumber ?? "PO"} - ${po.order.title}`,
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

  // ---- Team queue: deliveries this week (POs + orders by neededByDate) ----
  type DeliveryRow = { href: string; label: string; date: Date; meta: string };
  const deliveryRows: DeliveryRow[] = [
    ...poDeliveriesThisWeek.map((po) => {
      const date = (po.scheduledDeliveryDate ?? po.expectedDelivery) as Date;
      return {
        href: `/orders/${po.orderId}#delivery`,
        label: `${po.poNumber ?? "PO"} - ${po.order.title}`,
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

  // ------------------------------------------------------------------
  // Tab 1: Overview - the numbers and the graphs.
  // ------------------------------------------------------------------
  const overview = (
    <div className="space-y-8">
      {/* useSearchParams needs a boundary even on a force-dynamic page. */}
      <Suspense fallback={<div className="h-14" />}>
        <RangePicker />
      </Suspense>

      {urgentOrders.length > 0 && (
        <Link
          href="/orders"
          className="card card-interactive flex items-center gap-3 text-sm"
          style={{ padding: "14px 20px" }}
        >
          <span className="badge badge-red shrink-0">{urgentOrders.length} urgent</span>
          <span className="truncate text-ink">
            {urgentOrders
              .slice(0, 3)
              .map((o) => o.title)
              .join(" · ")}
            {urgentOrders.length > 3 ? ` +${urgentOrders.length - 3} more` : ""}
          </span>
          <span className="ml-auto shrink-0 text-xs font-medium text-blue">View all</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label="Open Pipeline Value"
          value={fmtMoney(openPipelineValue)}
          sub={`${openPipelineCount} open`}
        />
        <StatTile label={`Won (${cfg.label})`} value={fmtMoney(wonValueInRange)} />
        <StatTile
          label="Open Orders Value"
          value={fmtMoney(openOrdersValue)}
          sub={`${openOrdersCount} open`}
        />
        <StatTile
          label="Awaiting Payment"
          value={fmtMoney(awaitingPaymentValue)}
          sub={`${awaitingPaymentRows.length} order${awaitingPaymentRows.length === 1 ? "" : "s"}`}
        />
        <StatTile label="Items Needing Pricing" value={fmtCount(pricingItems.length)} />
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

  // ------------------------------------------------------------------
  // Tab 2: My Items - everything open with my name on it, then the team
  // queues that belong to nobody in particular.
  // ------------------------------------------------------------------
  const myItems = (
    <div className="space-y-8">
      {!userId ? (
        <div className="empty-state">
          Pick your name in the sidebar to see your items. Until then, only the team queues below apply to you.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <QueueCard
            title="My Deals"
            count={myDeals.length}
            viewAllHref="/pipeline"
            viewAllLabel="All deals"
            rows={myDeals.slice(0, 8).map(
              (d): QueueRow => ({
                href: `/pipeline/${d.id}`,
                primary: d.title,
                secondary: (
                  <span className={`badge ${STAGE_COLORS[d.stage] ?? "badge-gray"}`}>
                    {labelFor(OPPORTUNITY_STAGES, d.stage)}
                  </span>
                ),
                meta: (
                  <DateChip
                    date={d.nextFollowUp}
                    overdue={!!d.nextFollowUp && d.nextFollowUp < startOfToday}
                    prefix="Follow up"
                  />
                ),
              })
            )}
            emptyText="No open deals assigned to you. Deals land here when you are set as the salesperson."
          />

          <QueueCard
            title="My Orders"
            count={myOrders.length}
            viewAllHref="/orders"
            viewAllLabel="All orders"
            rows={myOrders.slice(0, 8).map(
              (o): QueueRow => ({
                href: `/orders/${o.id}`,
                primary: o.title,
                secondary: (
                  <span className={`badge ${ORDER_STATUS_COLORS[o.status] ?? "badge-gray"}`}>
                    {labelFor(ORDER_STATUSES, o.status)}
                  </span>
                ),
                meta: (
                  <DateChip
                    date={o.neededByDate}
                    overdue={!!o.neededByDate && o.neededByDate < startOfToday}
                    prefix="Needed"
                  />
                ),
              })
            )}
            emptyText="No open orders assigned to you. Orders land here when you are set as the owner."
          />

          <QueueCard
            title="My Tasks"
            count={myTasks.length}
            viewAllHref="/tasks"
            viewAllLabel="All tasks"
            rows={myTasks.slice(0, 8).map(
              (t): QueueRow => ({
                href: "/tasks",
                primary: t.title,
                secondary: <span className="text-xs text-gray-dark">{labelFor(TASK_STATUSES, t.status)}</span>,
                meta: (
                  <DateChip
                    date={t.dueDate}
                    overdue={!!t.dueDate && t.dueDate < startOfToday}
                    prefix="Due"
                  />
                ),
              })
            )}
            emptyText="No open tasks assigned to you. Tasks land here when someone assigns one to your name."
          />

          <QueueCard
            title="My Items to Price"
            count={myPricingItems.length}
            viewAllHref="/rfq"
            viewAllLabel="RFQ queue"
            rows={myPricingItems.slice(0, 8).map(
              (item): QueueRow => {
                const wait = daysBetween(now, item.createdAt);
                return {
                  href: `/rfq#li-${item.id}`,
                  primary: item.name,
                  secondary: (
                    <span className={`badge ${RFQ_STATUS_COLORS[item.rfqStatus] ?? "badge-gray"}`}>
                      {labelFor(RFQ_STATUSES, item.rfqStatus)}
                    </span>
                  ),
                  meta: <span className={wait > 7 ? "font-medium text-orange" : "text-gray-dark"}>{wait}d waiting</span>,
                };
              }
            )}
            emptyText="Nothing assigned to you to price. Items land here from Intake once they are assigned to you."
          />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="section-label">Team queues</h2>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <QueueCard
            title="Items Needing Pricing"
            count={pricingItems.length}
            viewAllHref="/rfq"
            rows={pricingItems.slice(0, 8).map(
              (item): QueueRow => {
                const wait = daysBetween(now, item.createdAt);
                return {
                  href: `/rfq#li-${item.id}`,
                  primary: item.name,
                  meta: <span className={wait > 7 ? "font-medium text-orange" : "text-gray-dark"}>{wait}d waiting</span>,
                };
              }
            )}
            emptyText="Nothing needs pricing. Items land here from Intake when they need a price."
          />

          <QueueCard
            title="Orders Awaiting Payment"
            count={awaitingPaymentRows.length}
            viewAllHref="/orders?status=awaiting_payment"
            rows={awaitingPaymentRows.slice(0, 8).map(
              (o): QueueRow => ({
                href: `/orders/${o.id}#invoice`,
                primary: o.title,
                secondary: o.paymentType,
                meta: fmtMoney(o.amountDue),
              })
            )}
            emptyText="Nothing awaiting payment. Orders land here once a deposit or full payment is due but not yet paid."
          />

          <QueueCard
            title="POs Awaiting Acknowledgment / In Transit"
            count={posInFlight.length}
            viewAllHref="/deliveries"
            rows={poQueueRows}
            emptyText="No POs in flight. They'll show up here once one is sent to a vendor."
          />

          <QueueCard
            title="Deliveries This Week"
            count={deliveryRows.length}
            viewAllHref="/deliveries"
            rows={deliveryRows.slice(0, 8).map(
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
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Business health at a glance.</p>
      </div>
      <DashboardTabs overview={overview} myItems={myItems} />
    </div>
  );
}
