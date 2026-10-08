// The flow engine: payment-gate evaluation and derived order status.
// This is the ONLY place gate/status rules live - actions and pages must call
// these instead of re-deriving (the old bug class: two truths that drift).
//
// The rules themselves are in @/lib/flowRules (pure, no prisma) so client
// components and @/lib/ballInCourt can share them; this module re-exports them
// and adds the helpers that read/write the database.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlainMoney } from "@/lib/money";
import { OPEN_SERVICE_ISSUE_STATUSES } from "@/lib/constants";
import { reconcileOrderStatus } from "./workflows/orderState";
import { FLOW_ORDER_INCLUDE } from "@/lib/flowRules";
import type { OrderBallInput } from "@/lib/ballInCourt";

export {
  evaluatePaymentGate,
  deriveOrderStatus,
  orderPhase,
  canCompleteOrder,
  FLOW_ORDER_INCLUDE,
} from "@/lib/flowRules";
export type { PaymentGate } from "@/lib/flowRules";

/**
 * Re-derive and persist Order.status from payments/POs/deliveries/items. Call
 * after any mutation that changes those facts. Leaves "stuck" and "complete"
 * alone. Never throws - status sync must not fail the mutation that triggered it.
 */
export async function recomputeOrderStatus(orderId: string): Promise<string | null> {
  try {
    return await reconcileOrderStatus(prisma, orderId);
  } catch (err) {
    console.error("recomputeOrderStatus failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ball-in-court convenience for pages
// ---------------------------------------------------------------------------

/**
 * FLOW_ORDER_INCLUDE plus the open-issue count that orderBall() needs. Use as
 * `include: ORDER_BALL_INCLUDE` (or spread it into a bigger include), convert
 * the row with plainMoney() (money columns are Decimal) and pass it through
 * orderBallInput().
 */
export const ORDER_BALL_INCLUDE = {
  ...FLOW_ORDER_INCLUDE,
  _count: {
    select: { serviceIssues: { where: { status: { in: [...OPEN_SERVICE_ISSUE_STATUSES] } } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithBallInclude = PlainMoney<
  Prisma.OrderGetPayload<{ include: typeof ORDER_BALL_INCLUDE }>
>;

/** Shape an ORDER_BALL_INCLUDE row for orderBall() / opportunityBall(). */
export function orderBallInput(order: OrderWithBallInclude): OrderBallInput {
  return { ...order, openIssueCount: order._count.serviceIssues };
}
