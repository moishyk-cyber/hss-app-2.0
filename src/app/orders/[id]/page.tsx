import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "../utils";
import { UrgencyStatusControls, QbInvoiceEdit } from "./OrderHeaderControls";
import PaymentsSection from "./PaymentsSection";
import LineItemsSection from "./LineItemsSection";
import PurchaseOrdersSection from "./PurchaseOrdersSection";
import { FlowStepper, type FlowStep } from "@/lib/flow";
import { ActionButton } from "@/lib/ui";
import { acknowledgeAllSentPos, setOrderStatus } from "../actions";

export const dynamic = "force-dynamic";

const PHASE_ORDER = ["payment", "pos", "in_transit", "delivery", "complete"] as const;
type Phase = (typeof PHASE_ORDER)[number];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, vendors] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        contact: true,
        owner: true,
        payments: true,
        lineItems: { orderBy: { createdAt: "asc" } },
        purchaseOrders: {
          include: {
            supplier: { select: { name: true } },
            lineItems: { select: { id: true, name: true, qty: true } },
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
  ]);

  if (!order) notFound();

  const hasPaidPayment = order.payments.some((p) => p.status === "paid");

  const unassignedLineItems = order.lineItems
    .filter((li) => !li.purchaseOrderId && li.rfqStatus !== "removed")
    .map((li) => ({ id: li.id, name: li.name, qty: li.qty }));

  const activeLineItems = order.lineItems.filter((li) => li.rfqStatus !== "removed");
  const allPosReceived = order.purchaseOrders.length > 0 && order.purchaseOrders.every((po) => po.status === "received");
  const allItemsArrived = activeLineItems.length > 0 && activeLineItems.every((li) => li.deliveryStatus === "arrived_complete");

  // ---- Flow phase derivation (docs/UX_FLOW.md §3B/§3G) ----
  const poStatuses = order.purchaseOrders.map((po) => po.status);
  const hasAnyPo = poStatuses.length > 0;
  const anyDraft = poStatuses.includes("draft");
  const anySent = poStatuses.includes("sent");

  let phase: Phase;
  if (!hasPaidPayment) phase = "payment";
  else if (order.status === "complete") phase = "complete";
  else if (unassignedLineItems.length > 0 || anyDraft || anySent) phase = "pos";
  else if (hasAnyPo && !allPosReceived) phase = "in_transit";
  else phase = "delivery";

  const phaseIdx = PHASE_ORDER.indexOf(phase);

  const steps: FlowStep[] = [
    {
      label: "Payment",
      state: phase === "payment" ? "blocked" : "done",
      hint: phase === "payment" ? "Record deposit/full payment" : undefined,
    },
    {
      label: "POs",
      state: phaseIdx < 1 ? "upcoming" : phaseIdx === 1 ? "current" : "done",
      hint:
        phaseIdx === 1
          ? unassignedLineItems.length > 0
            ? `Create PO${unassignedLineItems.length > 1 ? "s" : ""} for ${unassignedLineItems.length} item${unassignedLineItems.length > 1 ? "s" : ""}`
            : anyDraft
            ? "Send draft POs"
            : "Awaiting supplier acknowledgment"
          : undefined,
    },
    {
      label: "In Transit",
      state: phaseIdx < 2 ? "upcoming" : phaseIdx === 2 ? "current" : "done",
      hint: phaseIdx === 2 ? "Track shipments to delivery" : undefined,
    },
    {
      label: "Delivery",
      state: phaseIdx < 3 ? "upcoming" : phaseIdx === 3 ? "current" : "done",
      hint: phaseIdx === 3 ? "Confirm delivery-day check" : undefined,
    },
    { label: "Complete", state: phase === "complete" ? "done" : "upcoming" },
  ];

  // ---- Header pattern (spec §H): ONE contextual primary action ----
  let primaryAction: React.ReactNode = null;
  if (!hasPaidPayment) {
    primaryAction = (
      <a href="#payments" className="btn btn-primary active:scale-[0.99]">
        Record payment
      </a>
    );
  } else if (unassignedLineItems.length > 0) {
    primaryAction = (
      <a href="#purchase-orders" className="btn btn-primary active:scale-[0.99]">
        Create POs
      </a>
    );
  } else if (anySent) {
    primaryAction = (
      <ActionButton action={acknowledgeAllSentPos.bind(null, order.id)} className="btn btn-primary active:scale-[0.99]">
        Mark acknowledged
      </ActionButton>
    );
  } else if (allPosReceived && allItemsArrived && order.status !== "complete") {
    primaryAction = (
      <ActionButton
        action={setOrderStatus.bind(null, order.id, "complete")}
        className="btn btn-primary active:scale-[0.99]"
      >
        Mark complete
      </ActionButton>
    );
  }

  // ---- Sections in flow order (spec §G); current phase's section gets an accent border ----
  const accentTarget: "payments" | "lineItems" | "purchaseOrders" | null =
    phase === "payment"
      ? "payments"
      : phase === "pos" || phase === "in_transit"
      ? "purchaseOrders"
      : phase === "delivery"
      ? "lineItems"
      : null;

  function sectionClass(name: typeof accentTarget) {
    return accentTarget === name ? "card border-l-4 p-4" : "card p-4";
  }
  function sectionStyle(name: typeof accentTarget) {
    return accentTarget === name ? { borderLeftColor: "var(--accent)" } : undefined;
  }

  const paymentsSection = (
    <section key="payments" id="payments" className={sectionClass("payments")} style={sectionStyle("payments")}>
      <h2 className="section-label mb-3">Payments</h2>
      <PaymentsSection orderId={order.id} payments={order.payments} />
    </section>
  );
  const lineItemsSection = (
    <section key="line-items" className={sectionClass("lineItems")} style={sectionStyle("lineItems")}>
      <h2 className="section-label mb-3">Line Items</h2>
      <LineItemsSection items={order.lineItems} />
    </section>
  );
  const purchaseOrdersSection = (
    <section
      key="purchase-orders"
      id="purchase-orders"
      className={sectionClass("purchaseOrders")}
      style={sectionStyle("purchaseOrders")}
    >
      <h2 className="section-label mb-3">Purchase Orders</h2>
      <PurchaseOrdersSection
        orderId={order.id}
        purchaseOrders={order.purchaseOrders}
        unassignedLineItems={unassignedLineItems}
        vendors={vendors}
        hasPaidPayment={hasPaidPayment}
      />
    </section>
  );

  // Payment section leads while unpaid (it's blocking); otherwise it moves to the back as a reference section.
  const orderedSections =
    phase === "payment"
      ? [paymentsSection, lineItemsSection, purchaseOrdersSection]
      : [lineItemsSection, purchaseOrdersSection, paymentsSection];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-xs text-blue transition-colors hover:underline">
          ← Back to Orders
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{order.title}</h1>
            <div className="mt-1 text-sm text-gray-dark">
              {order.company ? (
                <Link href={`/companies/${order.company.id}`} className="text-blue transition-colors hover:underline">
                  {order.company.name}
                </Link>
              ) : (
                "—"
              )}
              {order.contact && <span> · {order.contact.firstName} {order.contact.lastName ?? ""}</span>}
              {order.owner && <span> · Owner: {order.owner.name}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="badge badge-gray capitalize">{order.orderType}</span>
            </div>
          </div>
          {primaryAction}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <FlowStepper steps={steps} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <UrgencyStatusControls orderId={order.id} urgency={order.urgency} status={order.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm md:grid-cols-4">
          <div>
            <div className="field-label">Job ID</div>
            <div className="text-ink">{order.jobId ?? "—"}</div>
          </div>
          <div>
            <div className="field-label">Client PO #</div>
            <div className="text-ink">{order.clientPoNumber ?? "—"}</div>
          </div>
          <div>
            <div className="field-label">QuickBooks Invoice #</div>
            <QbInvoiceEdit orderId={order.id} value={order.quickbooksInvoiceNo} />
          </div>
          <div>
            <div className="field-label">Needed By</div>
            <div className="text-ink">{fmtDate(order.neededByDate)}</div>
          </div>
          <div className="col-span-2 md:col-span-4">
            <div className="field-label">Delivery Address</div>
            <div className="text-ink">{order.deliveryAddress ?? "—"}</div>
          </div>
        </div>
      </div>

      {orderedSections}
    </div>
  );
}
