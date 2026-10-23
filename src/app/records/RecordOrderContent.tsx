import { TeamNotes } from "@/lib/TeamNotes";
import { IntakeEditor } from "@/app/pipeline/[id]/edit/IntakeEditor";
import { RecordWorkspace } from "@/lib/RecordWorkspace";
import { RequirementsSpinner } from "@/lib/WorkflowRequirementsLoading";
import { readWorkflowStep } from "@/lib/pipelineWorkflow";
import { WorkflowStepHeader } from "@/lib/WorkflowStepHeader";
import { can } from "@/lib/permissionsServer";
import { deliveryDestinationOptions } from "@/lib/deliveryDestination";
import { getDeliveryPartners } from "@/lib/deliveryPartnerData";
import { DeliveryPartnersProvider } from "@/app/deliveries/PartnerInput";
import { AutoQuotesField } from "@/app/orders/[id]/AutoQuotesField";
import { Suspense } from "react";
import { getActiveUsers } from "@/lib/users";
import { DetailHeader } from "@/lib/PageLayout";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteIntakeButton } from "@/app/intake/DeleteIntakeButton";
import { prisma } from "@/lib/prisma";
import { CloseoutControl } from "@/app/orders/[id]/CloseoutControl";
import { StatusOwnerControls } from "@/app/orders/[id]/OrderHeaderControls";
import PaymentsSection from "@/app/orders/[id]/PaymentsSection";
import ItemStatusChips from "@/app/orders/[id]/ItemStatusChips";
import { OverviewStrip } from "@/app/orders/[id]/OverviewStrip";
import { OrderTabs, type TabKey } from "@/app/orders/[id]/OrderTabs";
import { OrderLocationField } from "@/app/orders/[id]/OrderLocationField";
import { DealProgress } from "@/app/pipeline/DealProgress";
import { PricingItems } from "@/app/pipeline/PricingItems";
import { WorkflowSelectionProvider, WorkflowPanel } from "@/lib/WorkflowSelection";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { orderBall } from "@/lib/ballInCourt";
import { getStageHolders, withHolder, withJourneyHolders } from "@/lib/courtHolders";
import { ActivityHistory, getActivityEntries } from "@/lib/ActivityHistory";
import { startOrderSupportingReads } from "@/app/orders/[id]/supportingData";
import { OrderFiles, OrderService, OrderPurchasing, OrderDelivery, OrderCompanyEditor, OrderContactEditor, SectionLoading } from "@/app/orders/[id]/SupportingSections";
import { evaluatePaymentGate, ORDER_BALL_INCLUDE, orderBallInput } from "@/lib/flow";
import { dealJourney, orderCanClose } from "@/lib/dealWorkflow";
import { plainMoney } from "@/lib/money";
import { BadgeSelect, InlineEditField } from "@/lib/ui";
import {
  setOrderTitle,
  setOrderNotes,
  setOrderDeliveryDetail,
  setOrderClientPoNumber,
  setOrderJobId,
  setOrderNeededByDate,
} from "@/app/orders/actions";
import { fmtDate } from "@/app/orders/utils";

