import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UrgencyStatusControls } from "./OrderHeaderControls";
import PaymentsSection from "./PaymentsSection";
import PurchaseOrdersSection from "./PurchaseOrdersSection";
import DeliverySection from "./DeliverySection";
import { OrderTabs } from "./OrderTabs";
import { FlowStepper, type FlowStep } from "@/lib/FlowStepper";
import { BackLink } from "@/lib/BackLink";
import { evaluatePaymentGate, canCompleteOrder } from "@/lib/flow";
import { ActionButton } from "@/lib/ui";
import { acknowledgeAllSentPos, markOrderComplete } from "../actions";
import { fmtDate } from "../utils";

export const dynamic = "force-dynamic";

const PHASE_ORDER = ["payment", "pos", "in_transit", "delivery", "complete"] as const;
type Phase = (typeof PHASE_ORDER)[number];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, vendors, users] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, requiresDeposit: true, depositPercent: true } },
        contact: true,
        owner: true,
        payments: true,
        // Status/complete rules read delivery legs now (see @/lib/flowRules).
        deliveries: { select: { status: true } },
        lineItems: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
        purchaseOrders: {
          include: {
            supplier: { select: { name: true, deliveryAddress: true } },
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
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!order) notFound();

  const gate = evaluatePaymentGate(order);

  const unassignedLineItems = order.lineItems
    .filter((li) => !li.purchaseOrderId && li.rfqStatus !== "removed")
    .map((li) => ({ id: li.id, name: li.name, qty: li.qty }));

  const allPosReceived = order.purchaseOrders.length > 0 && order.purchaseOrders.every((po) => po.status === "received");

  // ---- Flow phase derivation (docs/UX_FLOW.md §3B/§3G) ----
  const poStatuses = order.purchaseOrders.map((po) => po.status);
  const hasAnyPo = poStatuses.length > 0;
  const anyDraft = poStatuses.includes("draft");
  const anySent = poStatuses.includes("sent");

  // "complete" must win outright - a completed order renders as Complete even if,
  // say, gate math would otherwise say "payment" (e.g. a since-refunded payment).
  let phase: Phase;
  if (order.status === "complete") phase = "complete";
  else if (!gate.open) phase = "payment";
  else if (unassignedLineItems.length > 0 || anyDraft || anySent) phase = "pos";
  else if (hasAnyPo && !allPosReceived) phase = "in_transit";
  else phase = "delivery";

  const phaseIdx = PHASE_ORDER.indexOf(phase);

  // Steps double as the tab navigator (Aug 31 feedback): clicking one jumps to
  // the matching tab's hash, same interaction language as the pipeline stepper.
  const steps: FlowStep[] = [
    {
      label: "Payment",
      state: phase === "payment" ? "blocked" : "done",
      hint: phase === "payment" ? "Record deposit/full payment" : undefined,
      href: "#invoice",
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
      href: "#purchase-orders",
    },
    {
      label: "In Transit",
      state: phaseIdx < 2 ? "upcoming" : phaseIdx === 2 ? "current" : "done",
      hint: phaseIdx === 2 ? "Track shipments to delivery" : undefined,
      href: "#delivery",
    },
    {
      label: "Delivery",
      state: phaseIdx < 3 ? "upcoming" : phaseIdx === 3 ? "current" : "done",
      hint: phaseIdx === 3 ? "Confirm delivery-day check" : undefined,
      href: "#delivery",
    },
    { label: "Complete", state: phase === "complete" ? "done" : "upcoming" },
  ];

  // ---- Header pattern (spec §H): ONE contextual primary action ----
  let primaryAction: React.ReactNode = null;
  if (order.status !== "complete" && !gate.open) {
    primaryAction = (
      <a href="#invoice" className="btn btn-primary active:scale-[0.99]">
        Record payment
      </a>
    );
  } else if (order.status !== "complete" && unassignedLineItems.length > 0) {
    primaryAction = (
      <a href="#purchase-orders" className="btn btn-primary active:scale-[0.99]">
        Create POs
      </a>
    );
  } else if (order.status !== "complete" && anySent) {
    primaryAction = (
      <ActionButton action={acknowledgeAllSentPos.bind(null, order.id)} className="btn btn-primary active:scale-[0.99]">
        Mark acknowledged
      </ActionButton>
    );
  } else if (order.status !== "complete" && canCompleteOrder(order)) {
    // canCompleteOrder is vacuously true when there are no POs at all (a direct
    // intake order with no purchasing leg) - don't gate this on purchaseOrders.length.
    primaryAction = (
      <ActionButton action={markOrderComplete.bind(null, order.id)} className="btn btn-primary active:scale-[0.99]">
        Mark complete
      </ActionButton>
    );
  }

  // Tabs replace the old stacked sections (Aug 31 feedback: "create tabs...
  // Invoice tab, PO tab, delivery tab"). Default tab follows the derived phase.
  const defaultTab: "invoice" | "purchase-orders" | "delivery" =
    phase === "payment" ? "invoice" : phase === "pos" ? "purchase-orders" : "delivery";

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
          <UrgencyStatusControls
            orderId={order.id}
            urgency={order.urgency}
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
            <PaymentsSection orderId={order.id} payments={order.payments} gate={gate} />
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
              purchaseOrders={order.purchaseOrders}
            />
          }
        />
      </div>
    </div>
  );
}
