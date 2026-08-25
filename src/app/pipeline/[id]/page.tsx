import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { FlowStepper, type FlowStep } from "@/lib/flow";
import { PendingButton } from "@/lib/ui";
import { markOpportunityLost, markOpportunityWon } from "../actions";
import {
  Card,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  DetailHeader,
  DetailRow,
  DeliveryLabel,
  ORDER_TYPES,
  RfqBadge,
  StageBadge,
  fmtDate,
  fmtMoney,
  isOverdue,
} from "../_ui";

/** Where this deal sits in the journey of UX_FLOW §2. */
const FLOW_STEPS = ["Intake", "Estimating", "Proposal", "Negotiation", "Closed"] as const;

const STEP_INDEX_BY_STAGE: Record<string, number> = {
  new: 0,
  info_missing: 0,
  estimating: 1,
  proposal_sent: 2,
  revisions_needed: 2,
  negotiation: 3,
  won: 4,
  lost: 4,
};

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      company: true,
      primaryContact: true,
      salesperson: true,
      lineItems: { include: { supplier: { select: { id: true, name: true } } } },
      orders: { select: { id: true, title: true, status: true } },
    },
  });
  if (!opportunity) notFound();

  const stage = opportunity.stage;
  const closed = stage === "won" || stage === "lost";
  const isProject = opportunity.orderType === "project";
  const linkedOrder = opportunity.orders[0] ?? null;

  // Next action is derived cheaply from the line items' RFQ status counts.
  const liveItems = opportunity.lineItems.filter((li) => li.rfqStatus !== "removed");
  const needsPricingCount = liveItems.filter((li) => li.rfqStatus === "needs_pricing").length;
  const awaitingQuoteCount = liveItems.filter((li) => li.rfqStatus === "rfq_sent").length;
  const pricedCount = liveItems.filter(
    (li) => li.rfqStatus === "quote_received" || li.rfqStatus === "priced_in_autoquotes"
  ).length;

  const lostReason = opportunity.lostReason;
  const itemCount = liveItems.length;

  const nextActionHint = ((): string => {
    if (stage === "won") return "View order";
    if (stage === "lost") return lostReason ?? "Deal lost";
    if (needsPricingCount > 0) {
      return `Price ${needsPricingCount} item${needsPricingCount === 1 ? "" : "s"}`;
    }
    if (awaitingQuoteCount > 0) {
      return `Chase ${awaitingQuoteCount} quote${awaitingQuoteCount === 1 ? "" : "s"}`;
    }
    if (stage === "revisions_needed") return "Send revised proposal";
    if (stage === "proposal_sent") return "Awaiting client — mark won or lost";
    if (stage === "negotiation") return "Close the deal";
    if (itemCount === 0) return "Add line items";
    if (pricedCount > 0) return "Send proposal";
    return "Move to estimating";
  })();

  const currentStepIndex = STEP_INDEX_BY_STAGE[stage] ?? 0;
  const steps: FlowStep[] = FLOW_STEPS.map((label, i) => {
    // A closed deal has finished the whole journey, including the final step.
    const state: FlowStep["state"] =
      closed || i < currentStepIndex ? "done" : i === currentStepIndex ? "current" : "upcoming";
    return {
      label,
      state,
      hint: i === currentStepIndex ? nextActionHint : undefined,
    };
  });

  // Exactly one contextual primary action (UX_FLOW §H).
  const primaryAction =
    stage === "won" && linkedOrder
      ? { href: `/orders/${linkedOrder.id}`, label: "View order" }
      : closed
        ? { href: `/pipeline/${opportunity.id}/edit`, label: "Edit deal" }
        : needsPricingCount > 0
          ? { href: "/rfq", label: `Open RFQ items (${needsPricingCount})` }
          : stage === "proposal_sent" || stage === "revisions_needed" || stage === "negotiation"
            ? { href: "#close-deal", label: "Mark won or lost" }
            : { href: `/pipeline/${opportunity.id}/edit`, label: "Edit deal" };

  const followUpOverdue = isOverdue(opportunity.nextFollowUp);

  return (
    <div>
      <DetailHeader
        backHref="/pipeline"
        backLabel="Pipeline"
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

      <div className="card mb-4 px-5 py-4">
        <FlowStepper steps={steps} />
        {closed ? (
          <p className="mt-3 border-t border-border pt-3 text-center text-xs text-gray-dark">
            {stage === "won" ? (
              linkedOrder ? (
                <>
                  Won — now an order:{" "}
                  <Link
                    href={`/orders/${linkedOrder.id}`}
                    className="text-accent transition-colors hover:underline"
                  >
                    {linkedOrder.title}
                  </Link>
                </>
              ) : (
                "Won — no order linked yet."
              )
            ) : (
              <>Lost — {opportunity.lostReason ?? "no reason recorded"}</>
            )}
          </p>
        ) : null}
      </div>

      {error === "lost_reason_required" ? (
        <div className="banner-warn mb-4">
          A lost reason is required before a deal can be marked Lost.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card title="Deal">
            <DetailRow label="Stage" value={<StageBadge stage={opportunity.stage} />} />
            <DetailRow label="Order type" value={labelFor(ORDER_TYPES, opportunity.orderType)} />
            <DetailRow label="Needs pricing" value={opportunity.needsPricing ? "Yes" : "No"} />
            <DetailRow label="Value" value={fmtMoney(opportunity.value)} />
            <DetailRow label="Budget" value={fmtMoney(opportunity.budget)} />
            <DetailRow
              label="Company"
              value={
                opportunity.company ? (
                  <Link
                    href={`/companies/${opportunity.company.id}`}
                    className="text-accent hover:underline"
                  >
                    {opportunity.company.name}
                  </Link>
                ) : null
              }
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
            <DetailRow label="Salesperson" value={opportunity.salesperson?.name ?? null} />
            <DetailRow label="Needed by" value={fmtDate(opportunity.neededByDate)} />
            <DetailRow label="Est./order due" value={fmtDate(opportunity.estDueDate)} />
            <DetailRow label="Next follow-up" value={fmtDate(opportunity.nextFollowUp)} />
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
              value={labelFor(DELIVERY_TYPES, opportunity.deliveryType)}
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

        <div className="space-y-4 lg:col-span-2">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="section-label">Line items</h2>
              <span className="badge badge-gray">{opportunity.lineItems.length}</span>
            </div>
            {opportunity.lineItems.length === 0 ? (
              <div className="p-4">
                <div className="empty-state">No line items on this deal.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-klyne">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Supplier</th>
                      <th>Cost</th>
                      <th>Price</th>
                      <th>RFQ status</th>
                      <th>Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td>
                          <div className="font-medium text-ink">{li.name}</div>
                          {li.description ? (
                            <div className="text-xs text-gray">{li.description}</div>
                          ) : null}
                        </td>
                        <td className="text-gray-dark">{li.qty}</td>
                        <td className="text-gray-dark">{li.supplier?.name ?? "—"}</td>
                        <td className="text-gray-dark">{fmtMoney(li.unitCost)}</td>
                        <td className="text-gray-dark">{fmtMoney(li.unitPrice)}</td>
                        <td>
                          <RfqBadge status={li.rfqStatus} />
                        </td>
                        <td className="text-xs text-gray-dark">
                          <DeliveryLabel status={li.deliveryStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {opportunity.orders.length > 0 ? (
            <Card title="Orders">
              <ul className="divide-y divide-border">
                {opportunity.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-ink transition-colors hover:text-accent"
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

          {closed ? null : (
            <div id="close-deal" className="scroll-mt-6">
              <Card title="Close this deal">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <form action={markOpportunityWon}>
                  <input type="hidden" name="id" value={opportunity.id} />
                  <p className="mb-3 text-[13px] text-gray-dark">
                    Creates an order, carries every non-removed line item across, and stages a{" "}
                    {isProject ? "30% deposit" : "full payment"} of{" "}
                    <span className="font-medium text-ink">
                      {fmtMoney(
                        Math.round(
                          isProject ? (opportunity.value ?? 0) * 0.3 : opportunity.value ?? 0
                        )
                      )}
                    </span>
                    .
                  </p>
                  {/* The header owns the page's single filled CTA (§H), so this stays secondary. */}
                  <PendingButton
                    className="btn active:scale-[0.99]"
                    pendingText="Creating order…"
                  >
                    ✓ Mark Won
                  </PendingButton>
                </form>

                <form action={markOpportunityLost}>
                  <input type="hidden" name="id" value={opportunity.id} />
                  <label className="block">
                    <span className="field-label">Lost reason (required)</span>
                    <input
                      type="text"
                      name="lostReason"
                      required
                      defaultValue={opportunity.lostReason ?? ""}
                      placeholder="Why did we lose it?"
                      className="input-klyne w-full"
                    />
                  </label>
                  <PendingButton
                    className="btn btn-danger mt-3 active:scale-[0.99]"
                    pendingText="Closing…"
                  >
                    Mark Lost
                  </PendingButton>
                </form>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
