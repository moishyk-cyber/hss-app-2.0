import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePaymentGate, canCompleteOrder } from "../src/lib/flowRules";
const order = (required: number, amounts: number[]) => ({ orderType: "project", orderValue: 120, depositRequired: required, payments: amounts.map(amount => ({ amount, status: "paid" })), company: { requiresDeposit: true, depositPercent: 30 } });
test("$35 cannot satisfy $36 and cannot close the order", () => {
  const input = order(36, [35]);
  const gate = evaluatePaymentGate(input);
  assert.equal(gate.open, false); assert.equal(gate.shortfall, 1);
  assert.equal(canCompleteOrder({ ...input, status: "delivered", lineItems: [], purchaseOrders: [], deliveries: [] }), false);
});
test("every cent is required without floating point drift", () => {
  assert.equal(evaluatePaymentGate(order(300, [299.99])).shortfall, .01);
  assert.equal(evaluatePaymentGate(order(.3, [.1, .2])).open, true);
  assert.equal(evaluatePaymentGate(order(35.7, [35])).shortfall, .7);
  assert.equal(evaluatePaymentGate(order(36, [35, 1])).open, true);
  assert.equal(evaluatePaymentGate(order(36, [40])).shortfall, 0);
});
test("percent deposit retains cents; unpaid invoices do not count", () => {
  const input = { ...order(0, []), depositRequired: null, orderValue: 119.01, payments: [{ status: "invoiced", amount: 40 }] };
  const gate = evaluatePaymentGate(input);
  assert.equal(gate.requiredTotal, 35.7); assert.equal(gate.paidTotal, 0); assert.equal(gate.open, false);
});
