import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES, OPEN_SERVICE_ISSUE_STATUSES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { opportunityBall, type OrderBallInput } from "@/lib/ballInCourt";
import { KanbanBoard, type KanbanCard } from "./KanbanBoard";
import { PipelineList } from "./PipelineList";
import {
  ORDER_TYPES,
  PageHeader,
  StageBadge,
  daysSince,
  fmtDate,
  fmtMoney,
  isOverdue,
} from "./_ui";

export const dynamic = "force-dynamic";

const CLOSED_STAGES = ["won", "lost"];

/** sortKey to Prisma orderBy. Anything not listed falls back to the page default. */
const PIPELINE_ORDER: Record<
  string,
  (dir: "asc" | "desc") => Prisma.OpportunityOrderByWithRelationInput[]
> = {
  stage: (dir) => [{ stage: dir }, { createdAt: "desc" }],
  orderType: (dir) => [{ orderType: dir }, { createdAt: "desc" }],
  value: (dir) => [{ value: dir }],
  neededBy: (dir) => [{ neededByDate: dir }],
  followUp: (dir) => [{ nextFollowUp: dir }],
  company: (dir) => [{ company: { name: dir } }, { title: "asc" }],
  salesperson: (dir) => [{ salesperson: { name: dir } }, { createdAt: "desc" }],
  created: (dir) => [{ createdAt: dir }],
};

const DEFAULT_ORDER: Prisma.OpportunityOrderByWithRelationInput[] = [{ createdAt: "desc" }];

/**
 * Just enough of an Order to compute orderBall() - a narrower stand-in for
 * ORDER_BALL_INCLUDE (@/lib/flow) so a list page of many deals isn't dragging
 * full payment/PO/delivery rows along for a badge. Kept structurally in sync
 * with OrderBallInput by hand; a tsc failure here means it drifted.
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

/**
 * Date filters read as "due on or before this day" - the useful question for a
 * deadline column. An exact-day match would come back empty almost every time.
 */
