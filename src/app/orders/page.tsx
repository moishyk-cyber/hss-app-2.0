import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { QueryLink } from "@/lib/QueryLink";
import { PageHeader } from "@/lib/PageLayout";
import Link from "@/lib/IntentLink";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  OPEN_SERVICE_ISSUE_STATUSES,
  labelFor,
} from "@/lib/constants";
import { orderPhase } from "@/lib/flow";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { orderBall, type OrderBallInput } from "@/lib/ballInCourt";
import { getStageHolders, withHolder } from "@/lib/courtHolders";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { plainMoney, type PlainMoney } from "@/lib/money";
import { OrdersKanbanBoard, type OrderCard } from "./OrdersKanbanBoard";
import { DueCell, fmtMoney, paymentState, PAYMENT_STATE_COLORS } from "./utils";

/**
 * Just enough of an Order to compute orderBall() - a narrower stand-in for
 * ORDER_BALL_INCLUDE (@/lib/flow) so this list isn't dragging every payment/
 * PO/delivery column along for a badge. Kept structurally in sync with
 * OrderBallInput by hand; a tsc failure here means it drifted.
 *
 * It doubles as everything orderPhase() needs for the kanban board (FlowOrder:
 * gate inputs plus items/POs/deliveries), so the board costs no extra query.
 */
