import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { ORDER_BALL_SELECT, PIPELINE_CARD_SELECT } from "./data";
import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { QueryLink } from "@/lib/QueryLink";
import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  OPPORTUNITY_STAGES,
} from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { opportunityBall, type OrderBallInput } from "@/lib/ballInCourt";
import { getStageHolders, withHolder } from "@/lib/courtHolders";
import { plainMoney, type PlainMoney } from "@/lib/money";
import { KanbanBoard, type KanbanCard } from "./KanbanBoard";
import { PipelineList } from "./PipelineList";
import { ORDER_TYPES, PageHeader, daysSince, fmtDate, isOverdue } from "./_ui";

export const dynamic = "force-dynamic";

const CLOSED_STAGES = ["won", "lost"];

/** sortKey to Prisma orderBy. Anything not listed falls back to the page default. */
const PIPELINE_ORDER: Record<
  string,
  (dir: "asc" | "desc") => Prisma.OpportunityOrderByWithRelationInput[]
> = {
  title: (dir) => [{ title: dir }],
  stage: (dir) => [{ stage: dir }, { createdAt: "desc" }],
  orderType: (dir) => [{ orderType: dir }, { createdAt: "desc" }],
  value: (dir) => [{ value: dir }],
  neededBy: (dir) => [{ neededByDate: dir }],
  followUp: (dir) => [{ nextFollowUp: dir }],
  company: (dir) => [{ company: { name: dir } }, { title: "asc" }],
  salesperson: (dir) => [{ salesperson: { name: dir } }, { createdAt: "desc" }],
  created: (dir) => [{ createdAt: dir }],
};

const DEFAULT_ORDER: Prisma.OpportunityOrderByWithRelationInput[] = [
  { createdAt: "desc" },
];

type OrderBallRow = PlainMoney<
  Prisma.OrderGetPayload<{ select: typeof ORDER_BALL_SELECT }>
