import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  OPEN_SERVICE_ISSUE_STATUSES,
  labelFor,
} from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { orderBall, type OrderBallInput } from "@/lib/ballInCourt";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { DueCell, dueState, fmtMoney, paymentState, PAYMENT_STATE_COLORS } from "./utils";

/**
 * Just enough of an Order to compute orderBall() - a narrower stand-in for
 * ORDER_BALL_INCLUDE (@/lib/flow) so this list isn't dragging every payment/
 * PO/delivery column along for a badge. Kept structurally in sync with
 * OrderBallInput by hand; a tsc failure here means it drifted.
 */
const ORDER_BALL_SELECT = {
  status: true,
  orderType: true,
  orderValue: true,
  depositRequired: true,
  quoteStatus: true,
  paymentTerms: true,
  payments: { select: { status: true, amount: true } },
  company: { select: { requiresDeposit: true, depositPercent: true } },
  lineItems: { select: { rfqStatus: true, deliveryStatus: true, purchaseOrderId: true } },
  purchaseOrders: { select: { status: true } },
  deliveries: { select: { status: true } },
  _count: {
    select: { serviceIssues: { where: { status: { in: [...OPEN_SERVICE_ISSUE_STATUSES] } } } },
  },
} satisfies Prisma.OrderSelect;

type OrderBallRow = Prisma.OrderGetPayload<{ select: typeof ORDER_BALL_SELECT }>;

function toOrderBallInput(order: OrderBallRow): OrderBallInput {
  const { _count, ...rest } = order;
  return { ...rest, openIssueCount: _count.serviceIssues };
}

export const dynamic = "force-dynamic";

// Not a shared enum in lib/constants.ts (only two values, order-module local).
const ORDER_TYPE_OPTIONS = [
  { value: "order", label: "Order" },
  { value: "project", label: "Project" },
] as const;

/** RFQ statuses that mean the office is still pricing it (see ItemStatusChips). */
const BEING_PRICED = new Set(["needs_pricing", "rfq_sent", "quote_received"]);

/**
 * The row's one-line answer to "where is this order's stuff?" - the same
 * grouping the order header's item chips use, squeezed into a phrase:
 * "3/5 delivered · 1 pricing · 2 no PO". Null when there is nothing to say.
 */
function itemSummary(
  items: { rfqStatus: string; deliveryStatus: string; purchaseOrderId: string | null }[]
): string | null {
  const live = items.filter((i) => i.rfqStatus !== "removed");
  if (live.length === 0) return null;
  const delivered = live.filter((i) => i.deliveryStatus === "arrived_complete").length;
  const pricing = live.filter((i) => BEING_PRICED.has(i.rfqStatus)).length;
  const noPo = live.filter((i) => !BEING_PRICED.has(i.rfqStatus) && !i.purchaseOrderId).length;
  const parts = [`${delivered}/${live.length} delivered`];
  if (pricing > 0) parts.push(`${pricing} pricing`);
  if (noPo > 0) parts.push(`${noPo} no PO`);
  return parts.join(" · ");
}