const ORDER_BALL_SELECT = {
  status: true,
  orderType: true,
  orderValue: true,
  depositRequired: true,
  quoteStatus: true,
  termsNotes: true,
  paymentTerms: true,
  payments: { select: { status: true, amount: true } },
  company: { select: { requiresDeposit: true, depositPercent: true } },
  lineItems: {
    select: { rfqStatus: true, deliveryStatus: true, purchaseOrderId: true },
  },
  purchaseOrders: { select: { status: true } },
  deliveries: { select: { status: true } },
  _count: {
    select: {
      serviceIssues: {
        where: { status: { in: [...OPEN_SERVICE_ISSUE_STATUSES] } },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type OrderBallRow = PlainMoney<
  Prisma.OrderGetPayload<{ select: typeof ORDER_BALL_SELECT }>
>;

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
  items: {
    rfqStatus: string;
    deliveryStatus: string;
    purchaseOrderId: string | null;
  }[],
): string | null {
  const live = items.filter((i) => i.rfqStatus !== "removed");
  if (live.length === 0) return null;
  const delivered = live.filter(
    (i) => i.deliveryStatus === "arrived_complete",
  ).length;
  const pricing = live.filter((i) => BEING_PRICED.has(i.rfqStatus)).length;
  const noPo = live.filter(
    (i) => !BEING_PRICED.has(i.rfqStatus) && !i.purchaseOrderId,
  ).length;
  const parts = [`${delivered}/${live.length} delivered`];
  if (pricing > 0) parts.push(`${pricing} pricing`);
  if (noPo > 0) parts.push(`${noPo} no PO`);
  return parts.join(" · ");
}

type OrdersSearchParams = {
  status?: string;
  due?: string;
  view?: string;
} & Record<string, string | string[] | undefined>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const due = sp.f_due ?? sp.due;
  const rawStatus =
    typeof sp.f_status === "string"
      ? sp.f_status
      : typeof sp.status === "string"
        ? sp.status
        : undefined;
  const status = ORDER_STATUSES.some((s) => s.value === rawStatus)
    ? rawStatus
    : undefined;

  // Board is the default view, matching /pipeline. The status chips and the
  // Sort by / Filter by controls belong to the list - the board is fed by the
  // flow engine and shows every live order, so it takes no filters.
  const isList = sp.view === "list";

  const [users, holders] = await Promise.all([
    getActiveUsers(),
    getStageHolders(),
  ]);

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Status keeps its own chips above (?status=) - filterable:false here so the
  // two controls never fight over the same value.
  const FIELDS: ListField[] = [
    { key: "title", label: "Title", type: "text" },
    {
      key: "due",
      label: "Needed within",
      type: "enum",
      options: [{ value: "week", label: "Next seven days" }],
      sortable: false,
    },
    { key: "company", label: "Company", type: "text" },
    {
      key: "status",
      label: "Status",
      type: "enum",
      options: ORDER_STATUSES,
      filterable: true,
    },
    {
      key: "orderType",
      label: "Order Type",
      type: "enum",
      options: ORDER_TYPE_OPTIONS,
    },
    { key: "value", label: "Value", type: "number", filterable: false },
    { key: "neededBy", label: "Needed By", type: "date" },
    {
      key: "owner",
      label: "Owner",
      type: "enum",
      options: users.map((u) => ({ value: u.id, label: u.name })),
    },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const where: Prisma.OrderWhereInput = {};
  {
    if (status) where.status = status;
    if (due === "week") {
      where.AND = [
        { neededByDate: { gte: now, lte: in7Days } },
        { status: { notIn: ["delivered", "complete"] } },
      ];
    }
    if (filters.title)
      where.title = { contains: filters.title, mode: "insensitive" };
    if (filters.company)
      where.company = {
        name: { contains: filters.company, mode: "insensitive" },
      };
    if (filters.orderType) where.orderType = filters.orderType;
    if (filters.owner) where.ownerId = filters.owner;
    if (filters.neededBy) {
      const day = new Date(filters.neededBy);
      const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      where.neededByDate = { gte: day, lt: nextDay };
    }
  }

  if (!isList && !status) where.status = { notIn: ["complete"] };

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

  // Money columns come back as Decimal; plain numbers from here on (the board
  // cards below go to a client component).
  const nestedWhere = compileFilterTree<Prisma.OrderWhereInput>(
    FIELDS,
    sp.filter_tree,
    {
      title: "title",
      company: "company.name",
      status: "status",
      orderType: "orderType",
      neededBy: "neededByDate",
      owner: "ownerId",
      due: () => ({
        neededByDate: { gte: now, lte: in7Days },
        status: { notIn: ["delivered", "complete"] },
      }),
    },
  );

  const orders = plainMoney(
    await prisma.order.findMany({
      take: limit + 1,
      where: { AND: [where, nestedWhere ?? {}] },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            requiresDeposit: true,
            depositPercent: true,
          },
        },
        owner: { select: { id: true, name: true } },
        payments: ORDER_BALL_SELECT.payments,
        lineItems: ORDER_BALL_SELECT.lineItems,
        purchaseOrders: ORDER_BALL_SELECT.purchaseOrders,
        deliveries: ORDER_BALL_SELECT.deliveries,
        _count: ORDER_BALL_SELECT._count,
      },
      orderBy: [
        orderBy ?? { neededByDate: { sort: "asc", nulls: "last" } },
        { id: "asc" },
      ],
    }),
  );

  const hasMore = orders.length > limit;
  if (hasMore) orders.pop();

  // Default view (no explicit sort chosen): soonest needed-by first, orders
  // with no due date last - the client asked to filter by due date instead
  // of a manual urgency flag. The board inherits this ordering per column.
  if (!orderBy) {
    orders.sort((a, b) => {
      const ad = a.neededByDate ? new Date(a.neededByDate).getTime() : Infinity;
      const bd = b.neededByDate ? new Date(b.neededByDate).getTime() : Infinity;
      return ad - bd;
    });
  }

  // Board cards. orderPhase() returns null for completed orders, which is how
  // they drop off the board without disappearing from the list.
  const cards: OrderCard[] = orders.flatMap((order) => {
    const phase = orderPhase(order);
    if (!phase) return [];
    return [
      {
        id: order.id,
        title: order.title,
        phase,
        status: order.status,
        companyName: order.company?.name ?? null,
        ownerName: order.owner?.name ?? null,
        value: order.orderValue,
        neededByDate: order.neededByDate,
        itemSummary: itemSummary(order.lineItems),
        ball: withHolder(orderBall(toOrderBallInput(order)), holders),
      },
    ];
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Orders"
        subtitle="Manage orders through fulfillment."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={isList ? orders.length : cards.length}
            >
              {" "}
              <div className="flex items-center gap-1.5">
                <QueryLink
                  clear={["view", "sort"]}
                  href="/orders"
                  className={`chip transition-colors active:scale-[0.98] ${isList ? "" : "chip-active"}`} data-view-tooltip="Kanban view — Orders grouped by status" aria-label="Kanban view — Orders grouped by status"
                >
                  <ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span>
                </QueryLink>
                <QueryLink
                  href="/orders?view=list"
                  className={`chip transition-colors active:scale-[0.98] ${isList ? "chip-active" : ""}`} data-view-tooltip="Table view — Orders in rows and columns" aria-label="Table view — Orders in rows and columns"
                >
                  <ToolbarIcon name="table" /><span className="sr-only">Table</span>
                </QueryLink>
              </div>
            </ListControls>
          </Suspense>
        }
      >
        <Link href="/intake" className="btn btn-primary">
          <ToolbarIcon name="plus" />
          New intake
        </Link>
      </PageHeader>

      {isList ? (
        <>
          {orders.length === 0 ? (
            <div className="empty-state">
              {status ||
              due ||
              Object.keys(filters).length > 0 ||
              !!nestedWhere ? (
                "No orders match this filter."
              ) : (
                <>
                  No orders yet. Orders are created automatically when an
                  opportunity is won, or directly from a simple intake.{" "}
                  <Link
                    href="/intake"
                    className="text-blue transition-colors hover:underline"
                  >
                    Go to Intake
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table-klyne min-w-[1050px]">
                <thead>
                  <tr>
                    <SortHeader field="title">Order</SortHeader>
                    <SortHeader field="company">Company</SortHeader>
                    <SortHeader field="value">Value</SortHeader>
                    <SortHeader field="status">Status</SortHeader>
                    <SortHeader>Payment</SortHeader>
                    <SortHeader>Next action</SortHeader>
                    <SortHeader field="neededBy">Needed by</SortHeader>
                    <SortHeader field="owner">Owner</SortHeader>
                  </tr>
                </thead>
                <TableRows columns={8}>
                  {orders.map((order) => {
                    const ps = paymentState(order.payments);
                    return (
                      <tr key={order.id}>
                        <td>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-medium hover:underline"
                          >
                            {order.title}
                          </Link>
                        </td>
                        <td>{order.company?.name ?? "—"}</td>
                        <td className="tabular-nums">
                          {fmtMoney(order.orderValue)}
                        </td>
                        <td>
                          <span
                            className={`badge ${ORDER_STATUS_COLORS[order.status] ?? "badge-gray"}`}
                          >
                            {labelFor(ORDER_STATUSES, order.status)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${PAYMENT_STATE_COLORS[ps]}`}>
                            {ps}
                          </span>
                        </td>
                        <td>
                          <BallInCourtBadge
                            ball={withHolder(
                              orderBall(toOrderBallInput(order)),
                              holders,
                            )}
                          />
                        </td>
                        <td>
                          <DueCell
                            neededByDate={order.neededByDate}
                            status={order.status}
                          />
                        </td>
                        <td>{order.owner?.name ?? "Unassigned"}</td>
                      </tr>
                    );
                  })}
                </TableRows>
              </table>
            </div>
          )}
        </>
      ) : cards.length === 0 ? (
        <div className="empty-state">
          {status || due || Object.keys(filters).length > 0 || !!nestedWhere ? (
            <>
              No live orders match these filters. Adjust them or use Clear
              filters above. Completed orders appear in the{" "}
              <QueryLink
                href="/orders?view=list"
                className="text-primary hover:underline"
              >
                Table view
              </QueryLink>
              .
            </>
          ) : (
            <>
              No live orders. Orders are created automatically when an
              opportunity is won, or directly from a simple intake.{" "}
              <Link href="/intake" className="text-primary hover:underline">
                Go to Intake
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <OrdersKanbanBoard cards={cards} />
        </>
      )}
      <MoreRecords href="/orders" limit={limit} hasMore={hasMore} />
    </div>
  );
}