>;

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
  const limit = collectionLimit(params);
  const isList =
    params.view === "list" ||
    params.scope === "closed" ||
    (typeof params.f_stage === "string" &&
      CLOSED_STAGES.includes(params.f_stage));

  // Both board and list use the same salesperson filters.
  const [users, holders] = await Promise.all([
    getActiveUsers(),
    getStageHolders(),
  ]);

  // Sort by / Filter by columns for the list view (Aug 31 feedback: every list,
  // any field). The kanban board keeps its own fixed ordering.
  const listFields: ReadonlyArray<ListField> = [
    { key: "title", label: "Title", type: "text" },
    { key: "stage", label: "Stage", type: "enum", options: OPPORTUNITY_STAGES },
    {
      key: "orderType",
      label: "Order type",
      type: "enum",
      options: ORDER_TYPES,
    },
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
  {
    if (filters.title)
      listWhere.title = { contains: filters.title, mode: "insensitive" };
    if (filters.stage) listWhere.stage = filters.stage;
    if (filters.orderType) listWhere.orderType = filters.orderType;
    if (filters.salesperson) listWhere.salespersonId = filters.salesperson;
    if (filters.company) {
      listWhere.company = {
        name: { contains: filters.company, mode: "insensitive" },
      };
    }
    const neededBy = filters.neededBy ? onOrBefore(filters.neededBy) : null;
    if (neededBy) listWhere.neededByDate = { lte: neededBy };
    const followUp = filters.followUp ? onOrBefore(filters.followUp) : null;
    if (followUp) listWhere.nextFollowUp = { lte: followUp };
  }
  const hasListFilter =
    Object.keys(listWhere).length > 0 || !!params.filter_tree;
  if (!filters.stage)
    listWhere.stage =
      params.scope === "closed"
        ? { in: CLOSED_STAGES }
        : { notIn: CLOSED_STAGES };
  // The list falls back to its own stage-then-staleness order until a sort is picked.
  const listOrder = sortKey ? PIPELINE_ORDER[sortKey] : undefined;
  const listSorted = !!listOrder;

  // Money columns come back as Decimal; plain numbers from here on (the cards
  // below go to client components).
  const nestedWhere = compileFilterTree<Prisma.OpportunityWhereInput>(
    listFields,
    params.filter_tree,
    {
      title: "title",
      stage: "stage",
      orderType: "orderType",
      company: "company.name",
      salesperson: "salespersonId",
      neededBy: "neededByDate",
      followUp: "nextFollowUp",
    },
  );

  const opportunities = plainMoney(
    await prisma.opportunity.findMany({
      take: limit + 1,
      where: { AND: [listWhere, nestedWhere ?? {}] },
      orderBy: listOrder ? listOrder(sortDir) : DEFAULT_ORDER,
      select: PIPELINE_CARD_SELECT,
    }),
  );

  const hasMore = opportunities.length > limit;
  if (hasMore) opportunities.pop();

  // Scoped to the deals actually on screen. Unscoped, this loaded every stage_changed
  // row ever written - a table that only grows, for a number shown on a handful of cards.
  const stageChanges = opportunities.length
    ? await prisma.activityLog.groupBy({
        where: {
          action: "stage_changed",
          linkedType: "opportunity",
          linkedId: { in: opportunities.map((o) => o.id) },
        },
        by: ["linkedId"],
        _max: { at: true },
      })
    : [];

  // Days-in-stage runs from the last logged stage change, or creation if never moved.
  const lastStageChange = new Map<string, Date>();
  for (const log of stageChanges) {
    if (log._max.at) lastStageChange.set(log.linkedId, log._max.at);
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
    ball: withHolder(
      opportunityBall({
        stage: o.stage,
        lineItems: o.lineItems,
        order: o.orders[0] ? toOrderBallInput(o.orders[0]) : null,
      }),
      holders,
    ),
  }));

  const openCards = cards.filter((c) => !CLOSED_STAGES.includes(c.stage));
  const closed =
    params.scope === "closed" || CLOSED_STAGES.includes(filters.stage);
  const visibleCards = filters.stage
    ? cards
    : cards.filter((c) =>
        closed
          ? CLOSED_STAGES.includes(c.stage)
          : !CLOSED_STAGES.includes(c.stage),
      );

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Sales opportunities from intake to close."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={listFields}
              count={isList ? visibleCards.length : openCards.length}
              displayControls={<div className="toolbar-scope"><span>Show opportunities</span><div className="flex items-center gap-1.5">
                <QueryLink
                  href="/pipeline"
                  clear={["scope", "f_stage"]}
                  className={closed ? "chip" : "chip chip-active"}
                >
                  Active
                </QueryLink>
                <QueryLink
                  href="/pipeline?scope=closed&view=list"
                  clear={["f_stage"]}
                  className={closed ? "chip chip-active" : "chip"}
                >
                  Closed
                </QueryLink>
              </div></div>}
            >
              {" "}
              <div className="flex items-center gap-1.5">
                <QueryLink
                  clear={["view", "scope", "sort"]}
                  href="/pipeline"
                  className={`chip transition-colors active:scale-[0.98] ${isList ? "" : "chip-active"}`} data-view-tooltip="Kanban view — Opportunities grouped by sales stage" aria-label="Kanban view — Opportunities grouped by sales stage"
                >
                  <ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span>
                </QueryLink>
                <QueryLink
                  href="/pipeline?view=list"
                  className={`chip transition-colors active:scale-[0.98] ${isList ? "chip-active" : ""}`} data-view-tooltip="Table view — Opportunities in rows and columns" aria-label="Table view — Opportunities in rows and columns"
                >
                  <ToolbarIcon name="table" /><span className="sr-only">Table</span>
                </QueryLink>
              </div>
            </ListControls>
          </Suspense>
        }
      >
        <Link href="/intake" className="btn btn-primary active:scale-[0.99]">
          <ToolbarIcon name="plus" />
          New intake
        </Link>
      </PageHeader>

      {isList ? (
        <>
          <PipelineList
            cards={visibleCards}
            sorted={listSorted}
            filtered={hasListFilter}
          />
        </>
      ) : cards.length === 0 ? (
        <div className="empty-state">
          <p className="text-gray-dark">
            {hasListFilter
              ? "No deals match these filters. Adjust them or use Clear all above."
              : "No deals yet."}
          </p>
          {!hasListFilter && (
            <p className="mt-1">
              Deals land here from{" "}
              <Link
                href="/intake"
                className="text-primary transition-colors hover:underline"
              >
                Intake
              </Link>{" "}
              whenever a request is a project or still needs pricing.
            </p>
          )}
        </div>
      ) : (
        <KanbanBoard cards={openCards} />
      )}

      <MoreRecords href="/pipeline" limit={limit} hasMore={hasMore} />
    </div>
  );
}
