import { Suspense } from "react";
import { getActiveUsers } from "@/lib/users";
import { DetailHeader } from "@/lib/PageLayout";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CloseoutControl } from "./CloseoutControl";
import { StatusOwnerControls } from "./OrderHeaderControls";
import PaymentsSection from "./PaymentsSection";
import ItemStatusChips from "./ItemStatusChips";
import { OverviewStrip } from "./OverviewStrip";
import { OrderTabs, type TabKey } from "./OrderTabs";
import { OrderLocationField } from "./OrderLocationField";
import { DealProgress } from "@/app/pipeline/DealProgress";
import { PricingItems } from "@/app/pipeline/PricingItems";
import { WorkflowSelectionProvider, WorkflowPanel } from "@/lib/WorkflowSelection";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { hasOrderTerms, orderBall } from "@/lib/ballInCourt";
import { getStageHolders, withHolder } from "@/lib/courtHolders";
import { ActivityHistory, getActivityEntries } from "@/lib/ActivityHistory";
import { startOrderSupportingReads } from "./supportingData";
import { OrderFiles, OrderService, OrderPurchasing, OrderDelivery, OrderCompanyEditor, OrderContactEditor, SectionLoading } from "./SupportingSections";
import { evaluatePaymentGate, ORDER_BALL_INCLUDE, orderBallInput } from "@/lib/flow";
import { dealJourney, orderCanClose } from "@/lib/dealWorkflow";
import { plainMoney } from "@/lib/money";
import { InlineEditField } from "@/lib/ui";
import {
  setOrderClientPoNumber,
  setOrderDeliveryAddress,
  setOrderJobId,
  setOrderNeededByDate,
} from "../actions";
import { fmtDate } from "../utils";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Start the essential record first, ahead of supporting reads in the pool.
  const core = Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        // ORDER_BALL_INCLUDE first (it carries the open-issue count orderBall
        // needs); every relation spelled out below is a superset of the one it
        // asks for, so the ball still sees everything it reads.
        ...ORDER_BALL_INCLUDE,
        company: {
          select: {
            id: true,
            name: true,
            requiresDeposit: true,
            depositPercent: true,
            // Saved sites, for the Location picker in the details grid.
            locations: {
              select: { id: true, name: true, address: true },
              orderBy: [{ isDefault: "desc" }, { name: "asc" }],
            },
          },
        },
        contact: true,
        owner: true,
        payments: true,
        deliveries: { orderBy: { createdAt: "asc" } },
        lineItems: {
          include: {
            // Both feed the item-status drill-down: which PO an item sits on,
            // and which delivery leg is carrying it.
            purchaseOrder: { select: { id: true, poNumber: true } },
            delivery: { select: { id: true, mode: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        purchaseOrders: { orderBy: { createdAt: "asc" } },
      },
    }).then(row => row),
    getActiveUsers(),
    getStageHolders(),
  ]);
  const supporting = startOrderSupportingReads(id);
  const activity = getActivityEntries("order", id);
  void activity.catch(() => {}); // ActivityHistory still surfaces a rejected read.
  const [orderRow, users, holders] = await core;

  // Money columns are Decimal; this row (and slices of it) is handed to the
  // client sections below, which only take plain numbers.
  const order = plainMoney(orderRow);
  if (!order) notFound();

  const gate = evaluatePaymentGate(order);
  // One source of truth for "what happens next" - the header stepper, the badge,
  // the primary action and the opening tab all read this (see @/lib/ballInCourt).
  const ballFacts = orderBallInput(order);
  const ball = withHolder(orderBall(order.status === "complete" && !orderCanClose(ballFacts) ? { ...ballFacts, status: "delivered" } : ballFacts), holders);

  // Terms are free text (Sep 4 client decision) - the header grid shows the
  // first line, the Invoice tab holds the whole thing.
  const termsSummary = (() => {
    const raw = order.termsNotes?.trim();
    if (!raw) return null;
    const firstLine = raw.split("\n")[0].trim();
    return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
  })();

  const unassignedLineItems = order.lineItems
    .filter((li) => !li.purchaseOrderId && li.rfqStatus !== "removed")
    .map((li) => ({ id: li.id, name: li.name, qty: li.qty }));

  const anySent = order.purchaseOrders.some((po) => po.status === "sent");

  // Both record pages use the same journey and step labels.
  // Completed sales work is reviewed in place; order work opens its local tab.
  const steps = dealJourney({ id: order.opportunityId ?? order.id, title: order.title, stage: "won", companyId: order.companyId, neededByDate: order.neededByDate, lineItems: order.lineItems }, { company: false, neededBy: false }, { ...orderBallInput(order), id: order.id }).map((step, index) => {
    // Sales-side work is historical once the order exists. Review it in place.
    if (index < 3) return { ...step, state: "complete" as const, action: undefined, checks: [{ label: index === 0 ? "Request captured and carried into this order" : index === 1 ? "Deal pricing confirmed before order creation" : "Deal won and order created", complete: true, href: index === 0 ? "#order-intake" : index === 1 ? "#line-items" : "#order-summary" }], description: index === 0 ? "Review the intake details below. Changes to the customer, delivery address and needed-by date are saved on this order." : index === 1 ? "Review the item prices below. Price changes save when you leave the field or press Enter." : "The customer decision is recorded and this order was created. Continue with the remaining order steps." };
    const localHref = (href: string) => href === `/orders/${order.id}` ? "#order-summary" : href.replace(`/orders/${order.id}`, "");
    return { ...step, action: step.action ? { ...step.action, href: localHref(step.action.href) } : undefined, checks: step.checks.map(check => ({ ...check, href: check.href ? localHref(check.href) : undefined })) };
  });

  // ---- Header pattern (spec §H): ONE contextual primary action ----
  // Ordered like the ball itself: quote, then terms, then the money, then the
  // POs, then completion.
  const isOpen = order.status !== "complete";
  let primaryAction: React.ReactNode = null;
  if (isOpen && ["needed", "sent"].includes(order.quoteStatus)) {
    primaryAction = (
      <a href="#quote-status" className="btn btn-primary active:scale-[0.99]">
        {order.quoteStatus === "sent" ? "Record customer approval" : "Review customer quote"}
      </a>
    );
  } else if (isOpen && !hasOrderTerms(order)) {
    primaryAction = (
      <a href="#order-terms" className="btn btn-primary active:scale-[0.99]">
        Set terms
      </a>
    );
  } else if (isOpen && !gate.open) {
    primaryAction = (
      <a href="#payments" className="btn btn-primary active:scale-[0.99]">
        Record payment
      </a>
    );
  } else if (isOpen && unassignedLineItems.length > 0) {
    primaryAction = (
      <a href="#purchase-orders" className="btn btn-primary active:scale-[0.99]">
        Create POs
      </a>
    );
  } else if (isOpen && anySent) {
    // Acknowledging is per-PO now: each one asks how those goods are coming
    // over and turns into a delivery, so there is nothing to bulk-click.
    primaryAction = (
      <a href="#purchase-orders" className="btn btn-primary active:scale-[0.99]">
        Acknowledge POs
      </a>
    );
  } else if (isOpen && orderCanClose(orderBallInput(order))) {
    // canCompleteOrder is vacuously true when there are no POs at all (a direct
    // intake order with no purchasing leg) - don't gate this on purchaseOrders.length.
    primaryAction = (
      <a href="#order-complete" className="btn btn-primary active:scale-[0.99]">
        Review closeout
      </a>
    );
  }

  // Tabs replace the old stacked sections (Aug 31 feedback: "create tabs...
  // Invoice tab, PO tab, delivery tab"). The tab that opens is wherever the
  // ball sits; a finished order opens on Delivery, the record of what landed.
  const TAB_FOR_STEP: Record<string, TabKey> = {
    quote: "invoice",
    terms: "invoice",
    deposit: "invoice",
    pos: "purchase-orders",
    delivery: "delivery",
    service: "service",
  };
  const defaultTab: TabKey = (ball.step ? TAB_FOR_STEP[ball.step] : undefined) ?? "delivery";

  const location = order.company?.locations.find((l) => l.id === order.locationId) ?? null;
  const autoQuotesNumbers = order.purchaseOrders
    .map((po) => po.autoQuotesPoNumber)
    .filter((n): n is string => Boolean(n && n.trim()));

  const chipItems = order.lineItems.map((li) => ({
    id: li.id,
    name: li.name,
    qty: li.qty,
    rfqStatus: li.rfqStatus,
    deliveryStatus: li.deliveryStatus,
    purchaseOrderId: li.purchaseOrderId,
    poNumber: li.purchaseOrder?.poNumber ?? null,
    deliveryMode: li.delivery?.mode ?? null,
    deliveryLegStatus: li.delivery?.status ?? null,
  }));
  const hasLiveItems = chipItems.some((i) => i.rfqStatus !== "removed");

  return (
    <WorkflowSelectionProvider orderId={order.id} revision={JSON.stringify([order.updatedAt, order.payments, steps])} stepKeys={steps.map(step => step.key)} initialKey={steps.find(step => !["complete", "not_required", "stopped"].includes(step.state))?.key ?? "close"}>
    <div className="pipeline-detail space-y-8">
      <DetailHeader backHref="/orders" backLabel="Back to Orders" title={order.title}
        subtitle={<>{order.company ? <Link href={`/companies/${order.company.id}`}>{order.company.name}</Link> : "No linked business"}{order.contact && <> · {order.contact.firstName} {order.contact.lastName ?? ""}</>}</>}
        badges={<><span className="badge badge-gray capitalize">{order.orderType}</span><BallInCourtBadge ball={ball}/></>}
        action={primaryAction}/>
      <DealProgress steps={steps} lost={false} />
      <WorkflowPanel when={["pricing"]}>
        <PricingItems items={order.lineItems} editable={isOpen} />
      </WorkflowPanel>
      <WorkflowPanel when={["quote", "terms", "deposit", "pos", "delivery", "service", "files"]}>
      <div className="card">
        <OrderTabs
          defaultTab={defaultTab}
          invoice={
            <PaymentsSection
              orderId={order.id}
              payments={order.payments}
              gate={gate}
              terms={{ termsNotes: order.termsNotes, paymentTerms: order.paymentTerms }}
              quote={{
                quoteStatus: order.quoteStatus,
                quoteUrl: order.quoteUrl,
                quoteSentAt: order.quoteSentAt,
              }}
            />
          }
          purchaseOrders={
            <Suspense fallback={<SectionLoading name="purchase orders" />}>
              <OrderPurchasing orderId={order.id} data={supporting}
                purchaseOrderIds={order.purchaseOrders.map(po => po.id)}
                unassignedLineItems={unassignedLineItems} gate={gate} />
            </Suspense>
          }
          delivery={
            <Suspense fallback={<SectionLoading name="deliveries" />}>
              <OrderDelivery orderId={order.id} data={supporting} users={users} />
            </Suspense>
          }
          files={
            <Suspense fallback={<SectionLoading name="files" />}>
              <OrderFiles orderId={order.id} opportunityId={order.opportunityId} />
            </Suspense>
          }
          service={<>
            <Suspense fallback={<SectionLoading name="service issues" />}>
              <OrderService orderId={order.id} companyId={order.companyId}
                locationId={order.locationId} issues={supporting.issues} users={users}
                items={order.lineItems.filter(li => li.rfqStatus !== "removed")
                  .map(li => ({ id: li.id, name: li.name }))} />
            </Suspense>
            <CloseoutControl orderId={order.id} step={steps.find(step => step.key === "service")!} />
          </>}
        />
      </div>
      </WorkflowPanel>

      <div className="card">

        <details className="mt-4 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Fulfillment summary</summary>
        {hasLiveItems ? (
          <div className="mt-4 border-t border-border pt-4">
            <ItemStatusChips items={chipItems} />
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-4">
          <OverviewStrip
            items={order.lineItems}
            purchaseOrders={order.purchaseOrders}
            deliveries={order.deliveries}
            payments={order.payments}
            gate={gate}
          />
        </div>

        </details>

        <div id="order-summary" className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <StatusOwnerControls
            orderId={order.id}
            status={order.status}
            ownerId={order.ownerId}
            users={users}
          />
        </div>

        <WorkflowPanel when={["sales"]}>
        <section id="order-intake" aria-label="Intake details" className="mt-4 border-t border-border pt-4"><h2 className="text-sm font-medium">Intake details</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <div className="field-label">Business</div>
            <div className="text-ink">
              <Suspense fallback={<span>{order.company?.name ?? "No linked business"}</span>}>
              <OrderCompanyEditor
                orderId={order.id}
                companyId={order.companyId}
                companyName={order.company?.name ?? null}
                companies={supporting.companies}
              />
              </Suspense>
            </div>
          </div>
          <div>
            <div className="field-label">Contact</div>
            <div className="text-ink">
              <Suspense fallback={<span>{order.contact ? [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ") : "No linked contact"}</span>}>
              <OrderContactEditor
                // Remounts on business change so a Contact edit box left open
                // (with the old business's typed name still in it) doesn't
                // keep showing stale text after the business is switched -
                // the server already cleared contactId, this clears the UI.
                key={order.companyId ?? "no-company"}
                orderId={order.id}
                companyId={order.companyId}
                contactId={order.contactId}
                contactName={
                  order.contact
                    ? [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ")
                    : null
                }
                contacts={supporting.contacts}
              />
              </Suspense>
            </div>
          </div>
          <div>
            <div className="field-label">Location</div>
            <div className="text-ink">
              <OrderLocationField
                // Same reasoning as the Contact field's key: a Location edit
                // box left open across a business change shouldn't keep
                // showing the old business's location.
                key={order.companyId ?? "no-company"}
                orderId={order.id}
                companyId={order.companyId}
                locationId={order.locationId}
                locationName={location?.name ?? null}
                locations={order.company?.locations ?? []}
              />
            </div>
          </div>
          <div className="col-span-2 md:col-span-3">
            <div className="field-label">Delivery Address</div>
            <div className="text-ink">
              <InlineEditField
                // Same reasoning as the Contact/Location keys above -
                // deliveryAddress is cleared server-side on a business
                // change too, so this shouldn't keep showing (or re-save)
                // an edit box left open with the old business's address.
                key={order.companyId ?? "no-company"}
                value={order.deliveryAddress ?? ""}
                ariaLabel="Edit delivery address"
                placeholder="Delivery address"
                save={setOrderDeliveryAddress.bind(null, order.id)}
              />
            </div>
          </div>
          <div>
            <div className="field-label">Job ID</div>
            <div className="text-ink">
              <InlineEditField
                value={order.jobId ?? ""}
                ariaLabel="Edit Job ID"
                placeholder="Job ID"
                save={setOrderJobId.bind(null, order.id)}
              />
            </div>
          </div>
          <div>
            <div className="field-label">Client PO #</div>
            <div className="text-ink">
              <InlineEditField
                value={order.clientPoNumber ?? ""}
                ariaLabel="Edit Client PO #"
                placeholder="Client PO #"
                save={setOrderClientPoNumber.bind(null, order.id)}
              />
            </div>
          </div>
          <div>
            <div className="field-label">AutoQuotes PO #</div>
            <div className="text-ink">
              {autoQuotesNumbers.length > 0 ? (
                autoQuotesNumbers.join(", ")
              ) : (
                <span className="empty-value">not set</span>
              )}
            </div>
          </div>
          <div>
            <div className="field-label">Terms</div>
            <div className="text-ink">
              {termsSummary ? (
                // The full text lives on the Invoice tab - the header shows the
                // first line so the grid stays a grid.
                <span title={order.termsNotes ?? undefined}>{termsSummary}</span>
              ) : (
                <span className="empty-value">not set</span>
              )}
            </div>
          </div>
          <div>
            <div className="field-label">Needed By</div>
            <div className="text-ink">
              <InlineEditField
                type="date"
                value={order.neededByDate ? order.neededByDate.toISOString().slice(0, 10) : ""}
                displayValue={
                  order.neededByDate ? (
                    // Deterministic UTC formatting (see @/lib/dates), so this
                    // never reads a day earlier than the orders list for the
                    // same record.
                    fmtDate(order.neededByDate)
                  ) : undefined
                }
                ariaLabel="Edit needed-by date"
                save={setOrderNeededByDate.bind(null, order.id)}
              />
            </div>
          </div>
        </div>
        </section>
        </WorkflowPanel>
      </div>


      <Suspense fallback={<SectionLoading name="order activity" />}><ActivityHistory linkedType="order" linkedId={order.id} title="Order activity" entries={activity} /></Suspense>
    </div>
    </WorkflowSelectionProvider>
  );
}
