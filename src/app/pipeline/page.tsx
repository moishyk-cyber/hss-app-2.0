import { recordCardDocuments } from "@/lib/recordCardDocuments";
import { orderIntakeQuery, sortIntakeRows } from "@/lib/intakeCollection";
import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { ORDER_BALL_SELECT, PIPELINE_CARD_SELECT } from "./data";
import { isIntakeWorkflowStep, INTAKE_WORKFLOW_STEPS, pipelineWorkflowBall, pipelineCardProgress, pipelineWorkflowHref, PIPELINE_WORKFLOW_OPTIONS } from "@/lib/pipelineWorkflow";
import { readPipelineWorkflowIndex } from "./workflowData";
import { shareRead } from "@/lib/shareRead";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { loadIndexedCollection } from "@/lib/loadIndexedCollection";
import { CollectionSnapshot } from "@/lib/CollectionScope";
import { CollectionView, CollectionViewToggle } from "@/lib/CollectionDisplay";
import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { type OrderBallInput } from "@/lib/ballInCourt";
import { getStageHolders, withHolder } from "@/lib/courtHolders";
import { plainMoney, type PlainMoney } from "@/lib/money";
import { KanbanBoard, type KanbanCard } from "./KanbanBoard";
import { PipelineList } from "./PipelineList";
import { ORDER_TYPES, PageHeader, daysSince, fmtDate, isOverdue } from "./_ui";

export const dynamic = "force-dynamic";

const CLOSED_STEPS = ["complete", "lost"];

/** sortKey to Prisma orderBy. Anything not listed falls back to the page default. */
const PIPELINE_ORDER: Record<
  string,
  (dir: "asc" | "desc") => Prisma.OpportunityOrderByWithRelationInput[]
