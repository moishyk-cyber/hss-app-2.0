import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusOwnerControls } from "./OrderHeaderControls";
import PaymentsSection from "./PaymentsSection";
import PurchaseOrdersSection from "./PurchaseOrdersSection";
import DeliverySection from "./DeliverySection";
import FilesSection, { type FileDocData } from "./FilesSection";
import ItemStatusChips from "./ItemStatusChips";
import { OverviewStrip } from "./OverviewStrip";
import OrderIssuesPanel from "./OrderIssuesPanel";
import { OrderTabs, type TabKey } from "./OrderTabs";
import { OrderLocationField } from "./OrderLocationField";
import { EditableCompanyField, EditableContactField } from "./OrderPartyFields";
import type { IssueRowData } from "../../service/IssueRow";
import { FlowStepper } from "@/lib/FlowStepper";
import { BackLink } from "@/lib/BackLink";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { fullFlowSteps, hasOrderTerms, orderBall } from "@/lib/ballInCourt";
import { getStageHolders, withHolder } from "@/lib/courtHolders";
import { ActivityHistory } from "@/lib/ActivityHistory";
import { evaluatePaymentGate, canCompleteOrder, ORDER_BALL_INCLUDE, orderBallInput } from "@/lib/flow";
import { uploadsConfigured } from "@/lib/storage";
import { ActionButton, InlineEditField } from "@/lib/ui";
import {
  markOrderComplete,
  setOrderClientPoNumber,
  setOrderDeliveryAddress,
  setOrderJobId,
  setOrderNeededByDate,
} from "../actions";
import { fmtDate } from "../utils";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, vendors, users, companies, contacts] = await Promise.all([
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
        // Delivery legs drive the Delivery tab, and the status/complete rules
        // read them too (see @/lib/flowRules).
        deliveries: {
          include: {
            lineItems: {
              select: { id: true, name: true, qty: true, deliveryStatus: true },
              orderBy: { createdAt: "asc" },
            },
            purchaseOrder: {
              select: {
                id: true,
                poNumber: true,
                supplier: { select: { name: true, deliveryAddress: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        lineItems: {
          include: {
            assignee: { select: { id: true, name: true } },
            // Both feed the item-status drill-down: which PO an item sits on,
            // and which delivery leg is carrying it.
            purchaseOrder: { select: { id: true, poNumber: true } },
            delivery: { select: { id: true, mode: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        purchaseOrders: {
          include: {
            supplier: { select: { name: true, deliveryAddress: true } },
            lineItems: { select: { id: true, name: true, qty: true } },
            // The PO's delivery: read-only on this tab, except through the
            // acknowledge dialog that creates (or re-edits) it.
            deliveries: {
              select: {
                id: true,
                mode: true,
                status: true,
                trackingCarrier: true,
                trackingUrl: true,
                expectedDelivery: true,
                trucker: true,
                pickupAddress: true,
                scheduledDeliveryDate: true,
                shipCost: true,
                chargedToCustomer: true,
                deliveryContactPhone: true,
                notes: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.company.findMany({
      where: { type: { in: ["supplier", "vendor"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // For the Business/Contact/Location pencil-edit fields: loaded whole and
    // filtered/searched client-side, same approach as the intake form.
    prisma.company.findMany({
      where: { type: { in: ["customer", "lead"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contact.findMany({
      select: { id: true, firstName: true, lastName: true, companyId: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);

  if (!order) notFound();

  // Document is polymorphic (no Prisma relation to PurchaseOrder), so its POs'
  // attached AutoQuotes PDFs are a separate lookup by linkedId, grouped below.
  const poIds = order.purchaseOrders.map((po) => po.id);

  // The Service tab's rows (same shape /service builds) and the Files tab's
  // documents - this order's own plus the deal's, since drawings and quotes
  // arrive during sales and nobody should have to go hunting for them.
  const [issues, documents, poDocuments] = await Promise.all([
    prisma.serviceIssue.findMany({
      where: { orderId: order.id },
      include: {
        company: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        order: { select: { id: true, title: true } },
        lineItem: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { reportedAt: "desc" },
    }),
    prisma.document.findMany({
      where: {
        OR: [
          { linkedType: "order", linkedId: order.id },
          ...(order.opportunityId
            ? [{ linkedType: "opportunity", linkedId: order.opportunityId }]
            : []),
        ],
      },
      orderBy: { uploadedAt: "desc" },
    }),
    poIds.length > 0
      ? prisma.document.findMany({
          where: { linkedType: "purchase_order", linkedId: { in: poIds } },
          orderBy: { uploadedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const gate = evaluatePaymentGate(order);
  // One source of truth for "what happens next" - the header stepper, the badge,
  // the primary action and the opening tab all read this (see @/lib/ballInCourt).
  const ball = withHolder(orderBall(orderBallInput(order)), await getStageHolders());

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

  // The nine-step journey (sales through customer service), replacing the order
  // module's own five-step read of the same facts. Sales-side steps link back to
  // the deal, order-side steps open the matching tab.
  const steps = fullFlowSteps(ball.step, {
    dealHref: order.opportunityId ? `/pipeline/${order.opportunityId}` : undefined,
    orderHref: `/orders/${order.id}`,
    hint: ball.hint,
  });

  // ---- Header pattern (spec §H): ONE contextual primary action ----
  // Ordered like the ball itself: quote, then terms, then the money, then the
  // POs, then completion.
  const isOpen = order.status !== "complete";
  let primaryAction: React.ReactNode = null;
  if (isOpen && order.quoteStatus === "needed") {
    primaryAction = (
      <a href="#invoice" className="btn btn-primary active:scale-[0.99]">
        Set quote status
      </a>
    );
  } else if (isOpen && !hasOrderTerms(order)) {
    primaryAction = (
      <a href="#invoice" className="btn btn-primary active:scale-[0.99]">
        Set terms
      </a>
    );
  } else if (isOpen && !gate.open) {
    primaryAction = (
      <a href="#invoice" className="btn btn-primary active:scale-[0.99]">
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
  } else if (isOpen && canCompleteOrder(order)) {
    // canCompleteOrder is vacuously true when there are no POs at all (a direct
    // intake order with no purchasing leg) - don't gate this on purchaseOrders.length.
    primaryAction = (
      <ActionButton action={markOrderComplete.bind(null, order.id)} className="btn btn-primary active:scale-[0.99]">
        Mark complete
      </ActionButton>
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

  const issueRows: IssueRowData[] = issues.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    reportedAt: r.reportedAt,
    resolvedAt: r.resolvedAt,
    resolution: r.resolution,
    assigneeId: r.assigneeId,
    assigneeName: r.assignee?.name ?? null,
    company: r.company,
    location: r.location,
    order: r.order,
    lineItem: r.lineItem,
  }));

  const toDoc = (d: (typeof documents)[number]): FileDocData => ({
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
  });
  const orderDocs = documents.filter((d) => d.linkedType === "order").map(toDoc);
  const dealDocs = documents.filter((d) => d.linkedType === "opportunity").map(toDoc);
  const documentsByPoId: Record<string, FileDocData[]> = {};
  for (const d of poDocuments) {
    (documentsByPoId[d.linkedId] ??= []).push(toDoc(d));
  }

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/orders" label="Back to Orders" />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{order.title}</h1>
            <div className="mt-1 text-sm text-gray-dark">
              {order.company ? (
                <Link href={`/companies/${order.company.id}`} className="text-blue transition-colors hover:underline">
                  {order.company.name}
                </Link>
              ) : (
                <span className="empty-value">no company</span>
              )}
              {order.contact && <span> · {order.contact.firstName} {order.contact.lastName ?? ""}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="badge badge-gray capitalize">{order.orderType}</span>
              <BallInCourtBadge ball={ball} />
            </div>
          </div>
          {primaryAction}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <FlowStepper steps={steps} />
        </div>

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

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <StatusOwnerControls
            orderId={order.id}
            status={order.status}
            ownerId={order.ownerId}
            users={users}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm md:grid-cols-3">
          <div>
            <div className="field-label">Business</div>
            <div className="text-ink">
              <EditableCompanyField
                orderId={order.id}
                companyId={order.companyId}
                companyName={order.company?.name ?? null}
                companies={companies}
              />
            </div>
          </div>
          <div>
            <div className="field-label">Contact</div>
            <div className="text-ink">
              <EditableContactField
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
                contacts={contacts}
              />
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
      </div>

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
            <PurchaseOrdersSection
              orderId={order.id}
              purchaseOrders={order.purchaseOrders}
              unassignedLineItems={unassignedLineItems}
              vendors={vendors}
              gate={gate}
              documentsByPoId={documentsByPoId}
              uploadsEnabled={uploadsConfigured()}
            />
          }
          delivery={
            <DeliverySection
              orderId={order.id}
              items={order.lineItems}
              users={users}
              deliveries={order.deliveries}
            />
          }
          files={
            <FilesSection
              linkedType="order"
              linkedId={order.id}
              docs={orderDocs}
              ownLabel="On this order"
              inheritedDocs={dealDocs}
              inheritedLabel="From the deal"
              uploadsEnabled={uploadsConfigured()}
            />
          }
          service={
            <OrderIssuesPanel
              orderId={order.id}
              companyId={order.companyId}
              locationId={order.locationId}
              issues={issueRows}
              users={users}
              items={order.lineItems
                .filter((li) => li.rfqStatus !== "removed")
                .map((li) => ({ id: li.id, name: li.name }))}
            />
          }
        />
      </div>

      <ActivityHistory linkedType="order" linkedId={order.id} title="Order activity" />
    </div>
  );
}
