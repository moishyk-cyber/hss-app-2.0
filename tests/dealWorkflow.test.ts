import test from "node:test";
import assert from "node:assert/strict";
import { closeIssues, dealJourney, stageIssues, orderCanClose, type DealFacts } from "../src/lib/dealWorkflow";
import type { OrderBallInput } from "../src/lib/ballInCourt";

const required = { company: true, neededBy: true };
const deal: DealFacts = { id: "deal", title: "Kitchen equipment", stage: "estimating", companyId: "company", neededByDate: "2026-10-10", lineItems: [{ id: "oven", name: "Oven", rfqStatus: "quote_received", unitPrice: 2000 }] };
const order: OrderBallInput & { id: string } = { id: "order", status: "delivered", orderType: "project", orderValue: 2000, quoteStatus: "accepted", termsNotes: "30% deposit", paymentTerms: null, company: { requiresDeposit: true, depositPercent: 30 }, payments: [{ status: "paid", amount: 600 }], purchaseOrders: [{ status: "shipped" }], deliveries: [{ status: "delivered_full" }], lineItems: [{ rfqStatus: "approved", deliveryStatus: "arrived_complete", purchaseOrderId: "po" }], openIssueCount: 0 };

test("Mark Won reports all missing fields and rejects invalid dates and nonfinite totals", () => {
  assert.deepEqual(closeIssues({ value: 0, address: "  ", neededBy: "" }, "won").map(i => i.field), ["value", "deliveryAddress", "neededByDate"]);
  assert.ok(closeIssues({ value: Infinity, address: "Brooklyn", neededBy: "2026-02-30" }, "won").some(i => i.field === "neededByDate"));
  assert.ok(closeIssues({ value: 0.001, address: "Brooklyn", neededBy: "2026-10-10" }, "won").some(i => i.field === "value"));
  assert.deepEqual(closeIssues({ value: 0.01, address: "Brooklyn", neededBy: "2026-10-10" }, "won"), []);
});

test("Losing a deal requires a real reason, without pricing or delivery requirements", () => {
  assert.equal(closeIssues({ value: null, address: "", neededBy: "", lostReason: "  " }, "lost").length, 1);
  assert.deepEqual(closeIssues({ value: null, address: "", neededBy: "", lostReason: "Customer cancelled" }, "lost"), []);
});

test("Later stage changes cannot bypass missing intake or unset prices", () => {
  const incomplete = { ...deal, companyId: null, neededByDate: null, lineItems: [{ ...deal.lineItems[0], rfqStatus: "approved", unitPrice: null }] };
  assert.deepEqual(stageIssues(incomplete, "won", required).map(i => i.field), ["companyId", "neededByDate", "lineItems"]);
  assert.deepEqual(stageIssues(incomplete, "info_missing", required), []);
  assert.equal(stageIssues({ ...deal, lineItems: [] }, "won", required).length, 1);
});

test("Revisions can reopen pricing and removed items do not block a ready proposal", () => {
  const revised = { ...deal, lineItems: [{ ...deal.lineItems[0], rfqStatus: "rfq_sent" }] };
  assert.equal(stageIssues(revised, "proposal_sent", required).length, 1);
  assert.deepEqual(stageIssues({ ...deal, lineItems: [...deal.lineItems, { id: "removed", name: "Removed fryer", rfqStatus: "removed", unitPrice: null }] }, "proposal_sent", required), []);
});

test("Pricing completes from saved evidence even when the stored stage is still estimating", () => {
  const journey = dealJourney(deal, required);
  assert.equal(journey[1].state, "complete");
  assert.equal(journey.find(s => !["complete", "not_required"].includes(s.state))?.key, "close");
  assert.equal(journey[1].checks[0].href, "#pricing-oven");
  assert.ok(journey[0].checks.every(c => c.href?.startsWith("#")));
});

test("New unpriced items reopen pricing; supplier requests show waiting", () => {
  const revised = { ...deal, lineItems: [...deal.lineItems, { id: "fryer", name: "Fryer", unitPrice: null, rfqStatus: "needs_pricing" }] };
  assert.equal(dealJourney(revised, required)[1].state, "in_progress");
  assert.equal(dealJourney({ ...deal, lineItems: [{ ...deal.lineItems[0], rfqStatus: "rfq_sent" }] }, required)[1].state, "waiting");
});

test("A lost deal never claims downstream work is complete", () => {
  const journey = dealJourney({ ...deal, stage: "lost" }, required);
  assert.equal(journey[0].state, "complete");
  assert.ok(journey.slice(2).every(s => s.state === "stopped" && !s.action));
});

test("Independent checks expose missing quote even after payment and delivery", () => {
  const journey = dealJourney({ ...deal, stage: "won" }, required, { ...order, quoteStatus: "sent" });
  assert.equal(journey.find(s => s.key === "quote")?.state, "waiting");
  assert.equal(journey.find(s => s.key === "deposit")?.state, "complete");
  assert.equal(journey.find(s => s.key === "delivery")?.state, "complete");
  assert.equal(orderCanClose({ ...order, quoteStatus: "sent" }), false);
});

test("Exempt quote steps are hidden while exempt payment stays visible", () => {
  const journey = dealJourney({ ...deal, stage: "won" }, required, { ...order, quoteStatus: "not_needed", payments: [], company: { requiresDeposit: false, depositPercent: 30 } });
  assert.equal(journey.some(s => s.key === "quote"), false);
  assert.equal(journey.length, 8);
  assert.equal(journey.find(s => s.key === "deposit")?.state, "not_required");
});

test("Straight deals hide quotes before order creation; an explicitly needed order quote remains visible", () => {
  const straight = { ...deal, orderType: "order" };
  assert.equal(dealJourney(straight, required).some(s => s.key === "quote"), false);
  assert.equal(dealJourney({ ...deal, orderType: "project" }, required).some(s => s.key === "quote"), true);
  assert.equal(dealJourney(straight, required, { ...order, quoteStatus: "needed" }).some(s => s.key === "quote"), true);
});

test("Closeout requires terms, quote acceptance, fulfillment, and resolved service issues", () => {
  assert.equal(orderCanClose(order), true);
  assert.equal(orderCanClose({ ...order, termsNotes: "  " }), false);
  assert.equal(orderCanClose({ ...order, openIssueCount: 1 }), false);
  assert.equal(orderCanClose({ ...order, payments: [] }), false);
  assert.equal(orderCanClose({ ...order, deliveries: [{ status: "in_transit" }] }), false);
});

test("Delivered stock does not appear to still need a purchase order", () => {
  const journey = dealJourney({ ...deal, stage: "won" }, required, { ...order, purchaseOrders: [], lineItems: [{ ...order.lineItems[0], purchaseOrderId: null }] });
  assert.equal(journey.find(s => s.key === "pos")?.state, "complete");
});

test("every order workflow requirement links to the relevant work, including completed checks", () => {
  const steps = dealJourney(deal, required, order);
  for (const step of steps) for (const check of step.checks) assert.ok(check.href, `${step.key}: ${check.label} needs a destination`);
  assert.equal(steps.find(step => step.key === "terms")?.checks[0].href, "/orders/order#order-terms");
  assert.equal(steps.find(step => step.key === "deposit")?.checks[0].href, "/orders/order#payments");
});