function onOrBefore(value: string): Date | null {
  const day = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(day.getTime()) ? null : day;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const isList = params.view === "list";

  // Salesperson options come from the real user list, so only the list view pays for it.
  const users = isList
    ? await prisma.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Sort by / Filter by columns for the list view (Aug 31 feedback: every list,
  // any field). The kanban board keeps its own fixed ordering.
  const listFields: ReadonlyArray<ListField> = [
    { key: "stage", label: "Stage", type: "enum", options: OPPORTUNITY_STAGES },
    { key: "orderType", label: "Order type", type: "enum", options: ORDER_TYPES },
    { key: "company", label: "Company", type: "text" },
    {
      key: "salesperson",
      label: "Salesperson",
      type: "enum",
      options: users.map((u) => ({ value: u.id, label: u.name })),
    },
    { key: "value", label: "Value", type: "number", filterable: false },
    { key: "neededBy", label: "Needed by", type: "date" },
    { key: "followUp", label: "Next follow-up", type: "date" },
    { key: "created", label: "Created", type: "date", filterable: false },
  ];

  const { sortKey, sortDir, filters } = parseListQuery(listFields, params);

  const listWhere: Prisma.OpportunityWhereInput = {};
  if (isList) {
    if (filters.stage) listWhere.stage = filters.stage;
    if (filters.orderType) listWhere.orderType = filters.orderType;
    if (filters.salesperson) listWhere.salespersonId = filters.salesperson;
    if (filters.company) {
      listWhere.company = { name: { contains: filters.company, mode: "insensitive" } };
    }
    const neededBy = filters.neededBy ? onOrBefore(filters.neededBy) : null;
    if (neededBy) listWhere.neededByDate = { lte: neededBy };
    const followUp = filters.followUp ? onOrBefore(filters.followUp) : null;
    if (followUp) listWhere.nextFollowUp = { lte: followUp };
  }
  const hasListFilter = Object.keys(listWhere).length > 0;
  // The list falls back to its own stage-then-staleness order until a sort is picked.
  const listOrder = isList && sortKey ? PIPELINE_ORDER[sortKey] : undefined;
  const listSorted = !!listOrder;

  const opportunities = await prisma.opportunity.findMany({
    where: listWhere,
    orderBy: listOrder ? listOrder(sortDir) : DEFAULT_ORDER,
    select: {
      id: true,
      title: true,
      stage: true,
      value: true,
      createdAt: true,
      nextFollowUp: true,
      company: { select: { id: true, name: true } },
      lineItems: { select: { rfqStatus: true } },
      orders: { select: ORDER_BALL_SELECT, take: 1 },
    },
  });

  // Scoped to the deals actually on screen. Unscoped, this loaded every stage_changed
  // row ever written - a table that only grows, for a number shown on a handful of cards.
  const stageChanges = opportunities.length
    ? await prisma.activityLog.findMany({
        where: {
          action: "stage_changed",
          linkedType: "opportunity",
          linkedId: { in: opportunities.map((o) => o.id) },
        },
        orderBy: { at: "desc" },
        select: { linkedId: true, at: true },
      })
    : [];

  // Days-in-stage runs from the last logged stage change, or creation if never moved.
  const lastStageChange = new Map<string, Date>();
  for (const log of stageChanges) {
    if (!lastStageChange.has(log.linkedId)) lastStageChange.set(log.linkedId, log.at);
  }

  // Everything the client board needs, already formatted - no dates cross the boundary.
  const cards: KanbanCard[] = opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    stage: o.stage,
    value: o.value,
    companyName: o.company?.name ?? null,
    daysInStage: daysSince(lastStageChange.get(o.id) ?? o.createdAt),
    followUpLabel: o.nextFollowUp ? fmtDate(o.nextFollowUp) : null,
    followUpOverdue: isOverdue(o.nextFollowUp),
    ball: opportunityBall({
      stage: o.stage,
      lineItems: o.lineItems,
      order: o.orders[0] ? toOrderBallInput(o.orders[0]) : null,
    }),
  }));

  const openCards = cards.filter((c) => !CLOSED_STAGES.includes(c.stage));
  const openTotal = openCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
  const won = cards.filter((c) => c.stage === "won");
  const lost = cards.filter((c) => c.stage === "lost");

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${openCards.length} open · ${fmtMoney(openTotal)} in play`}
      >
        <div className="flex items-center gap-1.5">
          <Link
            href="/pipeline"
            className={`chip transition-colors active:scale-[0.98] ${isList ? "" : "chip-active"}`}
          >
            Kanban
          </Link>
          <Link
            href="/pipeline?view=list"
            className={`chip transition-colors active:scale-[0.98] ${isList ? "chip-active" : ""}`}
          >
            List
          </Link>
        </div>
        <Link href="/intake" className="btn btn-primary active:scale-[0.99]">
          New intake
        </Link>
      </PageHeader>

      {isList ? (
        <>
          {/* Search-bar slot for this list: Sort by / Filter by over every column. */}
          <div className="card mb-4 bg-surface/95 backdrop-blur">
            {/* useSearchParams needs a boundary even on a force-dynamic page. */}
            <Suspense fallback={<div className="h-8" />}>
              <ListControls fields={listFields} />
            </Suspense>
          </div>
          <PipelineList cards={cards} sorted={listSorted} filtered={hasListFilter} />
        </>
      ) : cards.length === 0 ? (
        <div className="empty-state">
          <p className="text-gray-dark">No deals yet.</p>
          <p className="mt-1">
            Deals land here from{" "}
            <Link href="/intake" className="text-primary transition-colors hover:underline">
              Intake
            </Link>{" "}
            whenever a request is a project or still needs pricing.
          </p>
        </div>
      ) : (
        <>
          <p className="page-sub mb-3">Drag a card between columns to move the deal.</p>
          <KanbanBoard cards={openCards} />
        </>
      )}

      {isList ? null : (
        <details className="card card-flush mt-8">
          <summary className="cursor-pointer px-5 py-4">
            <span className="section-label !mb-0 !inline">Closed deals</span>
            <span className="ml-3 badge badge-green">{won.length} won</span>
            <span className="ml-2 badge badge-gray">{lost.length} lost</span>
          </summary>
          <div className="border-t border-border">
            {won.length + lost.length === 0 ? (
              <div className="p-5">
                <div className="empty-state">
                  Nothing closed yet. Deals land here once you mark them Won or Lost.
                </div>
              </div>
            ) : (
              <table className="table-klyne">
                <thead>
                  <tr>
                    <th>Deal</th>
                    <th>Company</th>
                    <th>Value</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {[...won, ...lost].map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/pipeline/${c.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {c.title}
                        </Link>
                      </td>
                      <td className="text-gray-dark">
                        {c.companyName ?? <span className="empty-value">no company</span>}
                      </td>
                      <td className="tabular-nums text-gray-dark">
                        {fmtMoney(c.value) ?? <span className="empty-value">no value</span>}
                      </td>
                      <td>
                        <StageBadge stage={c.stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
