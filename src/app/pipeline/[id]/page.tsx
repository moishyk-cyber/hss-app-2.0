import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { FlowStepper, type FlowStep } from "@/lib/FlowStepper";
import { PendingButton } from "@/lib/ui";
import {
  addLineItem,
  markOpportunityLost,
  markOpportunityWon,
  moveStageFromStepper,
} from "../actions";
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
 * The sales process, and the control for driving it (Aug 31 feedback): each open
 * step moves the deal to `target`; Close never writes a stage, it points at the
 * Close panel where Won/Lost do their real work.
 */
const STEPPER: { label: string; stages: string[]; target: string | null }[] = [
  { label: "Intake", stages: ["new", "info_missing"], target: "new" },
  { label: "Estimating", stages: ["estimating"], target: "estimating" },
  { label: "Proposal", stages: ["proposal_sent", "revisions_needed"], target: "proposal_sent" },
  { label: "Negotiation", stages: ["negotiation"], target: "negotiation" },
  { label: "Close", stages: ["won", "lost"], target: null },
];

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
        company: true,
        primaryContact: true,
        salesperson: true,
        lineItems: true,
        orders: { select: { id: true, title: true, status: true } },
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
    if (stage === "proposal_sent") return "Awaiting client - then close it";
    if (stage === "negotiation") return "Close the deal";
    if (itemCount === 0) return "Add line items";
    if (pricedCount > 0) return "Send proposal";
    return "Move to estimating";
  })();

  const foundStepIndex = STEPPER.findIndex((s) => s.stages.includes(stage));
  const currentStepIndex = foundStepIndex === -1 ? 0 : foundStepIndex;
  const closeStepIndex = STEPPER.length - 1;

  // A won deal that never got an order is only half-closed - the Close panel stays
  // open as the recovery route (it reuses the same Won form).
  const needsOrderRecovery = stage === "won" && !linkedOrder;
  const showClosePanel = !closed || needsOrderRecovery;

  const steps: FlowStep[] = STEPPER.map((step, i) => {
    // A closed deal has finished the whole journey, including the final step.
    const state: FlowStep["state"] =
      closed || i < currentStepIndex ? "done" : i === currentStepIndex ? "current" : "upcoming";
    const isCloseStep = i === closeStepIndex;
    return {
      label: step.label,
      state,
      hint: i === currentStepIndex ? nextActionHint : undefined,
      // Closed deals: the stepper is a record, not a control.
      href: !closed && isCloseStep ? "#close" : undefined,
      formAction:
        closed || isCloseStep || i === currentStepIndex || !step.target
          ? undefined
          : moveStageFromStepper.bind(null, opportunity.id, step.target),
    };
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
      ) : error === "item_name_required" ? (
        <div className="banner-alert mb-4">Give the item a name before adding it.</div>
      ) : error === "save_failed" ? (
        <div className="banner-alert mb-4">Something went wrong while saving. Please try again.</div>
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

                <div
                  className={`grid grid-cols-1 gap-6 ${
                    needsOrderRecovery ? "" : "md:grid-cols-2"
                  }`}
                >
                  <form action={markOpportunityWon} className="space-y-3">
                    <input type="hidden" name="id" value={opportunity.id} />
                    {/* Tells the action these fields were really asked (an unticked box
                        means "no deposit agreed", not "this form didn't ask"). */}
                    <input type="hidden" name="closePanel" value="1" />

                    <p className="section-label !mb-0">Won</p>

                    <label className="block">
                      <span className="field-label">Total price agreed</span>
                      <input
                        type="number"
                        name="value"
                        min="1"
                        step="any"
                        required
                        defaultValue={opportunity.value ?? ""}
                        placeholder="0"
                        className="input-klyne w-full"
                      />
                    </label>

                    {isProject ? (
                      <div className="rounded-[10px] border border-border bg-panel p-3">
                        <label className="flex items-center gap-2 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            name="requireDeposit"
                            value="1"
                            defaultChecked={requiresDeposit}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          Deposit required?
                        </label>
                        <label className="mt-3 block">
                          <span className="field-label">Deposit amount</span>
                          <input
                            type="number"
                            name="depositAmount"
                            min="0"
                            step="any"
                            defaultValue={suggestedDeposit || ""}
                            placeholder="0"
                            className="input-klyne w-full"
                          />
                        </label>
                        <p className="mt-1.5 text-xs text-gray">
                          Prefilled at {depositPercent}% for this account - change it to whatever
                          was agreed. Untick the box and POs won&rsquo;t wait for a payment.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[13px] text-gray-dark">
                        A straight order stages the full payment - POs go out once it&rsquo;s paid.
                      </p>
                    )}

                    {/* The header owns the page's single filled CTA (§H), so this stays secondary. */}
                    <PendingButton className="btn active:scale-[0.99]" pendingText="Creating order…">
                      {needsOrderRecovery ? "Create the order" : "Mark won - create the order"}
                    </PendingButton>
                  </form>

                  {needsOrderRecovery ? null : (
                    <form action={markOpportunityLost} className="space-y-3">
                      <input type="hidden" name="id" value={opportunity.id} />
                      <p className="section-label !mb-0">Lost</p>
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
                      <p className="text-[13px] text-gray-dark">
                        Closes the deal and drops it out of the follow-up queue. No order is
                        created.
                      </p>
                      <PendingButton
                        className="btn btn-danger active:scale-[0.99]"
                        pendingText="Closing…"
                      >
                        Mark lost
                      </PendingButton>
                    </form>
                  )}
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