> = {
  title: (dir) => [{ title: dir }],
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
      CLOSED_STEPS.includes(params.f_stage));

  // Both board and list use the same salesperson filters.
  const [users, holders, requirements] = await Promise.all([
    getActiveUsers(),
    getStageHolders(),
    getFieldRequirements(),
  ]);

  // Sort by / Filter by columns for the list view (Aug 31 feedback: every list,
  // any field). The kanban board keeps its own fixed ordering.
  const listFields: ReadonlyArray<ListField> = [
    { key: "title", label: "Title", type: "text" },
    { key: "stage", label: "Next step", type: "enum", options: [...INTAKE_WORKFLOW_STEPS.map(step => ({ value: step.key, label: step.label })), ...PIPELINE_WORKFLOW_OPTIONS.filter(step => CLOSED_STEPS.includes(step.value))] },
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

  const required = { company: requirements["opportunity.companyId"], neededBy: requirements["opportunity.neededByDate"] };
  const workflowIndex = await shareRead(JSON.stringify(["pipeline-workflow-index-v1", required]), () => readPipelineWorkflowIndex(prisma, required));
  const workflowById = new Map(workflowIndex.map(row => [row.id, row.step]));
  const idsForStep = (step: string) => workflowIndex.filter(row => row.step === step).map(row => row.id);
  const listWhere: Prisma.OpportunityWhereInput = {};
  {
    if (filters.title)
      listWhere.title = { contains: filters.title, mode: "insensitive" };
    if (filters.stage) listWhere.id = { in: idsForStep(filters.stage) };
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
  if (!filters.stage) listWhere.id = { in: workflowIndex.filter(row => params.scope === "closed" ? CLOSED_STEPS.includes(row.step) : isIntakeWorkflowStep(row.step)).map(row => row.id) };
  // The list falls back to its own stage-then-staleness order until a sort is picked.
  const listOrder = sortKey && sortKey !== "stage" ? PIPELINE_ORDER[sortKey] : undefined;

  // Money columns come back as Decimal; plain numbers from here on (the cards
  // below go to client components).
  const nestedWhere = compileFilterTree<Prisma.OpportunityWhereInput>(
    listFields,
    params.filter_tree,
    {
      title: "title",
      stage: condition => ({ id: { in: idsForStep(condition.value) } }),
      orderType: "orderType",
      company: "company.name",
      salesperson: "salespersonId",
      neededBy: "neededByDate",
      followUp: "nextFollowUp",
    },
  );

  const where: Prisma.OpportunityWhereInput = { AND: [listWhere, nestedWhere ?? {}] };
  const orderBy = listOrder ? listOrder(sortDir) : DEFAULT_ORDER;
  const sourceById = new Map(workflowIndex.map(row => [row.id, row.source]));
  const directIds = workflowIndex.filter(row => row.source === "order").map(row => row.id);
  const directWhere = (filter: Prisma.OpportunityWhereInput): Prisma.OrderWhereInput => ({ AND: [orderIntakeQuery(filter) as Prisma.OrderWhereInput, { opportunityId: null, id: { in: directIds } }] });
  const query = async (filter: Prisma.OpportunityWhereInput, take = limit + 1) => {
    const [deals, directOrders] = await Promise.all([
      prisma.opportunity.findMany({ take, where: filter, orderBy, relationLoadStrategy: "join", select: PIPELINE_CARD_SELECT }),
      directIds.length ? prisma.order.findMany({ take, where: directWhere(filter), orderBy: orderIntakeQuery(orderBy) as Prisma.OrderOrderByWithRelationInput[], relationLoadStrategy: "join", select: {
        ...ORDER_BALL_SELECT, id: true, title: true, companyId: true, orderType: true, createdAt: true, neededByDate: true, nextFollowUp: true,
        company: { select: { id: true, name: true, requiresDeposit: true, depositPercent: true, paymentTermsConfigured: true } },
        owner: { select: { name: true, active: true } },
        lineItems: { select: { id: true, name: true, rfqStatus: true, unitPrice: true, deliveryStatus: true, purchaseOrderId: true } },
      } }) : [],
    ]);
    return [...deals, ...directOrders.map(order => ({ id: order.id, title: order.title, companyId: order.companyId, orderType: order.orderType, neededByDate: order.neededByDate, stage: "won", clientQuoteCreated: false, clientQuoteSent: false, value: order.orderValue, createdAt: order.createdAt, nextFollowUp: order.nextFollowUp, company: order.company, salesperson: order.owner, lineItems: order.lineItems, orders: [order] }))];
  };
  const collection = await loadIndexedCollection(JSON.stringify(["intake-workflow-cards-v4",where,orderBy,sortKey,sortDir]),
    async () => {
      const indexSelect = { id: true, title: true, value: true, orderType: true, createdAt: true, neededByDate: true, nextFollowUp: true, company: { select: { name: true } }, salesperson: { select: { name: true } } } as const;
      const [dealRows, directRows] = await Promise.all([
        prisma.opportunity.findMany({ where, orderBy, select: indexSelect }),
        directIds.length ? prisma.order.findMany({ where: directWhere(where), select: { id: true, title: true, orderValue: true, orderType: true, createdAt: true, neededByDate: true, nextFollowUp: true, company: { select: { name: true } }, owner: { select: { name: true } } } }) : [],
      ]);
      const rows = sortIntakeRows([...dealRows, ...directRows.map(row => ({ ...row, value: row.orderValue, salesperson: row.owner }))], sortKey === "stage" ? "" : sortKey ?? "", sortDir);
      if (sortKey === "stage") {
        const ranks = new Map(PIPELINE_WORKFLOW_OPTIONS.map((step, index) => [step.value, index]));
        rows.sort((a, b) => ((ranks.get(workflowById.get(a.id)!) ?? 99) - (ranks.get(workflowById.get(b.id)!) ?? 99)) * (sortDir === "desc" ? -1 : 1));
      }
      return rows.map(row => ({ id: row.id, amount: row.value == null ? null : Number(row.value), groups: { workflowStep: workflowById.get(row.id)! } }));
    },
    async ids => {
      const rows = await query({AND:[where,{id:{in:ids}}]},ids.length);
      const positions = new Map(ids.map((id, index) => [id, index]));
      return rows.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
    },limit);
  const opportunities = plainMoney(collection.rows);
  const hasMore = collection.hasMore;

  const cardDocuments = await recordCardDocuments(opportunities.map(o => ({ id: o.id, type: sourceById.get(o.id) ?? "opportunity" })));

  // Everything the client board needs, already formatted - no dates cross the boundary.
  const cards: KanbanCard[] = opportunities.map((o) => ({
    documents: cardDocuments.get(o.id) ?? [],
    id: o.id,
    title: o.title,
    stage: o.stage,
    workflowStep: workflowById.get(o.id)!,
    workflow: pipelineCardProgress(o, required, o.orders[0] ? { ...toOrderBallInput(o.orders[0]), id: o.orders[0].id } : null),
    termsSet: !!(o.orders[0]?.termsNotes?.trim() || o.orders[0]?.paymentTerms),
    salesOrderSent: !!o.orders[0]?.salesOrderSentAt,
    href: pipelineWorkflowHref(o.id, workflowById.get(o.id)!),
    value: o.value,
    companyId: o.company?.id ?? null,
    companyName: o.company?.name ?? null,
    assigneeName: o.salesperson?.name ?? null,
    fileType: sourceById.get(o.id) ?? "opportunity",
    daysInStage: daysSince(o.createdAt),
    followUpLabel: o.nextFollowUp ? fmtDate(o.nextFollowUp) : null,
    followUpOverdue: isOverdue(o.nextFollowUp),
    ball: withHolder(
      pipelineWorkflowBall(o, required, o.orders[0] ? { ...toOrderBallInput(o.orders[0]), id: o.orders[0].id } : null),
      holders,
    ),
  }));

  const openCards = cards.filter((c) => isIntakeWorkflowStep(c.workflowStep));
  const closed =
    params.scope === "closed" || CLOSED_STEPS.includes(filters.stage);
  const visibleCards = filters.stage
    ? cards
    : cards.filter((c) =>
        closed
          ? CLOSED_STEPS.includes(c.workflowStep)
          : isIntakeWorkflowStep(c.workflowStep),
      );

  return (
    <CollectionSnapshot data={collection.snapshot}><div>
      <PageHeader
        title="Pipeline"
        subtitle="Intake through payment. Fulfillment continues in Orders."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={listFields}
              count={isList ? visibleCards.length : openCards.length}
              scopeSelect={{ label: "Show", value: closed ? "closed" : "active", param: "scope",
                options: [{ value: "active", label: "Active" }, { value: "closed", label: "Closed" }],
                clear: ["f_stage"], extraParams: { view: "list" } }}
            >
              {" "}
              <CollectionViewToggle forceList={closed} />
            </ListControls>
          </Suspense>
        }
      >
        <Link href="/intake" className="btn btn-primary active:scale-[0.99]">
          <ToolbarIcon name="plus" />
          New intake
        </Link>
      </PageHeader>

      <CollectionView view="list" forceList={closed}>
          <PipelineList
            cards={visibleCards.filter(card=>collection.snapshot.listIds.includes(card.id))}
            sorted={true}
            filtered={hasListFilter}
          />
      </CollectionView>
      <CollectionView view="kanban" forceList={closed}>
      {cards.length === 0 ? (
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
      </CollectionView>

      <MoreRecords href="/pipeline" limit={limit} hasMore={hasMore} />
    </div></CollectionSnapshot>
  );
}