export async function RecordOrderContent({ id, query, backHref = "/orders" }: { id: string; query: { workflow?: string; step?: string }; backHref?: string }) {
  const requestedStep = readWorkflowStep(query.workflow);
  const focusedStep = requestedStep;

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
            paymentTermsConfigured: true,
            // Saved sites, for the Location picker in the details grid.
            locations: {
              select: { id: true, name: true, address: true },
              orderBy: [{ isDefault: "desc" }, { name: "asc" }],
            },
          },
        },
        contact: true,
        owner: true,
        location: { select: { name: true, address: true } },
        opportunity: { select: { notes: true, clientQuoteCreated: true, clientQuoteSent: true, clientQuoteUrl: true, companyId: true, locationName: true, salesperson: { select: { name: true, active: true } } } },
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

  const canEditIntake = await can("orders.edit");
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
  const steps = withJourneyHolders(dealJourney({ id: order.opportunityId ?? order.id, title: order.title, stage: "won", clientQuoteCreated: order.opportunity?.clientQuoteCreated, clientQuoteSent: order.opportunity?.clientQuoteSent, salesperson: order.opportunityId ? order.opportunity?.salesperson : order.owner, companyId: order.companyId, neededByDate: order.neededByDate, lineItems: order.lineItems }, { company: false, neededBy: false }, { ...orderBallInput(order), id: order.id }), holders).map(step => {
    // Sales-side work is historical once the order exists. Review it in place.
    if (["sales", "pricing", "close"].includes(step.key)) return { ...step, state: "complete" as const, action: undefined, checks: [{ label: step.key === "sales" ? "Request captured and carried into this order" : step.key === "pricing" ? "Supplier quotes reviewed before order creation" : "Deal confirmed and order created", complete: true, href: step.key === "sales" ? "#order-intake" : step.key === "pricing" ? "#line-items" : "#order-summary" }], description: step.key === "sales" ? "Review the intake details below." : step.key === "pricing" ? "Review the requested items below." : "The customer decision is recorded and this order was created." };
    const localHref = (href: string) => href === `/orders/${order.id}` ? "#order-summary" : href.replace(`/orders/${order.id}`, "");
    return { ...step, action: step.action ? { ...step.action, href: localHref(step.action.href) } : undefined, checks: step.checks.map(check => ({ ...check, href: check.href ? localHref(check.href) : undefined })) };
  });

  // ---- Header pattern (spec §H): ONE contextual primary action ----
  // Ordered like the ball itself: quote, then terms, then the money, then the
  // POs, then completion.
  const isOpen = order.status !== "complete";
  let primaryAction: React.ReactNode = null;
  if (isOpen && !gate.open) {
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
    deposit: "invoice",
    pos: "purchase-orders",
    delivery: "delivery",
    service: "service",
  };
  const defaultTab: TabKey = (ball.step ? TAB_FOR_STEP[ball.step] : undefined) ?? "delivery";


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

  const intakeEditor = (
        <section id="order-intake" aria-label="Intake details" className="mt-4 border-t border-border pt-4"><h2 className="text-sm font-medium">Intake details</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div className="col-span-2 md:col-span-3"><div className="field-label">Title</div><InlineEditField value={order.title} ariaLabel="Edit order title" save={setOrderTitle.bind(null, order.id)} /></div>
          {!order.opportunityId && <>
            <div><div className="field-label">Delivery type</div><BadgeSelect value={order.deliveryType ?? ""} options={[{ value: "", label: "Not specified" }, { value: "curbside", label: "Curbside" }, { value: "inside", label: "Inside" }]} colorMap={{ "": "badge-gray", curbside: "badge-gray", inside: "badge-gray" }} ariaLabel="Delivery type" action={setOrderDeliveryDetail.bind(null, order.id, "deliveryType")} /></div>
            <div><div className="field-label">Installation needed</div><BadgeSelect value={order.installationNeeded ? "yes" : "no"} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} colorMap={{ yes: "badge-gray", no: "badge-gray" }} ariaLabel="Installation needed" action={setOrderDeliveryDetail.bind(null, order.id, "installationNeeded")} /></div>
            <div><div className="field-label">Floor note</div><InlineEditField value={order.floorNote ?? ""} ariaLabel="Floor note" save={setOrderDeliveryDetail.bind(null, order.id, "floorNote")} /></div>
            {order.deliveryType === "inside" && <div><div className="field-label">Opening size</div><InlineEditField value={order.openingSize ?? ""} ariaLabel="Opening size" save={setOrderDeliveryDetail.bind(null, order.id, "openingSize")} /></div>}
          </>}
          <div className="col-span-2 md:col-span-3"><div className="field-label">Notes</div><InlineEditField value={order.notes ?? ""} ariaLabel="Edit order notes" save={setOrderNotes.bind(null, order.id)} /></div>
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
          <div className="col-span-2 md:col-span-3"><OrderLocationField key={`${order.companyId}:${order.locationId}:${order.deliveryAddress}`} orderId={order.id} destination={deliveryDestinationOptions(order)} /></div>
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
              {order.purchaseOrders.length > 0 ? (
                <div className="space-y-2">
                  {order.purchaseOrders.map((po) => (
                    <div key={po.id} className="space-y-1">
                      {order.purchaseOrders.length > 1 && <div className="text-xs text-gray-dark">{po.poNumber ?? "Purchase order"}</div>}
                      <AutoQuotesField po={po} />
                    </div>
                  ))}
                </div>
              ) : (
                <span className="empty-value">Add a purchase order first</span>
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
  );

  if (focusedStep) return (
    <DeliveryPartnersProvider partners={await getDeliveryPartners()}>
      <WorkflowSelectionProvider orderId={order.id} revision={JSON.stringify([order.updatedAt, order.payments, steps])} stepKeys={[focusedStep]} initialKey={focusedStep}>
        <div className="pipeline-detail space-y-5">
          <WorkflowStepHeader title={order.title} step={steps.find(step => step.key === focusedStep)!} />
          {focusedStep === "sales" && <>{intakeEditor}{order.opportunityId && <IntakeEditor projectOnly params={Promise.resolve({ id: order.opportunityId })} searchParams={Promise.resolve({})} />}</>}
          {focusedStep === "pricing" && <PricingItems items={order.lineItems} editable={isOpen} />}
          {focusedStep === "clientQuote" && <section className="card"><h2 className="section-label">Client Quote</h2><p>{order.opportunity?.clientQuoteSent ? "Client quote sent." : "Order confirmed before this step was required."}</p>{order.opportunity?.clientQuoteUrl && <a href={order.opportunity.clientQuoteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Open client quote</a>}</section>}
          {focusedStep === "close" && <section className="card"><h2 className="section-label">Confirm Deal</h2><p>Deal confirmed. Agreed total: {order.orderValue == null ? "Not set" : `$${Number(order.orderValue).toLocaleString("en-US")}`}.</p></section>}
          {focusedStep === "deposit" && <PaymentsSection orderId={order.id} payments={order.payments} gate={gate} terms={{ termsNotes: order.termsNotes, paymentTerms: order.paymentTerms, orderValue: order.orderValue }} />}
          {focusedStep === "pos" && <Suspense fallback={<RequirementsSpinner />}>
            <OrderPurchasing orderId={order.id} data={supporting} purchaseOrderIds={order.purchaseOrders.map(po => po.id)} unassignedLineItems={unassignedLineItems} gate={gate} salesOrderSentAt={order.salesOrderSentAt} />
          </Suspense>}
          {focusedStep === "delivery" && <Suspense fallback={<RequirementsSpinner />}>
            <OrderDelivery orderId={order.id} data={supporting} destination={deliveryDestinationOptions(order)} />
          </Suspense>}
          {focusedStep === "service" && <>
            <Suspense fallback={<RequirementsSpinner />}>
              <OrderService orderId={order.id} companyId={order.companyId} locationId={order.locationId} issues={supporting.issues} users={users} items={order.lineItems.filter(li => li.rfqStatus !== "removed").map(li => ({ id: li.id, name: li.name }))} />
            </Suspense>
            <CloseoutControl orderId={order.id} step={steps.find(step => step.key === "service")!} />
          </>}
        </div>
      </WorkflowSelectionProvider>
    </DeliveryPartnersProvider>
  );

  return (
    <DeliveryPartnersProvider partners={await getDeliveryPartners()}>
    <WorkflowSelectionProvider orderId={order.id} revision={JSON.stringify([order.updatedAt, order.payments, steps])} stepKeys={steps.map(step => step.key)} initialKey={readWorkflowStep(query.step) ?? ball.step ?? "delivery"}>
    <div className="pipeline-detail space-y-8">
      <DetailHeader backHref={backHref} backLabel={backHref === "/pipeline" ? "Back to Pipeline" : "Back to Orders"} title={order.title}
        subtitle={<>{order.company ? <Link href={`/companies/${order.company.id}`}>{order.company.name}</Link> : "No linked business"}{order.contact && <> · {order.contact.firstName} {order.contact.lastName ?? ""}</>}</>}
        badges={<><span className="badge badge-gray capitalize">{order.orderType}</span><BallInCourtBadge ball={ball}/></>}
        action={primaryAction} secondary={canEditIntake && !order.opportunityId && isOpen && !order.payments.length && !order.purchaseOrders.length && !order.deliveries.length && !order._count.serviceIssues ? <DeleteIntakeButton id={order.id} kind="order" name={order.title} /> : undefined}/>
      <RecordWorkspace navigation={<DealProgress steps={steps} lost={false} />} summary={<div className="space-y-5"><TeamNotes notes={order.notes} intakeNotes={order.opportunity?.notes} /><section className="card"><h2 className="section-label">Order details</h2><dl className="record-summary">
        <div><dt>Status</dt><dd>{order.status.replaceAll("_", " ")}</dd></div>
        <div><dt>Owner</dt><dd>{order.owner?.name ?? "Unassigned"}</dd></div>
        <div><dt>Business</dt><dd>{order.company?.name ?? "No linked business"}</dd></div>
        <div><dt>Agreed total</dt><dd>{order.orderValue == null ? "Not set" : `$${Number(order.orderValue).toLocaleString("en-US")}`}</dd></div>
        <div><dt>Needed by</dt><dd>{fmtDate(order.neededByDate) ?? "Not set"}</dd></div>
        <div><dt>Delivery address</dt><dd>{order.deliveryAddress ?? "Not set"}</dd></div>
        <div><dt>Delivery type</dt><dd>{order.deliveryType === "inside" ? "Inside" : order.deliveryType === "curbside" ? "Curbside" : "Not specified"}</dd></div>
        <div><dt>Installation needed</dt><dd>{order.installationNeeded ? "Yes" : "No"}</dd></div>
        <div><dt>Floor note</dt><dd>{order.floorNote ?? "Not specified"}</dd></div>
        {order.deliveryType === "inside" && <div><dt>Opening size</dt><dd>{order.openingSize ?? "Not specified"}</dd></div>}
        <div><dt>Terms</dt><dd>{termsSummary ?? "Not set"}</dd></div>
      </dl></section></div>}>
      <WorkflowPanel when={["clientQuote"]}>
        <section id="client-quote" className="card space-y-3">
          <h2 className="section-label">Client Quote</h2>
          <p className="text-sm text-gray-dark">{order.opportunity?.clientQuoteSent ? "The client quote was recorded before confirming this deal." : "This order was already confirmed before the client quote step was introduced, or was created directly."}</p>
          {order.opportunity?.clientQuoteUrl && <a href={order.opportunity.clientQuoteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Open client quote</a>}

        </section>
      </WorkflowPanel>
      <WorkflowPanel when={["close"]}><section id="confirmed-deal" className="card space-y-3"><h2 className="section-label">Confirm Deal</h2><p>The deal is confirmed. Its agreed total is {order.orderValue == null ? "not set" : `$${Number(order.orderValue).toLocaleString("en-US")}`}.</p><p className="text-sm text-gray-dark">Payment, terms and fulfillment are managed in this workspace.</p></section></WorkflowPanel>
      <WorkflowPanel when={["pricing"]}>
        <PricingItems items={order.lineItems} editable={isOpen} deletable={canEditIntake && !order.opportunityId && isOpen && !order.payments.length && !order.purchaseOrders.length && !order.deliveries.length} />
      </WorkflowPanel>
      <WorkflowPanel when={["deposit", "pos", "delivery", "service", "files"]}>
      <div className="card">
        <OrderTabs showTabs={false}
          defaultTab={defaultTab}
          invoice={
            <PaymentsSection
              orderId={order.id}
              payments={order.payments}
              gate={gate}
              terms={{ termsNotes: order.termsNotes, paymentTerms: order.paymentTerms, orderValue: order.orderValue }}
            />
          }
          purchaseOrders={
            <Suspense fallback={<SectionLoading name="purchase orders" />}>
              <OrderPurchasing orderId={order.id} data={supporting}
                purchaseOrderIds={order.purchaseOrders.map(po => po.id)}
                unassignedLineItems={unassignedLineItems} gate={gate} salesOrderSentAt={order.salesOrderSentAt} />
            </Suspense>
          }
          delivery={
            <Suspense fallback={<SectionLoading name="deliveries" />}>
              <OrderDelivery orderId={order.id} data={supporting} destination={deliveryDestinationOptions(order)} />
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
        {intakeEditor}
        {order.opportunityId && <IntakeEditor projectOnly params={Promise.resolve({ id: order.opportunityId })} searchParams={Promise.resolve({})} />}
        </WorkflowPanel>
      </div>


      </RecordWorkspace>
      <Suspense fallback={<SectionLoading name="order activity" />}><ActivityHistory linkedType="order" linkedId={order.id} title="Order activity" entries={activity} collapsible /></Suspense>
    </div>
    </WorkflowSelectionProvider>
    </DeliveryPartnersProvider>
  );
}
