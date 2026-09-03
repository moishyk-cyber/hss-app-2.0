// The flow engine: payment-gate evaluation and derived order status.
// This is the ONLY place gate/status rules live - actions and pages must call
// these instead of re-deriving (the old bug class: two truths that drift).

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { roundCents } from "@/lib/money";

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

type FlowLineItem = { rfqStatus: string; deliveryStatus: string };
type FlowPo = { status: string; deliveryStatus: string };

export type FlowOrder = GateOrder & {
  status: string;
  lineItems: FlowLineItem[];
  purchaseOrders: FlowPo[];
};

/** Statuses a person sets explicitly; recompute never overwrites them. */
const MANUAL_STATUSES = new Set(["stuck", "complete"]);

export function deriveOrderStatus(order: FlowOrder): string {
  const gate = evaluatePaymentGate(order);
  const items = order.lineItems.filter((i) => i.rfqStatus !== "removed");
  const pos = order.purchaseOrders;

  const allItemsArrived =
    items.length > 0 && items.every((i) => i.deliveryStatus === "arrived_complete");
  const allPosDone =
    pos.length > 0 &&
    pos.every((p) => p.status === "received" || p.deliveryStatus === "delivered_full");

  if (allItemsArrived || (items.length === 0 && allPosDone)) return "delivered";
  if (pos.some((p) => p.deliveryStatus === "scheduled")) return "delivery_scheduled";
  if (
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
 * Mark-complete guard: payment gate open, every PO landed, every active item
 * arrived (vacuously true when an order legitimately has no POs or no items).
 */
export function canCompleteOrder(order: FlowOrder): boolean {
  const gate = evaluatePaymentGate(order);
  const items = order.lineItems.filter((i) => i.rfqStatus !== "removed");
  const posDone = order.purchaseOrders.every(
    (p) => p.status === "received" || p.deliveryStatus === "delivered_full"
  );
  const itemsDone = items.every((i) => i.deliveryStatus === "arrived_complete");
  return gate.open && posDone && itemsDone;
}

export const FLOW_ORDER_INCLUDE = {
  payments: true,
  purchaseOrders: true,
  lineItems: true,
  company: { select: { requiresDeposit: true, depositPercent: true } },
} as const;

/**
 * Re-derive and persist Order.status from payments/POs/items. Call after any
 * mutation that changes those facts. Leaves "stuck" and "complete" alone.
 * Never throws - status sync must not fail the mutation that triggered it.
 */
export async function recomputeOrderStatus(orderId: string): Promise<string | null> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: FLOW_ORDER_INCLUDE,
    });
    if (!order) return null;
    if (MANUAL_STATUSES.has(order.status)) return order.status;

    const derived = deriveOrderStatus(order);
    if (derived !== order.status) {
      await prisma.order.update({ where: { id: orderId }, data: { status: derived } });
    }
    return derived;
  } catch (err) {
    console.error("recomputeOrderStatus failed", err);
    return null;
  }
}

/**
 * Keep Order.orderValue honest after a line-item price change (Sep 3 QA #4: an
 * order read $11,194 while its items summed to far more). orderValue is
 * snapshotted from the Close panel at win time and nothing ever recomputed it,
 * so any post-win pricing edit drifted the displayed total - and, because the
 * payment gate's requiredTotal is derived from it, a too-low total asks the
 * customer for too little. Recompute-on-write, mirroring rfq/actions.ts's
 * syncOpportunityPricing for the pre-win side: only once EVERY live item
 * carries a price (a partial sum would understate the total and loosen the
 * gate), then re-derive status since the gate may have moved. Call after any
 * mutation of a line item's unitPrice/qty/rfqStatus on an order.
 * Never throws - a sync hiccup must not fail the pricing save that caused it.
 */
export async function syncOrderValueFromLineItems(orderId: string): Promise<number | null> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderValue: true,
        lineItems: { select: { qty: true, unitPrice: true, rfqStatus: true } },
      },
    });
    if (!order) return null;
    const live = order.lineItems.filter((li) => li.rfqStatus !== "removed");
    if (live.length === 0 || live.some((li) => li.unitPrice == null || li.unitPrice <= 0)) {
      return order.orderValue;
    }
    const total = roundCents(live.reduce((sum, li) => sum + (li.unitPrice ?? 0) * li.qty, 0));
    if (order.orderValue != null && Math.abs(order.orderValue - total) < 0.005) return order.orderValue;

    await prisma.order.update({ where: { id: orderId }, data: { orderValue: total } });
    await logActivity(
      "order",
      orderId,
      "order_value_synced",
      `Order value updated from $${order.orderValue ?? 0} to $${total} to match priced line items`
    );
    await recomputeOrderStatus(orderId);
    return total;
  } catch (err) {
    console.error("syncOrderValueFromLineItems failed", err);
    return null;
  }
}
