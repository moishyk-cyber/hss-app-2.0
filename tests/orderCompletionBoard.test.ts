import test from "node:test";
import assert from "node:assert/strict";
import { orderPhase } from "../src/lib/flowRules";
import { orderBall, type OrderBallInput } from "../src/lib/ballInCourt";

const delivered: OrderBallInput = {
  status: "delivered", orderType: "order", orderValue: 100,
  quoteStatus: "not_needed", termsNotes: "Agreed", paymentTerms: null,
  company: { requiresDeposit: false, depositPercent: 0 }, payments: [{ status: "paid", amount: 100 }],
  lineItems: [{ rfqStatus: "approved", deliveryStatus: "arrived_complete", purchaseOrderId: "po" }],
  purchaseOrders: [{ status: "received" }], deliveries: [{ status: "delivered_full" }], openIssueCount: 0,
};

test("delivered orders without service issues leave kanban and have no Customer Service handoff", () => {
  assert.equal(orderPhase(delivered), null);
  assert.deepEqual(orderBall(delivered), { step: null, court: null, hint: "Ready to complete" });
});
test("Customer Service receives delivered orders only when a real open issue exists", () => {
  assert.equal(orderPhase({ ...delivered, openIssueCount: 1 }), "customer_service");
  assert.equal(orderBall({ ...delivered, openIssueCount: 1 }).step, "service");
  assert.equal(orderPhase({ ...delivered, status: "complete", openIssueCount: 0 }), null);
  assert.equal(orderBall({ ...delivered, status: "complete" }).step, null);
});
test("active deliveries and explicitly stuck work remain visible", () => {
  assert.equal(orderPhase({ ...delivered, status: "in_transit" }), "delivery");
  assert.equal(orderPhase({ ...delivered, status: "stuck" }), "delivery");
  assert.equal(orderPhase({ ...delivered, status: "stuck", openIssueCount: 1 }), "customer_service");
});
