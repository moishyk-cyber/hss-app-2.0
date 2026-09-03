// The pure half of the flow engine: payment-gate evaluation and derived order
// status. Nothing here touches the database, so client components and the pure
// ball-in-court module (@/lib/ballInCourt) can import it without dragging
// prisma into a browser bundle. @/lib/flow re-exports everything below and adds
// the persistence helpers (recomputeOrderStatus, ...) - import from @/lib/flow
// unless you specifically need a client-safe module.
//
// This is the ONLY place gate/status rules live - actions and pages must call
// these instead of re-deriving (the old bug class: two truths that drift).

// ---------------------------------------------------------------------------
// Payment gate
// ---------------------------------------------------------------------------

type GatePayment = { status: string; amount: number };
type GateCompany = { requiresDeposit: boolean; depositPercent: number } | null;

export type GateOrder = {
  orderType: string;
  orderValue: number | null;
  /** Agreed gate amount from the close dialog; overrides the company-percent formula. */
  depositRequired?: number | null;
  payments: GatePayment[];
  company: GateCompany;
};

export type PaymentGate = {
  open: boolean;
  /** True for no-deposit accounts (projects billed after delivery). */
  exempt: boolean;
  paidTotal: number;
  /** Dollars needed to open the gate; null when the order has no value to measure against. */
  requiredTotal: number | null;
  shortfall: number;
  /**
   * True once at least one invoice/payment row exists on the order. Lets the UI
   * tell "invoiced but unpaid" apart from "never invoiced" (Sep 3 QA #6: both
   * used to read as Awaiting Payment / $0). Presentation only - it never
   * affects `open`.
   */
  invoiced: boolean;
  /** UI-ready explanation of the gate state. */
  reason: string;
};

/** Rounding tolerance so a $299.99 payment opens a $300 gate. */
const GATE_TOLERANCE = 1;

export function evaluatePaymentGate(order: GateOrder): PaymentGate {
  const paidTotal = order.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const invoiced = order.payments.length > 0;
  const isProject = order.orderType === "project";
  const requiresDeposit = order.company?.requiresDeposit ?? true;
  const depositPercent = order.company?.depositPercent ?? 30;

  // Trusted accounts: projects billed after delivery skip the gate entirely.
  // (Mirrors markOpportunityWon, which stages no payment for these accounts.)
  if (isProject && !requiresDeposit) {
    return {
      open: true,
      exempt: true,
      paidTotal,
      requiredTotal: null,
      shortfall: 0,
      invoiced,
      reason: "No deposit required for this account - full payment collected after delivery",
    };
  }

  const value = order.orderValue ?? 0;
  const agreed = order.depositRequired ?? null;
  if (value <= 0 && agreed == null) {
    // Nothing to measure sufficiency against - fall back to "any paid payment".
    // With no payment rows at all there is nothing to chase yet - say so,
    // rather than reading exactly like an invoice that is sitting unpaid.
    const open = paidTotal > 0;
    return {
      open,
      exempt: false,
      paidTotal,
      requiredTotal: null,
      shortfall: 0,
      invoiced,
      reason: open
        ? "Payment received"
        : !invoiced
          ? isProject
            ? "Nothing invoiced yet - add a deposit invoice and collect it before POs are sent"
            : "Nothing invoiced yet - add an invoice and collect full payment before POs are sent"
          : isProject
            ? "Deposit required before POs are sent"
            : "Full payment required before POs are sent",
    };
  }

  // The close dialog's agreed deposit wins; otherwise the company-percent formula.
  const requiredTotal =
    agreed != null
      ? Math.round(agreed)
      : isProject
        ? Math.round((value * depositPercent) / 100)
        : Math.round(value);
  const shortfall = Math.max(0, requiredTotal - paidTotal);
  const open = shortfall <= GATE_TOLERANCE;
  return {
    open,
    exempt: false,
    paidTotal,
    requiredTotal,
    shortfall: open ? 0 : shortfall,
    invoiced,
    reason: open
      ? "Payment received"
      : isProject
        ? `Deposit of $${requiredTotal.toLocaleString()} required ($${shortfall.toLocaleString()} outstanding) before POs are sent`
        : `Full payment of $${requiredTotal.toLocaleString()} required ($${shortfall.toLocaleString()} outstanding) before POs are sent`,
  };
}

