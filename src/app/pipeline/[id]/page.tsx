import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { ORDER_STATUSES, ORDER_STATUS_COLORS, OPEN_SERVICE_ISSUE_STATUSES, labelFor } from "@/lib/constants";
import { FlowStepper, type FlowStep } from "@/lib/FlowStepper";
import { PendingButton } from "@/lib/ui";
import { fmtDateUTC } from "@/lib/dates";
import { opportunityBall, fullFlowSteps, FLOW_STEPS, type OrderBallInput } from "@/lib/ballInCourt";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { uploadsConfigured } from "@/lib/storage";
import FilesSection, { type FileDocData } from "../../orders/[id]/FilesSection";
import { addLineItem, moveStageFromStepper } from "../actions";
import { ClosePanel } from "../ClosePanel";
import { LineItemRow } from "../LineItemRow";
import {
  Card,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  DetailHeader,
  DetailRow,
  ORDER_TYPES,
  StageBadge,
  fmtDate,
  fmtMoney,
  isOverdue,
} from "../_ui";

/**
 * Just enough of an Order to compute orderBall() - mirrors ORDER_BALL_INCLUDE
 * (@/lib/flow) but as a `select` so this detail page (which only ever needs
 * the one linked order) doesn't drag every column along for a badge. Kept
 * structurally in sync with OrderBallInput by hand; a tsc failure here means
 * it drifted.
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

type OrderBallRow = Prisma.OrderGetPayload<{ select: typeof ORDER_BALL_SELECT & { id: true; title: true } }>;

function toOrderBallInput(order: OrderBallRow): OrderBallInput {
  const { _count, ...rest } = order;
  return { ...rest, openIssueCount: _count.serviceIssues };
}

/** "N d · est. <date>" for a lead time measured from today. */
function leadTimeSummary(days: number): string {
  const est = new Date(Date.now() + days * 86_400_000);
  return `${days} d · est. ${fmtDateUTC(est)}`;
}

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);

  const [opportunity, users] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id },
      include: {
        // locations feed the Close panel's picker (and the Location row below).
        company: {
          include: { locations: { orderBy: [{ isDefault: "desc" }, { name: "asc" }] } },
        },
        location: { select: { id: true, name: true, address: true } },
        primaryContact: true,
        salesperson: true,
        lineItems: true,
        orders: { select: { id: true, title: true, ...ORDER_BALL_SELECT } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!opportunity) notFound();

  const stage = opportunity.stage;
  const closed = stage === "won" || stage === "lost";
  const isProject = opportunity.orderType === "project";
  const linkedOrder = opportunity.orders[0] ?? null;

  // Deposit terms come from the account, and prefill the Close panel - where the
  // salesperson can override them with whatever was actually agreed on the call.
  const requiresDeposit = opportunity.company?.requiresDeposit ?? true;
  const depositPercent = opportunity.company?.depositPercent ?? 30;
  const suggestedDeposit = Math.round(((opportunity.value ?? 0) * depositPercent) / 100);
  // Terms the Close panel opens on: the account's own terms for a project, and
  // full payment for a straight order (which is how those have always closed -
  // markOpportunityWon falls back to exactly the same pair).
  const defaultTerms = !isProject
    ? "full_upfront"
    : requiresDeposit
      ? "deposit_balance"
      : "on_delivery";
  const closeLocations = (opportunity.company?.locations ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
  }));

  // Next action is derived cheaply from the line items' RFQ status counts.
  const liveItems = opportunity.lineItems.filter((li) => li.rfqStatus !== "removed");
  const needsPricingCount = liveItems.filter((li) => li.rfqStatus === "needs_pricing").length;
  const leadTimes = liveItems
    .map((li) => li.leadTimeDays)
    .filter((d): d is number => d != null);
  const longestLeadTimeDays = leadTimes.length > 0 ? Math.max(...leadTimes) : null;

  // A won deal that never got an order is only half-closed - the Close panel stays
  // open as the recovery route (it reuses the same Won form).
  const needsOrderRecovery = stage === "won" && !linkedOrder;
  const showClosePanel = (!closed || needsOrderRecovery) && (await can("deals.close"));

  // Ball-in-court: the single next thing that has to happen, and who has to do
  // it. A won deal delegates straight to its order (orderBall).
  const ball = opportunityBall({
    stage: opportunity.stage,
    lineItems: opportunity.lineItems.map((li) => ({ rfqStatus: li.rfqStatus })),
    order: linkedOrder ? toOrderBallInput(linkedOrder) : null,
  });

  // The 9-step full flow (sales through customer service), post-processed so
  // the sales-side steps stay clickable exactly like the old 5-step stepper:
  // each open step moves the deal to its stage; Close never writes a stage,
  // it points at the Close panel where Won/Lost do their real work. The
  // order-side steps keep the hrefs fullFlowSteps gives (the order's tabs).
  const steps: FlowStep[] = fullFlowSteps(ball.step, {
    dealHref: `/pipeline/${opportunity.id}`,
    orderHref: linkedOrder ? `/orders/${linkedOrder.id}` : undefined,
    hint: ball.hint,
  }).map((step, i) => {
    const key = FLOW_STEPS[i].key;
    if (key === "sales" || key === "pricing") {
      const target = key === "sales" ? "new" : "estimating";
      return {
        ...step,
        href: undefined,
        formAction:
          !closed && step.state !== "current"
            ? moveStageFromStepper.bind(null, opportunity.id, target)
            : undefined,
      };
    }
    if (key === "close") {
      return { ...step, href: !closed ? "#close" : undefined, formAction: undefined };
    }
    return step;
  });

  // Exactly one contextual primary action (UX_FLOW §H).
  const primaryAction =
    needsOrderRecovery
      ? { href: "#close", label: "Create the order" }
      : stage === "won" && linkedOrder
        ? { href: `/orders/${linkedOrder.id}`, label: "View order" }
        : closed
          ? { href: `/pipeline/${opportunity.id}/edit`, label: "Edit deal" }
          : needsPricingCount > 0
            ? { href: "/rfq", label: `Open RFQ items (${needsPricingCount})` }
            : stage === "proposal_sent" || stage === "revisions_needed" || stage === "negotiation"
              ? { href: "#close", label: "Close this deal" }
              : { href: `/pipeline/${opportunity.id}/edit`, label: "Edit deal" };

  const followUpOverdue = isOverdue(opportunity.nextFollowUp);

  // Files land on a deal long before there is an order (drawings, the signed
  // quote), and the order page reads this same set back under "From the deal".
  const documents = await prisma.document.findMany({
    where: { linkedType: "opportunity", linkedId: opportunity.id },
    orderBy: { uploadedAt: "desc" },
  });
  const dealDocs: FileDocData[] = documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    fileUrl: d.fileUrl,
    fileName: d.fileName,
    source: d.source,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storagePath: d.storagePath,
    uploadedBy: d.uploadedBy,
    note: d.note,
    uploadedAt: d.uploadedAt,
  }));

  return (
    <div>
      <DetailHeader
        backHref="/pipeline"
        backLabel="Back to Pipeline"
        title={opportunity.title}
        subtitle={opportunity.company?.name ?? "No company linked"}
        badges={
          <>
            <StageBadge stage={stage} />
            <BallInCourtBadge ball={ball} />
            <span className="badge badge-gray">{labelFor(ORDER_TYPES, opportunity.orderType)}</span>
            {followUpOverdue ? (
              <span className="badge badge-orange">
                Follow up overdue · {fmtDate(opportunity.nextFollowUp)}
              </span>
            ) : null}
          </>
        }
        secondary={
          !closed || stage === "won" ? (
            <Link
              href={`/pipeline/${opportunity.id}/edit`}
              className="btn active:scale-[0.99]"
            >
              Edit
            </Link>
          ) : null
        }
        action={
          <Link href={primaryAction.href} className="btn btn-primary active:scale-[0.99]">
            {primaryAction.label}
          </Link>
        }
      />

      <div className="card mb-8">
        <FlowStepper steps={steps} />
        {/* A div, not a p: the recovery branch below embeds a form. */}
        {closed ? (
          <div className="mt-4 border-t border-border pt-4 text-center text-xs text-gray-dark">
            {stage === "won" ? (
              linkedOrder ? (
                <>
                  Won - now an order:{" "}
                  <Link
                    href={`/orders/${linkedOrder.id}`}
                    className="text-primary transition-colors hover:underline"
                  >
                    {linkedOrder.title}
                  </Link>
                </>
              ) : (
                // Recovery path: the old stage dropdown could set "won" without ever
                // running markOpportunityWon, leaving a closed deal with no order and
                // no payment. Point at the Close panel, which offers the missing half.
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span>
                    Marked Won, but no order was ever created - the line items and the payment are
                    still sitting on the deal.
                  </span>
                  <Link href="#close" className="text-primary transition-colors hover:underline">
                    Create the order
                  </Link>
                </div>
              )
            ) : (
              <>Lost - {opportunity.lostReason ?? "no reason recorded"}</>
            )}
          </div>
        ) : null}
      </div>

      {error === "lost_reason_required" ? (
        <div className="banner-alert mb-4">
          A lost reason is required before a deal can be marked Lost.
        </div>
      ) : error === "value_required" ? (
        <div className="banner-alert mb-4">
          A won deal needs a price - the deposit and the payment gate are both measured against it.{" "}
          <Link href="#close" className="underline">
            Enter the total in the Close panel
          </Link>
          .
        </div>
      ) : error === "destination_required" ? (
        <div className="banner-alert mb-4">
          The order needs a delivery address and a needed-by date before it can be created -{" "}
          <Link href="#close" className="underline">
            fill them in on the Close panel
          </Link>
          .
        </div>
      ) : error === "item_name_required" ? (
        <div className="banner-alert mb-4">Give the item a name before adding it.</div>
      ) : error === "save_failed" ? (
        <div className="banner-alert mb-4">Something went wrong while saving. Please try again.</div>
      ) : error === "not_allowed" ? (
        <div className="banner-alert mb-4">
          That role can&rsquo;t do this. Switch &quot;Working as&quot; in the sidebar or ask an admin.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Deal">
            <DetailRow label="Stage" value={<StageBadge stage={opportunity.stage} />} />
            <DetailRow label="Order type" value={labelFor(ORDER_TYPES, opportunity.orderType)} />
            <DetailRow label="Needs pricing" value={opportunity.needsPricing ? "Yes" : "No"} />
            <DetailRow
              label="Value"
              value={fmtMoney(opportunity.value)}
              emptyLabel="not quoted yet"
            />
            <DetailRow label="Budget" value={fmtMoney(opportunity.budget)} />
            <DetailRow
              label="Longest lead time"
              value={longestLeadTimeDays != null ? leadTimeSummary(longestLeadTimeDays) : null}
              emptyLabel="not known yet"
            />
            <DetailRow
              label="Company"
              value={
                opportunity.company ? (
                  <Link
                    href={`/companies/${opportunity.company.id}`}
                    className="text-primary hover:underline"
                  >
                    {opportunity.company.name}
                  </Link>
                ) : null
              }
            />
            <DetailRow
              label="Location"
              value={
                opportunity.location ? (
                  <>
                    <span className="font-medium">{opportunity.location.name}</span>
                    <span className="block text-gray-dark">{opportunity.location.address}</span>
                  </>
                ) : opportunity.deliveryAddress ? (
                  <>
                    {opportunity.locationName ? (
                      <span className="font-medium">{opportunity.locationName}</span>
                    ) : null}
                    <span className="block text-gray-dark">{opportunity.deliveryAddress}</span>
                  </>
                ) : null
              }
              emptyLabel="no site picked yet"
            />
            <DetailRow
              label="Primary contact"
              value={
                opportunity.primaryContact
                  ? [opportunity.primaryContact.firstName, opportunity.primaryContact.lastName]
                      .filter(Boolean)
                      .join(" ")
                  : null
              }
            />
            <DetailRow
              label="Salesperson"
              value={opportunity.salesperson?.name ?? null}
              emptyLabel="unassigned"
            />
            <DetailRow label="Needed by" value={fmtDate(opportunity.neededByDate)} />
            <DetailRow label="Est./order due" value={fmtDate(opportunity.estDueDate)} />
            <DetailRow
              label="Next follow-up"
              value={fmtDate(opportunity.nextFollowUp)}
              emptyLabel={closed ? undefined : "not scheduled"}
            />
            <DetailRow label="Submitted via" value={opportunity.submittedVia} />
            <DetailRow label="Created" value={fmtDate(opportunity.createdAt)} />
            {opportunity.lostReason ? (
              <DetailRow label="Lost reason" value={opportunity.lostReason} />
            ) : null}
          </Card>

          <Card title={isProject ? "Project details" : "Site details"}>
            <DetailRow label="Facility type" value={opportunity.facilityType} />
            <DetailRow label="Menu" value={opportunity.menu} />
            <DetailRow label="Room dimensions" value={opportunity.roomDimensions} />
            <DetailRow label="Wall measurements" value={opportunity.wallMeasurements} />
            <DetailRow
              label="Plumbing / electrical"
              value={opportunity.plumbingElectricalNotes}
            />
            <DetailRow
              label="Delivery type"
              value={
                opportunity.deliveryType ? labelFor(DELIVERY_TYPES, opportunity.deliveryType) : null
              }
            />
            <DetailRow label="Opening size" value={opportunity.openingSize} />
            <DetailRow
              label="Installation needed"
              value={opportunity.installationNeeded ? "Yes" : "No"}
            />
            <DetailRow
              label="Design status"
              value={labelFor(DESIGN_STATUSES, opportunity.designStatus)}
            />
            <DetailRow label="Location name" value={opportunity.locationName} />
            <DetailRow label="Delivery address" value={opportunity.deliveryAddress} />
            <DetailRow label="Client vision" value={opportunity.clientVisionNotes} />
            <DetailRow label="Notes" value={opportunity.notes} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="card card-flush overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="section-label !mb-0">Line items</h2>
            </div>
            {opportunity.lineItems.length === 0 ? (
              <div className="p-5">
                <div className="empty-state">
                  No line items yet. Items arrive from Intake - or add the first one below.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-klyne">
                  <thead>
                    {/*
                      No Cost/Price here (Aug 31 feedback): pricing is the RFQ queue's
                      job, and showing it on the deal invited edits in two places.
                    */}
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Lead time</th>
                      <th>Assignee</th>
                      <th>RFQ status</th>
                      <th>Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.lineItems.map((li) => (
                      <LineItemRow key={li.id} item={li} users={users} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/*
              The client adds a fryer on the callback. Until now the only route in was
              the edit form, which has no item fields - so items could only ever be
              captured at intake. New items land in the RFQ queue needing pricing.
            */}
            {closed ? null : (
              <form
                action={addLineItem}
                className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4"
              >
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <label className="block min-w-48 flex-1">
                  <span className="field-label">Add item</span>
                  <input
                    name="name"
                    required
                    placeholder="e.g. Double convection oven"
                    className="input-klyne w-full"
                  />
                </label>
                <label className="block w-20">
                  <span className="field-label">Qty</span>
                  <input
                    name="qty"
                    type="number"
                    min="1"
                    defaultValue="1"
                    className="input-klyne w-full"
                  />
                </label>
                <PendingButton className="btn btn-sm mb-0.5 active:scale-[0.99]" pendingText="Adding…">
                  Add
                </PendingButton>
              </form>
            )}
          </section>

          <section className="card">
            <FilesSection
              linkedType="opportunity"
              linkedId={opportunity.id}
              docs={dealDocs}
              ownLabel="On this deal"
              uploadsEnabled={uploadsConfigured()}
            />
          </section>

          {opportunity.orders.length > 0 ? (
            <Card title="Orders">
              <ul className="divide-y divide-border">
                {opportunity.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {o.title}
                    </Link>
                    <span className={`badge ${ORDER_STATUS_COLORS[o.status] ?? "badge-gray"}`}>
                      {labelFor(ORDER_STATUSES, o.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/*
            The Close panel replaces the old Mark Won / Mark Lost button pair: the
            terms actually agreed on the call (price, and whether a deposit was
            agreed) are typed HERE, and they become the order, the gate amount and
            the staged payment. Nothing about closing is guessed from a formula.
          */}
          {showClosePanel ? (
            <div id="close" className="scroll-mt-6">
              <Card
                title={needsOrderRecovery ? "Finish closing this deal" : "Close this deal"}
              >
                {needsOrderRecovery ? (
                  <p className="mb-4 text-[13px] text-gray-dark">
                    This deal is marked Won but has no order. Confirm the agreed terms and the
                    order will be created with its line items and payment.
                  </p>
                ) : null}

                <ClosePanel
                  opportunityId={opportunity.id}
                  isProject={isProject}
                  depositPercent={depositPercent}
                  suggestedDeposit={suggestedDeposit}
                  needsOrderRecovery={needsOrderRecovery}
                  defaultValue={opportunity.value}
                  defaultTerms={defaultTerms}
                  locations={closeLocations}
                  defaultLocationId={opportunity.locationId}
                  defaultLocationName={opportunity.location?.name ?? opportunity.locationName}
                  defaultDeliveryAddress={
                    opportunity.location?.address ?? opportunity.deliveryAddress
                  }
                  defaultNeededBy={
                    opportunity.neededByDate
                      ? opportunity.neededByDate.toISOString().slice(0, 10)
                      : ""
                  }
                  defaultLostReason={opportunity.lostReason}
                />
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
