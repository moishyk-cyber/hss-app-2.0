// Ball-in-court: the nine-step full flow (sales through customer service) and
// who holds the ball at each step. Pure - safe in server AND client components
// (it imports the pure rules from @/lib/flowRules, never prisma).
//
// A "ball" is the single next thing that has to happen on a deal/order and the
// team (court) that has to do it. Pages render it with BallInCourtBadge and
// feed fullFlowSteps() to the existing FlowStepper.

import { evaluatePaymentGate, liveLineItems, type FlowLineItem, type FlowOrder } from "@/lib/flowRules";
import type { FlowStep } from "@/lib/FlowStepper";

export const FLOW_STEPS = [
  { key: "sales", label: "Sales", court: "sales" },
  { key: "pricing", label: "Pricing", court: "office" },
  { key: "close", label: "Close", court: "sales" },
  { key: "quote", label: "Quote", court: "office" },
  { key: "terms", label: "Sales Order + Terms", court: "sales" },
  { key: "deposit", label: "Deposit", court: "billing" },
  { key: "pos", label: "POs", court: "purchasing" },
  { key: "delivery", label: "Delivery", court: "purchasing" },
  { key: "service", label: "Customer Service", court: "service" },
] as const;

export type FlowStepKey = (typeof FLOW_STEPS)[number]["key"];
export type Court = (typeof FLOW_STEPS)[number]["court"];

export const COURTS: Record<Court, string> = {
  sales: "Sales",
  office: "Office",
  billing: "Billing",
  purchasing: "Purchasing",
  service: "Customer Service",
};

// Badge classes per court - defined in globals.css (.badge-*).
export const COURT_COLORS: Record<Court, string> = {
  sales: "badge-blue",
  office: "badge-yellow",
  billing: "badge-orange",
  purchasing: "badge-green",
  service: "badge-red",
};

/** step/court are null when nothing is pending (order complete, deal lost). */
export type Ball = {
  step: FlowStepKey | null;
  court: Court | null;
  /** Short next-action text, e.g. "Price 3 items" or the payment gate reason. */
  hint: string;
};

/** What orderBall() needs: the flow-engine order plus quote/terms/PO-link/issue facts. */
export type OrderBallInput = Omit<FlowOrder, "lineItems"> & {
  quoteStatus: string;
  /** Free-text terms written on the order (the Sales Order + Terms step). */
  termsNotes: string | null;
  /** Legacy PAYMENT_TERMS value on orders closed before terms became free text. */
  paymentTerms: string | null;
  lineItems: (FlowLineItem & { purchaseOrderId: string | null })[];
  /** Service issues still open or in progress (see OPEN_SERVICE_ISSUE_STATUSES). */
  openIssueCount: number;
};

export type OpportunityBallInput = {
  stage: string;
  lineItems: { rfqStatus: string }[];
  /** The won order, when there is one (opportunityBall delegates to orderBall). */
  order?: OrderBallInput | null;
};

function stepFor(key: FlowStepKey) {
  // FLOW_STEPS covers every key, so the lookup cannot miss.
  return FLOW_STEPS.find((s) => s.key === key)!;
}

function ball(step: FlowStepKey, hint: string): Ball {
  return { step, court: stepFor(step).court, hint };
}

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The Sales Order + Terms step is satisfied once someone has written the terms
 * on the order. Orders closed before terms became free text carry a
 * PAYMENT_TERMS value instead - those count as set too.
 */
export function hasOrderTerms(order: { termsNotes: string | null; paymentTerms: string | null }): boolean {
  return (order.termsNotes?.trim().length ?? 0) > 0 || order.paymentTerms != null;
}

/** PO statuses that still need purchasing's attention. */
const PO_OPEN_STATUSES = new Set(["draft", "sent", "acknowledged"]);

