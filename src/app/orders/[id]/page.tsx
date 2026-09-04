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
import type { IssueRowData } from "../../service/IssueRow";
import { FlowStepper } from "@/lib/FlowStepper";
import { BackLink } from "@/lib/BackLink";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { fullFlowSteps, orderBall } from "@/lib/ballInCourt";
import { evaluatePaymentGate, canCompleteOrder, ORDER_BALL_INCLUDE, orderBallInput } from "@/lib/flow";
import { PAYMENT_TERMS, PAYMENT_TERM_COLORS, labelFor } from "@/lib/constants";
import { uploadsConfigured } from "@/lib/storage";
import { ActionButton } from "@/lib/ui";
import { acknowledgeAllSentPos, markOrderComplete } from "../actions";
import { fmtDate } from "../utils";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, vendors, users] = await Promise.all([
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
            // Read-only on this tab: the PO's leg powers the shipped dialog.
            deliveries: {
              select: {
                id: true,
                mode: true,
                status: true,
                trackingCarrier: true,
                trackingUrl: true,
                expectedDelivery: true,
                trucker: true,
                scheduledDeliveryDate: true,
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
  ]);

  if (!order) notFound();

  // The Service tab's rows (same shape /service builds) and the Files tab's
  // documents - this order's own plus the deal's, since drawings and quotes
  // arrive during sales and nobody should have to go hunting for them.
  const [issues, documents] = await Promise.all([
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
  ]);

  const gate = evaluatePaymentGate(order);
  // One source of truth for "what happens next" - the header stepper, the badge,
  // the primary action and the opening tab all read this (see @/lib/ballInCourt).
  const ball = orderBall(orderBallInput(order));

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
  } else if (isOpen && !order.paymentTerms) {
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
    primaryAction = (
      <ActionButton action={acknowledgeAllSentPos.bind(null, order.id)} className="btn btn-primary active:scale-[0.99]">
        Mark acknowledged
      </ActionButton>
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
            <div className="field-label">Job ID</div>
            <div className="text-ink">{order.jobId || <span className="empty-value">not set</span>}</div>
          </div>
          <div>
            <div className="field-label">Client PO #</div>
            <div className="text-ink">
              {order.clientPoNumber || <span className="empty-value">not set</span>}
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
            <div className="field-label">Location</div>
            <div className="text-ink">
              <OrderLocationField
                orderId={order.id}
                locationId={order.locationId}
                locations={order.company?.locations ?? []}
              />
              {location?.address ? (
                <div className="mt-0.5 text-[12.5px] text-gray-dark">{location.address}</div>
              ) : null}
            </div>
          </div>
          <div>
            <div className="field-label">Terms</div>
            <div className="text-ink">
              {order.paymentTerms ? (
                <span className={`badge ${PAYMENT_TERM_COLORS[order.paymentTerms] ?? "badge-gray"}`}>
                  {labelFor(PAYMENT_TERMS, order.paymentTerms)}
                </span>
              ) : (
                <span className="empty-value">not set</span>
              )}
            </div>
          </div>
          <div>
            <div className="field-label">Needed By</div>
            <div className="text-ink">
              {order.neededByDate ? (
                // Deterministic UTC formatting (see @/lib/dates): this was the
                // last locale/timezone-dependent date on the page, so it could
                // read a day earlier than the orders list for the same record.
                fmtDate(order.neededByDate)
              ) : (
                <span className="empty-value">not set</span>
              )}
            </div>
          </div>
          <div className="col-span-2 md:col-span-3">
            <div className="field-label">Delivery Address</div>
            <div className="text-ink">
              {order.deliveryAddress || <span className="empty-value">not set</span>}
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
              orderValue={order.orderValue}
              depositPercent={order.company?.depositPercent ?? 30}
              terms={{
                paymentTerms: order.paymentTerms,
                termsNotes: order.termsNotes,
                depositRequired: order.depositRequired,
              }}
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
    </div>
  );
}
