import { liveLineItems, evaluatePaymentGate, canCompleteOrder } from "./flowRules";
import { hasOrderTerms, type OrderBallInput } from "./ballInCourt";

export type ValidationIssue = { field: string; message: string; href?: string };
export type DealRequirements = { company: boolean; neededBy: boolean };
export type DealFacts = {
  id: string; title: string; stage: string; companyId: string | null;
  orderType?: string;
  neededByDate: Date | string | null;
  lineItems: { id: string; name: string; rfqStatus: string; unitPrice: number | null }[];
};

export function itemIsPriced(item: { rfqStatus: string; unitPrice: number | null }) {
  return item.unitPrice != null && Number.isFinite(item.unitPrice) && item.unitPrice > 0 &&
    !["needs_pricing", "rfq_sent", "removed"].includes(item.rfqStatus);
}

export function intakeIssues(deal: DealFacts, required: DealRequirements): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!deal.title.trim()) issues.push({ field: "title", message: "Enter a deal title.", href: "#deal-title" });
  if (required.company && !deal.companyId) issues.push({ field: "companyId", message: "Choose a company.", href: "#deal-company" });
  if (required.neededBy && !deal.neededByDate) issues.push({ field: "neededByDate", message: "Set the needed-by date.", href: "#deal-needed-by" });
  if (!liveLineItems(deal.lineItems).length) issues.push({ field: "lineItems", message: "Add at least one active item.", href: "#line-items" });
  return issues;
}

export function pricingIssues(deal: DealFacts): ValidationIssue[] {
  return liveLineItems(deal.lineItems).filter(item => !itemIsPriced(item)).map(item => ({
    field: "lineItems", message: `${item.name}: ${item.rfqStatus === "rfq_sent" ? "awaiting supplier quote" : "confirm a price"}.`,
    href: `#pricing-${item.id}`,
  }));
}

export function stageIssues(deal: DealFacts, target: string, required: DealRequirements): ValidationIssue[] {
  if (["new", "info_missing", "lost"].includes(target)) return [];
  return [...intakeIssues(deal, required),
    ...(["proposal_sent", "negotiation", "won"].includes(target) ? pricingIssues(deal) : [])];
}

