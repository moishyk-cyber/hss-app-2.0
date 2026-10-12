import { ORDER_BALL_SELECT, PIPELINE_DETAIL_INCLUDE } from "../data";
import { getActiveUsers } from "@/lib/users";
import { SectionLink as Link } from "@/lib/SectionLink";
import { DealIntake } from "../DealIntake";
import IntentLink from "@/lib/IntentLink";
import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { ORDER_STATUSES, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { DealProgress } from "../DealProgress";
import { WorkflowSelectionProvider, WorkflowPanel } from "@/lib/WorkflowSelection";
import { dealJourney, intakeIssues, pricingIssues } from "@/lib/dealWorkflow";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { ValidatedForm } from "@/lib/ValidatedForm";
import { PendingButton } from "@/lib/ui";
import { type OrderBallInput } from "@/lib/ballInCourt";
import { plainMoney, type PlainMoney } from "@/lib/money";
import { uploadsConfigured } from "@/lib/storage";
import FilesSection, { type FileDocData } from "../../orders/[id]/FilesSection";
import { addLineItem } from "../actions";
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

type OrderBallRow = PlainMoney<
  Prisma.OrderGetPayload<{ select: typeof ORDER_BALL_SELECT & { id: true; title: true } }>
>;

function toOrderBallInput(order: OrderBallRow): OrderBallInput {
  const { _count, ...rest } = order;
  return { ...rest, openIssueCount: _count.serviceIssues };
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

  const [opportunityRow, users, canClose, documents, requirements, companies] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id },
      include: PIPELINE_DETAIL_INCLUDE,
    }),
    getActiveUsers(),
    can("deals.close"),
    prisma.document.findMany({
      where: { linkedType: "opportunity", linkedId: id },
      orderBy: { uploadedAt: "desc" },
    }),
    getFieldRequirements(),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Money columns are Decimal; plain numbers from here on (line items and the
  // deal value go to client components below).
  const opportunity = plainMoney(opportunityRow);
  if (!opportunity) notFound();

  const stage = opportunity.stage;
  const closed = stage === "won" || stage === "lost";
  const isProject = opportunity.orderType === "project";
  const linkedOrder = opportunity.orders[0] ?? null;

  // Deposit terms come from the account. They are what the payment gate reads -
  // the Close panel shows them, it no longer asks the salesperson to pick terms.
  const requiresDeposit = opportunity.company?.requiresDeposit ?? true;
  const depositPercent = opportunity.company?.depositPercent ?? 30;
  const closeLocations = (opportunity.company?.locations ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
  }));

  // Next action is derived cheaply from the line items' RFQ status counts.
  const liveItems = opportunity.lineItems.filter((li) => li.rfqStatus !== "removed");
  // The item called for furthest out is what the whole deal waits on.
  const leadTimes = liveItems
    .map((li) => li.leadTimeDate)
    .filter((d): d is Date => d != null);
  const latestLeadTimeDate =
    leadTimes.length > 0 ? new Date(Math.max(...leadTimes.map((d) => d.getTime()))) : null;

  // A won deal that never got an order is only half-closed - the Close panel stays
  // open as the recovery route (it reuses the same Won form).
  const needsOrderRecovery = stage === "won" && !linkedOrder;
  const showClosePanel = (!closed || needsOrderRecovery) && canClose;

  const journey = dealJourney(opportunity, {
    company: requirements["opportunity.companyId"],
    neededBy: requirements["opportunity.neededByDate"],
  }, linkedOrder ? { id: linkedOrder.id, ...toOrderBallInput(linkedOrder) } : null);

  const followUpOverdue = isOverdue(opportunity.nextFollowUp);

  // Files land on a deal long before there is an order (drawings, the signed
  // quote), and the order page reads this same set back under "From the deal".
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
    <WorkflowSelectionProvider stepKeys={journey.map(step => step.key)} initialKey={journey.find(step => !["complete", "not_required", "stopped"].includes(step.state))?.key ?? "close"}>
    <div className="pipeline-detail">
      <DetailHeader
        backHref="/pipeline"
        backLabel="Back to Pipeline"
        title={opportunity.title}
        subtitle={opportunity.company?.name ?? "No company linked"}
        badges={
          <>
            <StageBadge stage={stage} />
            <span className="badge badge-gray">{labelFor(ORDER_TYPES, opportunity.orderType)}</span>
            {followUpOverdue ? (
              <span className="badge badge-orange">
                Follow up overdue · {fmtDate(opportunity.nextFollowUp)}
              </span>
            ) : null}
          </>
        }
        secondary={
          <IntentLink href={`/pipeline/${opportunity.id}/edit`} className="btn">Edit deal</IntentLink>
        }
      />

      <DealProgress steps={journey} lost={stage === "lost"} orderHref={linkedOrder ? `/orders/${linkedOrder.id}` : undefined} />
      {needsOrderRecovery ? <div className="banner-alert mb-6">This deal is marked Won but has no order. <Link href="#close" className="underline">Review the details and create its order.</Link></div> : null}
      {stage === "lost" ? <p className="mb-6 text-sm text-gray-dark">Lost reason: {opportunity.lostReason ?? "No reason recorded"}</p> : null}

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

      <div className="deal-detail-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Deal" id="deal-summary">
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
              label="Latest lead time"
              value={fmtDate(latestLeadTimeDate)}
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

          <details className="card deal-extra-details">
            <summary>{isProject ? "Project details" : "Site details"}</summary>
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
          </details>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <WorkflowPanel when={["sales"]}>
          {!closed ? <DealIntake id={opportunity.id} title={opportunity.title} companyId={opportunity.companyId} neededBy={fmtDate(opportunity.neededByDate) ?? ""} companies={companies} required={{ company: requirements["opportunity.companyId"], neededBy: requirements["opportunity.neededByDate"] }} /> : null}
          </WorkflowPanel>
          <WorkflowPanel when={["sales", "pricing"]}>
          <section id="line-items" className="card card-flush overflow-hidden scroll-mt-6">
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
                <table className="deal-line-items table-klyne">
                  <thead>
                    {/* Pricing uses the RFQ's existing save control and server action. */}
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      {!closed ? <th>Price</th> : null}
                      <th>Lead time</th>
                      <th>Assignee</th>
                      <th>RFQ status</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.lineItems.map((li) => (
                      <LineItemRow key={li.id} item={li} users={users} showPricing={!closed} />
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
              <ValidatedForm
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
              </ValidatedForm>
            )}
          </section>

          </WorkflowPanel>
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
          <WorkflowPanel when={["close"]}>
          {showClosePanel ? (
            <div id="close" className="scroll-mt-6">
              <Card
                title={needsOrderRecovery ? "Finish closing this deal" : "Close this deal"}
              >
                {needsOrderRecovery ? (
                  <p className="mb-4 text-[13px] text-gray-dark">
                    This deal is marked Won but has no order. Confirm the details and the order
                    will be created with its line items.
                  </p>
                ) : null}

                <ClosePanel
                  opportunityId={opportunity.id}
                  prerequisiteIssues={[...intakeIssues(opportunity, { company: requirements["opportunity.companyId"], neededBy: requirements["opportunity.neededByDate"] }), ...pricingIssues(opportunity)]}
                  isProject={isProject}
                  requiresDeposit={requiresDeposit}
                  depositPercent={depositPercent}
                  needsOrderRecovery={needsOrderRecovery}
                  defaultValue={opportunity.value}
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
          </WorkflowPanel>
        </div>
      </div>
    </div>
    </WorkflowSelectionProvider>
  );
}
