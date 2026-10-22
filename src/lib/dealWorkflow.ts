import { liveLineItems, evaluatePaymentGate, canCompleteOrder } from "./flowRules";
import { closingHolder, itemHasQuote, supplierQuoteProgress, type OrderBallInput } from "./ballInCourt";

export { itemIsPriced } from "./ballInCourt";

export type ValidationIssue = { field: string; message: string; href?: string };
export type DealRequirements = { company: boolean; neededBy: boolean };
export type DealFacts = {
  id: string; title: string; stage: string; companyId: string | null;
  orderType?: string;
  clientQuoteCreated?: boolean;
  clientQuoteSent?: boolean;
  clientQuoteUrl?: string | null;
  salesperson?: { name: string; active?: boolean } | null;
  neededByDate: Date | string | null;
  lineItems: { id: string; name: string; rfqStatus: string; unitPrice: number | null }[];
};

export function intakeIssues(deal: DealFacts, required: DealRequirements): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!deal.title.trim()) issues.push({ field: "title", message: "Enter a deal title.", href: "#deal-title" });
  if (required.company && !deal.companyId) issues.push({ field: "companyId", message: "Choose a company.", href: "#deal-company" });
  if (required.neededBy && !deal.neededByDate) issues.push({ field: "neededByDate", message: "Set the needed-by date.", href: "#deal-needed-by" });
  if (!liveLineItems(deal.lineItems).length) issues.push({ field: "lineItems", message: "Add at least one active item.", href: "#line-items" });
  return issues;
}

export function pricingIssues(deal: DealFacts): ValidationIssue[] {
  return liveLineItems(deal.lineItems).filter(item => !itemHasQuote(item)).map(item => ({
    field: "lineItems", message: `${item.name}: ${item.rfqStatus === "rfq_sent" ? "awaiting supplier quote" : "confirm supplier quote received"}.`,
    href: `#pricing-${item.id}`,
  }));
}

export function clientQuoteIssues(deal: Pick<DealFacts, "clientQuoteCreated" | "clientQuoteSent">): ValidationIssue[] {
  if (!deal.clientQuoteCreated) return [{ field: "clientQuote", message: "Create and send the client quote before confirming the deal.", href: "#client-quote" }];
  if (!deal.clientQuoteSent) return [{ field: "clientQuote", message: "Send the client quote before confirming the deal.", href: "#client-quote" }];
  return [];
}

export function stageIssues(deal: DealFacts, target: string, required: DealRequirements): ValidationIssue[] {
  if (["new", "info_missing", "lost"].includes(target)) return [];
  return [...intakeIssues(deal, required),
    ...(["proposal_sent", "negotiation", "won"].includes(target) ? pricingIssues(deal) : []),
    ...(["proposal_sent", "negotiation", "won"].includes(target) && deal.stage !== "won" ? clientQuoteIssues(deal) : [])];
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
  return canCompleteOrder(order) && order.openIssueCount === 0;
}

