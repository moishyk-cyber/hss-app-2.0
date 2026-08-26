import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { URGENCY_COLORS } from "@/lib/constants";
import { PO_STATUS_COLORS } from "../orders/utils";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function fmtMoney(v: number | null | undefined) {
  if (v == null) return "$0";
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function dueMeta(date: Date, now: Date) {
  const d0 = new Date(date);
  d0.setHours(0, 0, 0, 0);
  const t0 = new Date(now);
  t0.setHours(0, 0, 0, 0);
  const days = Math.round((t0.getTime() - d0.getTime()) / 86400000);
  if (days <= 0) return "Due today";
  return `${days}d overdue`;
}
function daysWaiting(createdAt: Date, now: Date) {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86400000);
  return days <= 0 ? "today" : `${days}d waiting`;
}

type QueueRow = { href: string; primary: string; right: React.ReactNode };

function QueueCard({
  title,
  emoji,
  rows,
  totalCount,
  viewAllHref,
  emptyText,
  urgent,
}: {
  title: string;
  emoji?: string;
  rows: QueueRow[];
  totalCount: number;
  viewAllHref: string;
  emptyText: string;
  urgent?: boolean;
}) {
  return (
    <div className={`card p-4 ${urgent ? "border-l-4" : ""}`} style={urgent ? { borderLeftColor: "var(--red)" } : undefined}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="section-label">
          {emoji ? `${emoji} ` : ""}
          {title}
        </h2>
        {totalCount > 0 && <span className="badge badge-gray">{totalCount}</span>}
      </div>
      {rows.length === 0 ? (
        <div className="py-2 text-sm text-gray">{emptyText}</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r, i) => (
            <li key={i}>
              <Link
                href={r.href}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-hover"
              >
                <span className="truncate font-medium text-ink">{r.primary}</span>
                <span className="shrink-0">{r.right}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <Link href={viewAllHref} className="mt-2 inline-block text-xs font-medium text-blue transition-colors hover:underline">
          View all →
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    openOpportunities,
    needsPricingCount,
    ordersInFlightCount,
    urgentOrdersRaw,
    followUpOpps,
    followUpOrders,
    followUpItems,
    itemsNeedingPricing,
    ordersAwaitingPayment,
    posInFlight,
    deliveriesThisWeek,
  ] = await Promise.all([
    prisma.opportunity.findMany({ where: { stage: { notIn: ["won", "lost"] } }, select: { value: true } }),
    prisma.lineItem.count({ where: { rfqStatus: "needs_pricing" } }),
    prisma.order.count({ where: { status: { notIn: ["complete", "delivered"] } } }),
    prisma.order.findMany({
      where: { urgency: { in: ["same_day", "emergency"] }, status: { notIn: ["delivered", "complete"] } },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.opportunity.findMany({
      where: { nextFollowUp: { lte: endOfToday }, stage: { notIn: ["won", "lost"] } },
      select: { id: true, title: true, nextFollowUp: true },
    }),
    prisma.order.findMany({
      where: { nextFollowUp: { lte: endOfToday }, status: { notIn: ["complete"] } },
      select: { id: true, title: true, nextFollowUp: true },
    }),
    prisma.lineItem.findMany({
      where: { nextFollowUp: { lte: endOfToday }, followedUp: false, rfqStatus: { not: "removed" } },
      select: { id: true, name: true, nextFollowUp: true, orderId: true, opportunityId: true },
    }),
    prisma.lineItem.findMany({
      where: { rfqStatus: "needs_pricing" },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: { status: "awaiting_payment" },
      select: { id: true, title: true, orderValue: true, orderType: true, neededByDate: true, company: { select: { name: true } } },
      orderBy: { neededByDate: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["sent", "shipped"] } },
      include: { supplier: { select: { id: true, name: true } }, order: { select: { id: true, title: true } } },
      orderBy: { sentDate: "asc" },
    }),
    prisma.order.findMany({
      where: { neededByDate: { gte: now, lte: in7Days }, status: { notIn: ["delivered", "complete"] } },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { neededByDate: "asc" },
    }),
  ]);

  const pipelineValue = openOpportunities.reduce((sum, o) => sum + (o.value ?? 0), 0);

  const urgentOrders = [...urgentOrdersRaw].sort((a, b) => {
    const rank: Record<string, number> = { emergency: 0, same_day: 1 };
    const ur = (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9);
    if (ur !== 0) return ur;
    const ad = a.neededByDate ? new Date(a.neededByDate).getTime() : Infinity;
    const bd = b.neededByDate ? new Date(b.neededByDate).getTime() : Infinity;
    return ad - bd;
  });

  type FollowUp = { href: string; label: string; date: Date; kind: "opportunity" | "order" | "line_item" };
  const followUpsAll: FollowUp[] = [
    ...followUpOpps
      .filter((o) => o.nextFollowUp)
      .map((o) => ({ href: `/pipeline/${o.id}`, label: o.title, date: o.nextFollowUp as Date, kind: "opportunity" as const })),
    ...followUpOrders
      .filter((o) => o.nextFollowUp)
      .map((o) => ({ href: `/orders/${o.id}`, label: o.title, date: o.nextFollowUp as Date, kind: "order" as const })),
    ...followUpItems
      .filter((i) => i.nextFollowUp)
      .map((i) => ({
        href: i.orderId ? `/orders/${i.orderId}` : i.opportunityId ? `/pipeline/${i.opportunityId}` : "/rfq",
        label: i.name,
        date: i.nextFollowUp as Date,
        kind: "line_item" as const,
      })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const fuCounts = { opportunity: followUpOpps.length, order: followUpOrders.length, line_item: followUpItems.length };
  const topKind = (Object.entries(fuCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "order") as keyof typeof fuCounts;
  const followUpsViewAllHref = topKind === "opportunity" ? "/pipeline" : topKind === "line_item" ? "/rfq" : "/orders";

  const urgentRows: QueueRow[] = urgentOrders.slice(0, 5).map((o) => ({
    href: `/orders/${o.id}`,
    primary: `${o.title} — ${o.company?.name ?? "—"}`,
    right: (
      <span className="flex items-center gap-2">
        <span className={`badge ${URGENCY_COLORS[o.urgency] ?? "badge-gray"}`}>{o.urgency.replace("_", " ")}</span>
        <span className="text-xs text-gray-dark">{fmtDate(o.neededByDate)}</span>
      </span>
    ),
  }));

  const followUpRows: QueueRow[] = followUpsAll.slice(0, 5).map((f) => ({
    href: f.href,
    primary: f.label,
    right: <span className="text-xs text-gray-dark">{dueMeta(f.date, now)}</span>,
  }));

  const pricingRows: QueueRow[] = itemsNeedingPricing.slice(0, 5).map((i) => ({
    href: `/rfq#li-${i.id}`,
    primary: i.name,
    right: <span className="text-xs text-gray-dark">{daysWaiting(i.createdAt, now)}</span>,
  }));

  const paymentRows: QueueRow[] = ordersAwaitingPayment.slice(0, 5).map((o) => ({
    href: `/orders/${o.id}`,
    primary: `${o.title} — ${o.company?.name ?? "—"}`,
    right: (
      <span className="text-xs text-gray-dark">
        {fmtMoney(o.orderValue)} · {o.orderType === "project" ? "deposit" : "full"}
      </span>
    ),
  }));

  const poRows: QueueRow[] = posInFlight.slice(0, 5).map((po) => ({
    href: `/orders/${po.order.id}`,
    primary: `${po.poNumber ?? "PO"} — ${po.supplier?.name ?? "Supplier"}`,
    right: (
      <span className={`badge ${PO_STATUS_COLORS[po.status] ?? "badge-gray"}`}>
        {po.status === "sent" ? "awaiting ack" : "in transit"}
      </span>
    ),
  }));

  const deliveryRows: QueueRow[] = deliveriesThisWeek.slice(0, 5).map((o) => ({
    href: `/orders/${o.id}`,
    primary: `${o.title} — ${o.company?.name ?? "—"}`,
    right: <span className="text-xs text-gray-dark">{fmtDate(o.neededByDate)}</span>,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">What needs attention across sales, RFQ, and fulfillment.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="chip cursor-default">
          {openOpportunities.length} open opportunities · {fmtMoney(pipelineValue)}
        </span>
        <span className="chip cursor-default">{needsPricingCount} need pricing</span>
        <span className="chip cursor-default">{ordersInFlightCount} orders in flight</span>
        <span className="chip cursor-default">{followUpsAll.length} follow-ups due</span>
      </div>

      <QueueCard
        title="Urgent orders"
        emoji="🔴"
        urgent
        rows={urgentRows}
        totalCount={urgentOrders.length}
        viewAllHref="/orders"
        emptyText="No urgent orders outstanding."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QueueCard
          title="Follow-ups due"
          rows={followUpRows}
          totalCount={followUpsAll.length}
          viewAllHref={followUpsViewAllHref}
          emptyText="Nothing due today or overdue."
        />
        <QueueCard
          title="Items needing pricing"
          rows={pricingRows}
          totalCount={itemsNeedingPricing.length}
          viewAllHref="/rfq"
          emptyText="Nothing needs pricing."
        />
        <QueueCard
          title="Orders awaiting payment"
          rows={paymentRows}
          totalCount={ordersAwaitingPayment.length}
          viewAllHref="/orders?status=awaiting_payment"
          emptyText="No orders waiting on payment."
        />
        <QueueCard
          title="POs awaiting ack / in transit"
          rows={poRows}
          totalCount={posInFlight.length}
          viewAllHref="/orders?status=pos_in_progress"
          emptyText="No purchase orders in flight."
        />
        <QueueCard
          title="Deliveries this week"
          rows={deliveryRows}
          totalCount={deliveriesThisWeek.length}
          viewAllHref="/orders?due=week"
          emptyText="Nothing due for delivery this week."
        />
      </div>
    </div>
  );
}
