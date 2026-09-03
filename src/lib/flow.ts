// The flow engine: payment-gate evaluation and derived order status.
// This is the ONLY place gate/status rules live - actions and pages must call
// these instead of re-deriving (the old bug class: two truths that drift).
//
// The rules themselves are in @/lib/flowRules (pure, no prisma) so client
// components and @/lib/ballInCourt can share them; this module re-exports them
// and adds the helpers that read/write the database.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { roundCents } from "@/lib/money";
import { OPEN_SERVICE_ISSUE_STATUSES } from "@/lib/constants";
import { deriveOrderStatus, FLOW_ORDER_INCLUDE, MANUAL_STATUSES } from "@/lib/flowRules";
import type { OrderBallInput } from "@/lib/ballInCourt";

export {
  evaluatePaymentGate,
  deriveOrderStatus,
  canCompleteOrder,
  liveLineItems,
  FLOW_ORDER_INCLUDE,
  MANUAL_STATUSES,
} from "@/lib/flowRules";
export type {
  GateOrder,
  PaymentGate,
  FlowOrder,
  FlowLineItem,
  FlowPo,
  FlowDelivery,
} from "@/lib/flowRules";

/**
 * Re-derive and persist Order.status from payments/POs/deliveries/items. Call
 * after any mutation that changes those facts. Leaves "stuck" and "complete"
 * alone. Never throws - status sync must not fail the mutation that triggered it.
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

// ---------------------------------------------------------------------------
// Ball-in-court convenience for pages
// ---------------------------------------------------------------------------

/**
 * FLOW_ORDER_INCLUDE plus the open-issue count that orderBall() needs. Use as
 * `include: ORDER_BALL_INCLUDE` (or spread it into a bigger include) and pass
 * the row through orderBallInput().
 */
export const ORDER_BALL_INCLUDE = {
  ...FLOW_ORDER_INCLUDE,
  _count: {
    select: { serviceIssues: { where: { status: { in: [...OPEN_SERVICE_ISSUE_STATUSES] } } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithBallInclude = Prisma.OrderGetPayload<{ include: typeof ORDER_BALL_INCLUDE }>;

/** Shape an ORDER_BALL_INCLUDE row for orderBall() / opportunityBall(). */
export function orderBallInput(order: OrderWithBallInclude): OrderBallInput {
  return { ...order, openIssueCount: order._count.serviceIssues };
}

/** Open issues as the service step sees them (open or being worked). */
export function isOpenIssueStatus(status: string): boolean {
  return (OPEN_SERVICE_ISSUE_STATUSES as readonly string[]).includes(status);
}