// ---------------------------------------------------------------------------
// Derived order status
// ---------------------------------------------------------------------------

export type FlowLineItem = { rfqStatus: string; deliveryStatus: string };
export type FlowPo = { status: string };
/** One delivery leg (see the Delivery model). status = DELIVERY_LEG_STATUSES. */
export type FlowDelivery = { status: string };

export type FlowOrder = GateOrder & {
  status: string;
  lineItems: FlowLineItem[];
  purchaseOrders: FlowPo[];
  deliveries: FlowDelivery[];
};

/** Statuses a person sets explicitly; recompute never overwrites them. */
export const MANUAL_STATUSES = new Set(["stuck", "complete"]);

/** Items that still count - "removed" rows are filtered from every rule. */
export function liveLineItems<T extends { rfqStatus: string }>(items: T[]): T[] {
  return items.filter((i) => i.rfqStatus !== "removed");
}

export function deriveOrderStatus(order: FlowOrder): string {
  const gate = evaluatePaymentGate(order);
  const items = liveLineItems(order.lineItems);
  const pos = order.purchaseOrders;
  const deliveries = order.deliveries;

  const allItemsArrived =
    items.length > 0 && items.every((i) => i.deliveryStatus === "arrived_complete");
  // With no items to go by, every delivery leg landing is the next best signal
  // (or, for orders that predate deliveries, every PO received).
  const allDeliveriesDone =
    deliveries.length > 0 && deliveries.every((d) => d.status === "delivered_full");
  const allPosReceived = pos.length > 0 && pos.every((p) => p.status === "received");

  if (allItemsArrived || (items.length === 0 && (allDeliveriesDone || allPosReceived))) {
    return "delivered";
  }
  if (deliveries.some((d) => d.status === "scheduled")) return "delivery_scheduled";
  if (
    deliveries.some((d) => d.status === "in_transit") ||
    pos.some((p) => p.status === "shipped") ||
    items.some((i) => i.deliveryStatus.startsWith("in_transit"))
  ) {
    return "in_transit";
  }
  if (pos.length > 0) return "pos_in_progress";
  if (!gate.open) return "awaiting_payment";
  if (gate.paidTotal > 0) return "payment_received";
  return "new"; // exempt account, nothing started yet
}

/**
 * Mark-complete guard: payment gate open, every delivery leg fully delivered,
 * every active item arrived, and every PO landed - a PO counts as landed when
 * it is "received" or when all of the order's deliveries are delivered_full
 * (goods reach the customer through deliveries, so a PO left at "shipped"
 * must not block completion once everything has been delivered). Vacuously
 * true when an order legitimately has no POs, deliveries or items.
 */
export function canCompleteOrder(order: FlowOrder): boolean {
  const gate = evaluatePaymentGate(order);
  const items = liveLineItems(order.lineItems);
  const deliveriesDone = order.deliveries.every((d) => d.status === "delivered_full");
  const posDone =
    order.purchaseOrders.every((p) => p.status === "received") ||
    (order.deliveries.length > 0 && deliveriesDone);
  const itemsDone = items.every((i) => i.deliveryStatus === "arrived_complete");
  return gate.open && deliveriesDone && posDone && itemsDone;
}

/** Everything deriveOrderStatus / canCompleteOrder / evaluatePaymentGate need. */
export const FLOW_ORDER_INCLUDE = {
  payments: true,
  purchaseOrders: true,
  lineItems: true,
  deliveries: true,
  company: { select: { requiresDeposit: true, depositPercent: true } },
} as const;
