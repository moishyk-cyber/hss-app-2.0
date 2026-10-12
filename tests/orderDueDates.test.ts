import test from "node:test";
import assert from "node:assert/strict";
import { dueState, paymentState } from "../src/app/orders/utils";

test("fully paid orders do not highlight past-due dates", () => {
  const paid = paymentState([{ status: "paid" }, { status: "paid" }]);
  assert.equal(dueState("2000-01-01", "in_progress", paid), null);
  assert.equal(dueState("2000-01-01", "paid"), null);
});

test("partially paid and unpaid orders still highlight past-due dates", () => {
  assert.equal(dueState("2000-01-01", "in_progress", paymentState([{ status: "paid" }, { status: "invoiced" }])), "overdue");
  assert.equal(dueState("2000-01-01", "in_progress", paymentState([])), "overdue");
});

test("completed orders and orders without due dates are not overdue", () => {
  assert.equal(dueState("2000-01-01", "delivered", "pending"), null);
  assert.equal(dueState("2000-01-01", "complete", "pending"), null);
  assert.equal(dueState(null, "in_progress", "pending"), null);
});