/** The approved eight-step journey uses saved evidence, never the stage position alone. */
export function dealJourney(deal: DealFacts, required: DealRequirements, order?: (OrderBallInput & { id: string }) | null): JourneyStep[] {
  const edit = "#deal-intake", rfq = "#line-items", quote = "#client-quote";
  const intake = intakeIssues(deal, required), live = liveLineItems(deal.lineItems);
  const pricing = pricingIssues(deal), lost = deal.stage === "lost";
  const quoteProgress = supplierQuoteProgress(deal.lineItems);
  const orderHref = order ? `/orders/${order.id}` : undefined;
  // Existing orders already passed the sales process; do not reopen historical work.
  const confirmed = !!order;
  const quoteCreated = !!deal.clientQuoteCreated;
  const quoteSent = !!deal.clientQuoteSent;
  const historicalQuote = (confirmed || deal.stage === "won") && !(quoteCreated && quoteSent);
  const gate = order ? evaluatePaymentGate(order) : null;
  const items = order ? liveLineItems(order.lineItems) : [];
  const deliveryDone = !!order && order.deliveries.every(d => d.status === "delivered_full") && items.every(i => i.deliveryStatus === "arrived_complete") && (items.length > 0 || order.deliveries.length > 0);
  const poDone = !!order && (deliveryDone || (items.length > 0 && items.every(i => !!i.purchaseOrderId) && order.purchaseOrders.length > 0 && order.purchaseOrders.every(p => ["shipped", "received"].includes(p.status))));
  const next = (tab: string, label: string) => orderHref ? { label, href: `${orderHref}#${tab}` } : undefined;
  const step = (key: string, label: string, owner: string, state: JourneyState, description: string, completion: string, checks: JourneyStep["checks"], action?: JourneyStep["action"]): JourneyStep =>
    ({ key, label, owner, state, description, completion, checks, action });
  const steps: JourneyStep[] = [
    step("sales", "Intake", "Sales", intake.length ? "in_progress" : "complete", "Capture the request so the team can start work.", "Completes when required details and at least one active item are saved.", [
      { label: "Deal title", complete: !!deal.title.trim(), href: "#deal-title" },
      ...(required.company ? [{ label: "Company linked", complete: !!deal.companyId, href: "#deal-company" }] : []),
      ...(required.neededBy ? [{ label: "Needed-by date", complete: !!deal.neededByDate, href: "#deal-needed-by" }] : []),
      { label: "Requested items added", complete: live.length > 0, href: rfq },
    ], intake.length ? { label: intake[0].field === "lineItems" ? "Add requested items" : "Finish intake", href: intake[0].href! } : { label: "Review intake", href: edit }),
    step("pricing", "Supplier Quotes", "Office", quoteProgress.state, `${quoteProgress.received} of ${quoteProgress.total} active items have supplier quotes.`, "Completes when every active item is marked Quote Received, Priced in AutoQuotes, or Approved. Dollar amounts are entered when confirming the deal.", live.map(item => ({ label: `${item.name}${item.rfqStatus === "rfq_sent" ? " · awaiting supplier" : ""}`, complete: itemHasQuote(item), href: `#pricing-${item.id}` })), { label: pricing.length ? "Get supplier quotes" : "Review supplier quotes", href: rfq }),
    step("clientQuote", "Client Quote", closingHolder(deal.salesperson), historicalQuote ? "not_required" : quoteCreated && quoteSent ? "complete" : quoteCreated ? "in_progress" : "to_do", historicalQuote ? "This deal was already confirmed before the Client Quote step was introduced. Its existing order can continue." : "Create the customer-facing quote in your quoting tool, then send it to the customer and record it here.", "Completes when the quote is confirmed created and sent. The customer's decision is recorded in Confirm Deal.", historicalQuote ? [{ label: "Deal was already confirmed before this step was introduced", complete: true, href: quote }] : [
      { label: "Client quote created", complete: quoteCreated, href: quote },
      { label: "Client quote sent to the customer", complete: quoteSent, href: quote },
    ], { label: quoteSent ? "Review client quote" : "Create and send client quote", href: quote }),
    step("close", "Confirm Deal", closingHolder(deal.salesperson), confirmed ? "complete" : "to_do", confirmed ? "The customer decision is recorded and the order was created." : "Record the customer decision, agreed price and delivery details.", "Completes when Mark Won creates the linked order. Mark Lost ends the journey.", [
      { label: "Intake requirements met", complete: !intake.length, href: edit },
      { label: "Supplier quotes received for all active items", complete: live.length > 0 && !pricing.length, href: rfq },
      { label: "Client quote created and sent", complete: historicalQuote || (quoteCreated && quoteSent), href: quote },
      { label: "Customer decision recorded and order created", complete: confirmed, href: orderHref ?? "#close" },
    ], { label: confirmed ? "View order" : "Review decision", href: orderHref ?? "#close" }),
    step("deposit", "Payment", "Billing", gate?.exempt ? "not_required" : gate?.open ? "complete" : gate?.invoiced ? "waiting" : "to_do", gate?.reason ?? "Payment requirements appear after the deal is confirmed.", "Completes when received payments satisfy the account's requirement. Exempt accounts show Not required.", [{ label: gate?.exempt ? "No deposit required for this account" : "Required payment received", complete: !!gate?.open, href: next("payments", "")?.href }], next("payments", "Review payment")),
    step("pos", "Purchase", "Purchasing", poDone ? "complete" : order?.purchaseOrders.length ? "in_progress" : "to_do", "After payment, log the AutoQuotes purchase orders and track supplier shipments.", "Completes when active items are covered by shipped or received POs, or all goods have been delivered.", [
      { label: "All active items covered by POs or received", complete: !!order && items.length > 0 && items.every(i => !!i.purchaseOrderId || i.deliveryStatus === "arrived_complete"), href: next("purchase-orders", "")?.href },
      { label: "Supplier work complete", complete: poDone, href: next("purchase-orders", "")?.href },
    ], next("purchase-orders", "Review purchases")),
    step("delivery", "Delivery", "Purchasing", deliveryDone ? "complete" : order?.deliveries.length ? "in_progress" : "to_do", "Track deliveries and confirm every active item arrived.", "Completes when all delivery legs and active items are fully received.", [
      { label: "Delivery legs fully delivered (if applicable)", complete: !!order && order.deliveries.every(d => d.status === "delivered_full"), href: next("delivery", "")?.href },
      { label: "All active items received", complete: !!order && items.length > 0 && items.every(i => i.deliveryStatus === "arrived_complete"), href: next("delivery", "")?.href },
    ], next("delivery", "Review deliveries")),
    step("service", "Close Out", "Customer Service", order?.status === "complete" && orderCanClose(order) ? "complete" : order?.openIssueCount ? "in_progress" : "to_do", "Resolve any service issues, then mark the order complete.", "Requires payment and fulfillment requirements to be met, no open service issues, and an explicit Mark complete action.", [
      { label: "Payment and fulfillment requirements met", complete: !!order && canCompleteOrder(order), href: next(!gate?.open ? "payments" : "delivery", "")?.href },
      { label: "No open service issues", complete: !!order && order.openIssueCount === 0, href: next("service", "")?.href },
      { label: "Order marked complete", complete: order?.status === "complete", href: next("order-complete", "")?.href },
    ], next("service", "Review close out")),
  ];
  if (lost) return steps.map(s => s.state === "complete" ? s : { ...s, state: "stopped", action: undefined });
  return steps;
}