export function closeIssues(input: { value: number | null | undefined; address: string; neededBy: string; lostReason?: string }, kind: "won" | "lost"): ValidationIssue[] {
  if (kind === "lost") return input.lostReason?.trim() ? [] : [{ field: "lostReason", message: "Enter a reason for losing this deal." }];
  const issues: ValidationIssue[] = [];
  if (input.value == null || !Number.isFinite(input.value) || input.value < 0.01) issues.push({ field: "value", message: "Enter an agreed total of at least $0.01." });
  if (!input.address.trim()) issues.push({ field: "deliveryAddress", message: "Enter the delivery address." });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.neededBy) ? new Date(`${input.neededBy}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.neededBy) issues.push({ field: "neededByDate", message: "Choose a valid needed-by date." });
  return issues;
}

export type JourneyState = "complete" | "in_progress" | "waiting" | "to_do" | "not_required" | "stopped";
export type JourneyStep = {
  key: string; label: string; owner: string; state: JourneyState;
  description: string; completion: string;
  checks: { label: string; complete: boolean; href?: string }[];
  action?: { label: string; href: string };
};

export function orderCanClose(order: OrderBallInput): boolean {
  return canCompleteOrder(order) && hasOrderTerms(order) &&
    ["accepted", "not_needed"].includes(order.quoteStatus) && order.openIssueCount === 0;
}

/** Completion comes from each step's evidence, never its position in the journey. */
export function dealJourney(deal: DealFacts, required: DealRequirements, order?: (OrderBallInput & { id: string }) | null): JourneyStep[] {
  const edit = "#deal-intake", rfq = "#line-items";
  const intake = intakeIssues(deal, required), live = liveLineItems(deal.lineItems);
  const pricing = pricingIssues(deal), lost = deal.stage === "lost";
  const orderHref = order ? `/orders/${order.id}` : undefined;
  const step = (key: string, label: string, owner: string, state: JourneyState, description: string, completion: string, checks: JourneyStep["checks"], action?: JourneyStep["action"]): JourneyStep =>
    ({ key, label, owner, state, description, completion, checks, action });
  const steps: JourneyStep[] = [
    step("sales", "Intake", "Sales", intake.length ? "in_progress" : "complete", "Capture the request so the team can start work.", "Completes automatically when required details and at least one active item are saved.", [
      { label: "Deal title", complete: !!deal.title.trim(), href: "#deal-title" },
      ...(required.company ? [{ label: "Company linked", complete: !!deal.companyId, href: "#deal-company" }] : []),
      ...(required.neededBy ? [{ label: "Needed-by date", complete: !!deal.neededByDate, href: "#deal-needed-by" }] : []),
      { label: "Requested items added", complete: live.length > 0, href: "#line-items" },
    ], intake.length ? { label: intake[0].field === "lineItems" ? "Add requested items" : "Finish intake", href: intake[0].href! } : { label: "Review intake", href: edit }),
    step("pricing", "Pricing", "Office", !live.length ? "to_do" : !pricing.length ? "complete" : live.filter(i => !itemIsPriced(i)).every(i => i.rfqStatus === "rfq_sent") ? "waiting" : "in_progress", `${live.filter(itemIsPriced).length} of ${live.length} active items have confirmed pricing.`, "Completes automatically when every active item has a price and is no longer awaiting pricing or a supplier quote.", live.map(item => ({ label: `${item.name}${item.rfqStatus === "rfq_sent" ? " · awaiting supplier" : ""}`, complete: itemIsPriced(item), href: `#pricing-${item.id}` })), { label: pricing.length ? `Price ${pricing.length} item${pricing.length === 1 ? "" : "s"}` : "Review pricing", href: rfq }),
    step("close", "Confirm deal", "Sales", lost ? "stopped" : order ? "complete" : "to_do", order ? "Won. The linked order was created with the deal's items." : "Record the customer decision and review the order details.", "Completes when Mark Won creates the linked order. Mark Lost ends the journey without completing later steps.", [
      { label: "Intake requirements met", complete: !intake.length, href: edit },
      { label: "All active items priced", complete: live.length > 0 && !pricing.length, href: rfq },
      { label: "Customer decision recorded and order created", complete: !!order, href: orderHref ?? "#close" },
    ], { label: order ? "View order" : "Review decision", href: orderHref ?? "#close" }),
  ];
  const quoteDone = order?.quoteStatus === "accepted", quoteExempt = order?.quoteStatus === "not_needed";
  const termsDone = order ? hasOrderTerms(order) : false;
  const gate = order ? evaluatePaymentGate(order) : null;
  const items = order ? liveLineItems(order.lineItems) : [];
  const deliveryDone = !!order && order.deliveries.every(d => d.status === "delivered_full") && items.every(i => i.deliveryStatus === "arrived_complete") && (items.length > 0 || order.deliveries.length > 0);
  const poDone = !!order && (deliveryDone || (items.every(i => !!i.purchaseOrderId) && order.purchaseOrders.every(p => ["shipped", "received"].includes(p.status))));
  const next = (tab: string, label: string) => orderHref ? { label, href: `${orderHref}#${tab}` } : undefined;
  steps.push(
    step("quote", "Order quote", "Office", quoteExempt ? "not_required" : quoteDone ? "complete" : order?.quoteStatus === "sent" ? "waiting" : "to_do",
      !order ? "First confirm the deal to create its order. For projects, the customer quote is then tracked in the order’s Invoice tab." : quoteExempt ? "This order does not need a customer quote. You can continue to agreed terms." : quoteDone ? "Customer approval is recorded. The quote step is complete." : order.quoteStatus === "sent" ? "Waiting for the customer’s decision. Once they approve, open Invoice → Customer quote and select Quote Accepted." : "Prepare and send the quote outside this app. In the order’s Invoice tab, save its link and select Quote Sent. After customer approval, select Quote Accepted.",
      "Saving a link or selecting Quote Sent does not complete this step. Quote Accepted records customer approval and completes it; Not Needed skips it. The app tracks the quote but does not create or email it.",
      quoteExempt ? [{ label: "Customer quote not required", complete: true }] : [
        { label: "Deal confirmed and order created", complete: !!order, href: orderHref ?? "#close" },
        { label: "Quote sent to the customer", complete: !!quoteDone || order?.quoteStatus === "sent", href: orderHref ? `${orderHref}#quote-status` : undefined },
        { label: "Customer approval recorded as Quote Accepted", complete: !!quoteDone, href: orderHref ? `${orderHref}#quote-status` : undefined },
      ], !order ? { label: "Confirm deal first", href: "#close" } : next("quote-status", quoteDone || quoteExempt ? "Review customer quote" : order.quoteStatus === "sent" ? "Record customer approval" : "Open customer quote")),
    step("terms", "Sales order & terms", "Sales", termsDone ? "complete" : "to_do", "Write the terms agreed with the customer on the order.", "Completes automatically when order terms are saved.", [{ label: "Agreed terms saved", complete: termsDone, href: next("order-terms", "")?.href }], next("order-terms", "Review order terms")),
    step("deposit", "Payment", "Billing", gate?.exempt ? "not_required" : gate?.open ? "complete" : gate?.invoiced ? "waiting" : "to_do", gate?.reason ?? "The account's deposit or full-payment requirement is shown after the order is created.", "Completes automatically when paid payments satisfy the account's requirement. Exempt accounts show Not required.", [{ label: gate?.exempt ? "No deposit required for this account" : "Required payment received", complete: !!gate?.open, href: next("payments", "")?.href }], next("payments", "Review payment")),
    step("pos", "Purchasing", "Purchasing", poDone ? "complete" : order?.purchaseOrders.length ? "in_progress" : "to_do", "Assign active items to purchase orders and track suppliers through shipment.", "Completes when items are covered by shipped or received POs, or all goods have already been delivered (including stock deliveries).", [{ label: "All active items covered by POs or received", complete: !!order && items.every(i => !!i.purchaseOrderId || i.deliveryStatus === "arrived_complete"), href: next("purchase-orders", "")?.href }, { label: "Supplier work complete", complete: poDone, href: next("purchase-orders", "")?.href }], next("purchase-orders", "Review purchase orders")),
    step("delivery", "Delivery", "Purchasing", deliveryDone ? "complete" : order?.deliveries.length ? "in_progress" : "to_do", "Track delivery legs and confirm every active item arrived.", "Completes automatically when all delivery legs and active items are fully received.", [{ label: "Delivery legs fully delivered (if applicable)", complete: !!order && order.deliveries.every(d => d.status === "delivered_full"), href: next("delivery", "")?.href }, { label: "All active items received", complete: !!order && items.length > 0 && items.every(i => i.deliveryStatus === "arrived_complete"), href: next("delivery", "")?.href }], next("delivery", "Review deliveries")),
    step("service", "Closeout", "Customer Service", order?.status === "complete" && orderCanClose(order) ? "complete" : order?.openIssueCount ? "in_progress" : "to_do", "Resolve service issues, then explicitly mark the order complete.", "Requires the quote, terms, payment and fulfillment requirements to be met, no open issues, and an explicit Mark complete action.", [{ label: "Quote and agreed terms complete", complete: !!order && (!!quoteDone || !!quoteExempt) && termsDone, href: next(quoteDone || quoteExempt ? "order-terms" : "quote-status", "")?.href }, { label: "Payment and fulfillment requirements met", complete: !!order && canCompleteOrder(order), href: next(!gate?.open ? "payments" : "delivery", "")?.href }, { label: "No open service issues", complete: !!order && order.openIssueCount === 0, href: next("service", "")?.href }, { label: "Order marked complete", complete: order?.status === "complete", href: next("order-complete", "")?.href }], next("service", "Review closeout")),
  );
  const visibleSteps = steps.filter(s => s.key !== "quote" || !(quoteExempt || (!order && deal.orderType && deal.orderType !== "project")));
  if (lost) return visibleSteps.map(s => s.state === "complete" ? s : { ...s, state: "stopped", action: undefined });
  return visibleSteps;
}