/** Where the ball sits on an order (the order-side steps: quote through service). */
export function orderBall(order: OrderBallInput): Ball {
  if (order.status === "complete") return { step: null, court: null, hint: "Complete" };

  if (order.quoteStatus === "needed") return ball("quote", "Prepare quote");
  if (order.quoteStatus === "sent") return ball("quote", "Awaiting quote approval");

  if (!hasOrderTerms(order)) return ball("terms", "Set terms");

  const gate = evaluatePaymentGate(order);
  if (!gate.open) return ball("deposit", gate.reason);

  const items = liveLineItems(order.lineItems);
  const notOnPo = items.filter((i) => !i.purchaseOrderId).length;
  if (notOnPo > 0) return ball("pos", `${plural(notOnPo, "item")} not on a PO`);
  const openPos = order.purchaseOrders.filter((p) => PO_OPEN_STATUSES.has(p.status)).length;
  if (openPos > 0) return ball("pos", `${plural(openPos, "PO")} in progress`);

  const inFlight = order.deliveries.filter((d) => d.status !== "delivered_full").length;
  if (inFlight > 0) return ball("delivery", `${plural(inFlight, "delivery", "deliveries")} in flight`);
  const notArrived = items.filter((i) => i.deliveryStatus !== "arrived_complete").length;
  if (notArrived > 0) return ball("delivery", `${plural(notArrived, "item")} not yet arrived`);

  if (order.openIssueCount > 0) return ball("service", plural(order.openIssueCount, "open issue"));
  return ball("service", "No open issues - mark complete");
}

/** Where the ball sits on a deal; a won deal hands over to its order. */
export function opportunityBall(opp: OpportunityBallInput): Ball {
  if (opp.stage === "lost") return { step: null, court: null, hint: "Lost" };
  if (opp.stage === "won") {
    return opp.order ? orderBall(opp.order) : ball("close", "Create the order");
  }
  if (opp.stage === "new" || opp.stage === "info_missing") return ball("sales", "Complete intake");

  const items = liveLineItems(opp.lineItems);
  const unpriced = items.filter(
    (i) => i.rfqStatus === "needs_pricing" || i.rfqStatus === "rfq_sent"
  ).length;
  if (unpriced > 0) return ball("pricing", `Price ${plural(unpriced, "item")}`);
  if (opp.stage === "estimating") return ball("pricing", "Finish pricing");
  // proposal_sent / revisions_needed / negotiation, or every item is priced.
  return ball("close", "Close the deal");
}

export type FullFlowOptions = {
  /** Deal page href - sales-side steps (sales, pricing, close) link here. */
  dealHref?: string;
  /** Order page href - order-side steps link to its tabs (#invoice, #purchase-orders, ...). */
  orderHref?: string;
  /** Shown under the current step (pass the ball's hint). */
  hint?: string;
};

function stepHref(key: FlowStepKey, opts: FullFlowOptions): string | undefined {
  switch (key) {
    case "sales":
    case "pricing":
      return opts.dealHref;
    case "close":
      return opts.dealHref ? `${opts.dealHref}#close` : undefined;
    case "quote":
    case "terms":
    case "deposit":
      return opts.orderHref ? `${opts.orderHref}#invoice` : undefined;
    case "pos":
      return opts.orderHref ? `${opts.orderHref}#purchase-orders` : undefined;
    case "delivery":
      return opts.orderHref ? `${opts.orderHref}#delivery` : undefined;
    case "service":
      return opts.orderHref ? `${opts.orderHref}#service` : undefined;
  }
}

/**
 * The nine steps for FlowStepper: steps before the ball are done, the ball step
 * is current (blocked when it is the deposit gate), later steps upcoming. A null
 * ballStep (order complete) renders every step done.
 */
export function fullFlowSteps(ballStep: FlowStepKey | null, opts: FullFlowOptions = {}): FlowStep[] {
  const ballIdx = ballStep ? FLOW_STEPS.findIndex((s) => s.key === ballStep) : FLOW_STEPS.length;
  return FLOW_STEPS.map((s, i) => {
    const state: FlowStep["state"] =
      i < ballIdx ? "done" : i > ballIdx ? "upcoming" : s.key === "deposit" ? "blocked" : "current";
    return {
      label: s.label,
      state,
      hint: i === ballIdx ? opts.hint : undefined,
      href: stepHref(s.key, opts),
    };
  });
}
