import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { CollectionGroup, SortHeader, TableRows } from "@/lib/CollectionViews";
import { QueryLink } from "@/lib/QueryLink";
import { RfqBoard } from "./RfqBoard";
import { PageHeader } from "@/lib/PageLayout";
import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelFor, STOCK_STATUSES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { plainMoney, type PlainMoney } from "@/lib/money";
import { RFQ_QUEUE_STATUSES, isDeadDealItem } from "./queue-statuses";
import RfqRow from "./RfqRow";

export const dynamic = "force-dynamic";

const NEEDS_PRICING_EMPTY =
  "Nothing needs pricing. Items land here from Intake when they need a price.";

type RfqLineItem = PlainMoney<
  Prisma.LineItemGetPayload<{
    include: {
      opportunity: {
        select: {
          id: true;
          title: true;
          stage: true;
          company: { select: { name: true } };
        };
      };
      order: {
        select: { id: true; title: true; company: { select: { name: true } } };
      };
      assignee: { select: { name: true } };
    };
  }>
>;

type RfqSearchParams = Record<string, string | string[] | undefined>;

export default async function RfqPage({
  searchParams,
}: {
  searchParams: Promise<RfqSearchParams>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const statusValues = RFQ_QUEUE_STATUSES.map((s) => s.value);

  const users = await getActiveUsers();

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Parent company spans two optional relations (order.company / opportunity.company)
  // so its filter is an OR across both - handled in Prisma below, not punted to JS.
  // Days waiting and lead time are sort-only per the client's spec.
  const FIELDS: ListField[] = [
    {
      key: "status",
      label: "Stage",
      type: "enum",
      options: RFQ_QUEUE_STATUSES,
    },
    { key: "price", label: "Price", type: "number", filterable: false },
    { key: "name", label: "Item Name", type: "text" },
    { key: "brand", label: "Brand", type: "text" },
    {
      key: "assignee",
      label: "Assignee",
      type: "enum",
      options: users.map((u) => ({ value: u.id, label: u.name })),
    },
    {
      key: "parentCompany",
      label: "Parent Company",
      type: "text",
      sortable: false,
    },
    {
      key: "daysWaiting",
      label: "Days Waiting",
      type: "number",
      filterable: false,
    },
    { key: "leadTime", label: "Lead Time", type: "date", filterable: false },
    {
      key: "stockStatus",
      label: "Stock Status",
      type: "enum",
      options: STOCK_STATUSES.map((s) => ({ ...s })),
    },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const whereAnd: Prisma.LineItemWhereInput[] = [
    { rfqStatus: { in: statusValues as string[] } },
  ];
  whereAnd.push({
    OR: [
      { orderId: { not: null } },
      { opportunity: null },
      { opportunity: { stage: { notIn: ["won", "lost"] } } },
    ],
  });
  if (filters.status) whereAnd.push({ rfqStatus: filters.status });
  if (filters.name)
    whereAnd.push({ name: { contains: filters.name, mode: "insensitive" } });
  if (filters.brand)
    whereAnd.push({ brand: { contains: filters.brand, mode: "insensitive" } });
  if (filters.assignee) whereAnd.push({ assigneeId: filters.assignee });
  if (filters.stockStatus) whereAnd.push({ stockStatus: filters.stockStatus });
  if (filters.parentCompany) {
    whereAnd.push({
      OR: [
        {
          order: {
            company: {
              name: { contains: filters.parentCompany, mode: "insensitive" },
            },
          },
        },
        {
          opportunity: {
            company: {
              name: { contains: filters.parentCompany, mode: "insensitive" },
            },
          },
        },
      ],
    });
  }

  const nestedWhere = compileFilterTree<Prisma.LineItemWhereInput>(
    FIELDS,
    sp.filter_tree,
    {
      name: "name",
      brand: "brand",
      assignee: "assigneeId",
      status: "rfqStatus",
      stockStatus: "stockStatus",
      parentCompany: (condition) => ({
        OR: [
          {
            order: {
              company: {
                name: {
                  [condition.operator.includes("contains")
                    ? "contains"
                    : "equals"]: condition.value,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            opportunity: {
              company: {
                name: {
                  [condition.operator.includes("contains")
                    ? "contains"
                    : "equals"]: condition.value,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      }),
    },
  );
  if (nestedWhere) whereAnd.push(nestedWhere);

  const ORDER_BY: Record<string, Prisma.LineItemOrderByWithRelationInput> = {
    status: { rfqStatus: sortDir },
    price: { unitPrice: sortDir },
    name: { name: sortDir },
    brand: { brand: sortDir },
    stockStatus: { stockStatus: sortDir },
    assignee: { assignee: { name: sortDir } },
    // "Days waiting" counts up from createdAt, so ascending days-waiting means
    // most-recently-created first (i.e. createdAt descending).
    daysWaiting: { createdAt: sortDir === "asc" ? "desc" : "asc" },
    leadTime: { leadTimeDate: sortDir },
  };
  const orderBy = sortKey ? ORDER_BY[sortKey] : undefined;

  // unitCost/unitPrice come back as Decimal; RfqRow is a client component, so
  // the rows go over as plain numbers.
  const rawItems: RfqLineItem[] = plainMoney(
    await prisma.lineItem.findMany({
      take: limit + 1,
      where: { AND: whereAnd },
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            stage: true,
            company: { select: { name: true } },
          },
        },
        order: {
          select: {
            id: true,
            title: true,
            company: { select: { name: true } },
          },
        },
        assignee: { select: { name: true } },
      },
      orderBy: orderBy ?? { createdAt: "asc" },
    }),
  );

  const hasMore = rawItems.length > limit;
  if (hasMore) rawItems.pop();

  const items = rawItems.filter((i) => !isDeadDealItem(i));

  const groupKey = typeof sp.group === "string" ? sp.group : "stage";
  const groupValue = (item: RfqLineItem) =>
    groupKey === "none"
      ? "All items"
      : groupKey === "assignee"
        ? (item.assignee?.name ?? "Unassigned")
        : groupKey === "stockStatus"
          ? labelFor(STOCK_STATUSES, item.stockStatus)
          : labelFor(RFQ_QUEUE_STATUSES, item.rfqStatus);
  const groups = new Map<string, RfqLineItem[]>();
  for (const item of items) {
    const key = groupValue(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const grouped = Array.from(groups, ([label, items]) => ({
    status: label,
    label,
    items,
  }));
  if (groupKey === "stage" || groupKey === "status")
    grouped.sort(
      (a, b) =>
        RFQ_QUEUE_STATUSES.findIndex((s) => s.label === a.label) -
        RFQ_QUEUE_STATUSES.findIndex((s) => s.label === b.label),
    );

  return (
    <div className="space-y-8">
      <PageHeader
        title="RFQ Queue"
        subtitle="Estimating queue - items awaiting pricing before they can move to a proposal."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={items.length}
            >
              <QueryLink
                href="/rfq"
                clear={["view"]}
                className={sp.view === "kanban" ? "chip" : "chip chip-active"} data-view-tooltip="Table view — Rfq items in rows and columns" aria-label="Table view — Rfq items in rows and columns"
              >
                <ToolbarIcon name="table" /><span className="sr-only">Table</span>
              </QueryLink>
              <QueryLink
                href="/rfq?view=kanban"
                clear={["sort"]}
                className={sp.view === "kanban" ? "chip chip-active" : "chip"} data-view-tooltip="Kanban view — Rfq items grouped by status" aria-label="Kanban view — Rfq items grouped by status"
              >
                <ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span>
              </QueryLink>
            </ListControls>
          </Suspense>
        }
      ></PageHeader>

      {items.length === 0 ? (
        <div className="empty-state">
          {NEEDS_PRICING_EMPTY}{" "}
          <Link
            href="/intake"
            className="text-blue transition-colors hover:underline"
          >
            Go to Intake
          </Link>
        </div>
      ) : sp.view === "kanban" ? (
        <RfqBoard items={items} users={users} />
      ) : (
        grouped.map((group) => (
          <CollectionGroup
            flat={groupKey === "none"}
            key={group.status}
            title={group.label}
            count={group.items.length}
          >
            {group.items.length === 0 ? (
              <div className="empty-state">
                {group.status === "needs_pricing" ? (
                  <>
                    {NEEDS_PRICING_EMPTY}{" "}
                    <Link
                      href="/intake"
                      className="text-blue transition-colors hover:underline"
                    >
                      Go to Intake
                    </Link>
                  </>
                ) : (
                  "No items in this stage."
                )}
              </div>
            ) : (
              <div className="table-scroll">
                {/* 9 tighter columns (the Lead column is the editable date) so the
                    whole table fits a plain desktop without cutting off Assignee. */}
                <table className="table-klyne rfq-table min-w-[1320px]">
                  <thead>
                    <tr>
                      <SortHeader field="name">Item</SortHeader>
                      <th>Qty</th>
                      <th>Parent</th>
                      <SortHeader field="daysWaiting">Waiting</SortHeader>
                      <SortHeader field="price">Price</SortHeader>
                      <SortHeader field="leadTime">Lead time</SortHeader>
                      <SortHeader field="stockStatus">Stock</SortHeader>
                      <SortHeader field="assignee">Assignee</SortHeader>
                      <SortHeader field="status">Status</SortHeader>
                    </tr>
                  </thead>
                  <TableRows columns={9}>
                    {group.items.map((item) => {
                      const parentHref = item.order
                        ? `/orders/${item.order.id}`
                        : item.opportunity
                          ? `/pipeline/${item.opportunity.id}`
                          : null;
                      const parentLabel =
                        item.order?.title ??
                        item.opportunity?.title ??
                        "Unlinked item";
                      const parentCompany =
                        item.order?.company?.name ??
                        item.opportunity?.company?.name ??
                        null;
                      const daysWaiting = Math.floor(
                        (Date.now() - new Date(item.createdAt).getTime()) /
                          86_400_000,
                      );
                      return (
                        <RfqRow
                          key={item.id}
                          item={item}
                          users={users}
                          parentHref={parentHref}
                          parentLabel={parentLabel}
                          parentCompany={parentCompany}
                          daysWaiting={daysWaiting}
                        />
                      );
                    })}
                  </TableRows>
                </table>
              </div>
            )}
          </CollectionGroup>
        ))
      )}
      <MoreRecords href="/rfq" limit={limit} hasMore={hasMore} />
    </div>
  );
}
