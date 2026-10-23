import test from "node:test";
import assert from "node:assert/strict";
import { orderPhase } from "../src/lib/flowRules";
import { orderBall, type OrderBallInput } from "../src/lib/ballInCourt";

const delivered: OrderBallInput = {
  status: "delivered", orderType: "order", orderValue: 100,
  quoteStatus: "not_needed", termsNotes: "Agreed", paymentTerms: null,
  company: { requiresDeposit: false, paymentTermsConfigured: true, depositPercent: 0 }, payments: [{ status: "paid", amount: 100 }],
  lineItems: [{ rfqStatus: "approved", deliveryStatus: "arrived_complete", purchaseOrderId: "po" }],
  purchaseOrders: [{ status: "received" }], deliveries: [{ status: "delivered_full" }], openIssueCount: 0,
};

test("delivered orders wait in Close Out without creating a customer service issue", () => {
  assert.equal(orderPhase(delivered), "service");
  assert.deepEqual(orderBall(delivered), { step: "service", court: "service", hint: "Close out the order" });
});
test("Customer Service receives delivered orders only when a real open issue exists", () => {
  assert.equal(orderPhase({ ...delivered, openIssueCount: 1 }), "service");
  assert.equal(orderBall({ ...delivered, openIssueCount: 1 }).step, "service");
  assert.equal(orderPhase({ ...delivered, status: "complete", openIssueCount: 0 }), null);
  assert.equal(orderBall({ ...delivered, status: "complete" }).step, null);
});
test("active deliveries and explicitly stuck work remain visible", () => {
  assert.equal(orderPhase({ ...delivered, status: "in_transit" }), "delivery");
  assert.equal(orderPhase({ ...delivered, status: "stuck" }), "service");
  assert.equal(orderPhase({ ...delivered, status: "stuck", openIssueCount: 1 }), "service");
});

test("payment stays on intake; fulfillment starts at Purchase", () => {
  assert.equal(orderPhase({ ...delivered, status: "awaiting_payment" }), null);
  assert.equal(orderPhase({ ...delivered, status: "new", company: { requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 }, payments: [] }), null);
  assert.equal(orderPhase({ ...delivered, status: "new" }), "pos");
  assert.equal(orderPhase({ ...delivered, status: "payment_received" }), "pos");
  assert.equal(orderPhase({ ...delivered, status: "pos_in_progress" }), "pos");
});