type OrdersSearchParams = { status?: string; due?: string } & Record<string, string | string[] | undefined>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>;
}) {
  const sp = await searchParams;
  const { status, due } = sp;

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Status keeps its own chips above (?status=) - filterable:false here so the
  // two controls never fight over the same value.
  const FIELDS: ListField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "company", label: "Company", type: "text" },
    { key: "status", label: "Status", type: "enum", options: ORDER_STATUSES, filterable: false },
    { key: "orderType", label: "Order Type", type: "enum", options: ORDER_TYPE_OPTIONS },
    { key: "value", label: "Value", type: "number", filterable: false },
    { key: "neededBy", label: "Needed By", type: "date" },
    { key: "owner", label: "Owner", type: "enum", options: users.map((u) => ({ value: u.id, label: u.name })) },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (due === "week") {
    where.neededByDate = { gte: now, lte: in7Days };
    where.status = { notIn: ["delivered", "complete"] };
  }
  if (filters.title) where.title = { contains: filters.title, mode: "insensitive" };
  if (filters.company) where.company = { name: { contains: filters.company, mode: "insensitive" } };
  if (filters.orderType) where.orderType = filters.orderType;
  if (filters.owner) where.ownerId = filters.owner;
  if (filters.neededBy) {
    const day = new Date(filters.neededBy);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    where.neededByDate = { gte: day, lt: nextDay };
  }

  const ORDER_BY: Record<string, Prisma.OrderOrderByWithRelationInput> = {
    title: { title: sortDir },
    company: { company: { name: sortDir } },
    status: { status: sortDir },
    orderType: { orderType: sortDir },
    value: { orderValue: sortDir },
    neededBy: { neededByDate: sortDir },
    owner: { owner: { name: sortDir } },
  };
  const orderBy = sortKey ? ORDER_BY[sortKey] : undefined;

  const orders = await prisma.order.findMany({
    where,
    include: {
      company: { select: { id: true, name: true, requiresDeposit: true, depositPercent: true } },
      owner: { select: { id: true, name: true } },
      payments: ORDER_BALL_SELECT.payments,
      lineItems: ORDER_BALL_SELECT.lineItems,
      purchaseOrders: ORDER_BALL_SELECT.purchaseOrders,
      deliveries: ORDER_BALL_SELECT.deliveries,
      _count: ORDER_BALL_SELECT._count,
    },
    ...(orderBy ? { orderBy } : {}),
  });

  // Default view (no explicit sort chosen): soonest needed-by first, orders
  // with no due date last - the client asked to filter by due date instead
  // of a manual urgency flag.
  if (!orderBy) {
    orders.sort((a, b) => {
      const ad = a.neededByDate ? new Date(a.neededByDate).getTime() : Infinity;
      const bd = b.neededByDate ? new Date(b.neededByDate).getTime() : Infinity;
      return ad - bd;
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Orders</h1>
        <p className="page-sub">Fulfillment pipeline - payment, POs, delivery.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/orders" className={!status && !due ? "chip chip-active" : "chip"}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s.value} href={`/orders?status=${s.value}`} className={status === s.value ? "chip chip-active" : "chip"}>
            {s.label}
          </Link>
        ))}
        <Link href="/orders?due=week" className={due === "week" ? "chip chip-active" : "chip"}>
          Due this week
        </Link>
      </div>

      <Suspense>
        <ListControls fields={FIELDS} />
      </Suspense>

      {orders.length === 0 ? (
        <div className="empty-state">
          {status || due ? (
            "No orders match this filter."
          ) : (
            <>
              No orders yet. Orders are created automatically when an opportunity is won, or directly from a
              simple intake.{" "}
              <Link href="/intake" className="text-blue transition-colors hover:underline">
                Go to Intake
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          <ul className="divide-y divide-border">
            {orders.map((order) => {
              const due = dueState(order.neededByDate, order.status);
              const accent =
                due === "overdue" ? "border-l-4 border-red" : due === "soon" ? "border-l-4 border-orange" : "";
              const ps = paymentState(order.payments);
              const summary = itemSummary(order.lineItems);
              const ball = orderBall(toOrderBallInput(order));
              return (
                <li
                  key={order.id}
                  className={`relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover ${accent}`}
                >
                  <Avatar name={order.company?.name ?? "?"} kind="business" size="sm" />

                  <Link
                    href={`/orders/${order.id}`}
                    className="min-w-0 flex-[3] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                  >
                    {order.title}
                  </Link>

                  {summary ? (
                    <span className="hidden shrink-0 text-[12px] text-gray-dark xl:block">
                      {summary}
                    </span>
                  ) : null}

                  <span className="hidden w-20 shrink-0 text-right text-[12.5px] font-medium tabular-nums text-gray-dark sm:block">
                    {fmtMoney(order.orderValue)}
                  </span>

                  {/* Quiet by default (Moishy: "too many details") - badges only
                      when they say something: payment only while money is
                      still owed. Due-date urgency reads from the left accent
                      and the Due column instead of its own badge. */}
                  <span className="shrink-0">
                    <span className={`badge ${ORDER_STATUS_COLORS[order.status] ?? "badge-gray"}`}>
                      {labelFor(ORDER_STATUSES, order.status)}
                    </span>
                  </span>

                  {ps !== "paid" ? (
                    <span className="hidden shrink-0 md:block">
                      <span className={`badge ${PAYMENT_STATE_COLORS[ps]}`}>{ps}</span>
                    </span>
                  ) : null}

                  <span className="hidden shrink-0 xl:block">
                    <BallInCourtBadge ball={ball} />
                  </span>

                  <span className="hidden shrink-0 text-[12px] text-gray-dark lg:block">
                    <DueCell neededByDate={order.neededByDate} status={order.status} />
                  </span>

                  <span className="relative z-10 shrink-0">
                    {order.owner ? (
                      <span title={order.owner.name}>
                        <Avatar name={order.owner.name} kind="person" size="sm" />
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
