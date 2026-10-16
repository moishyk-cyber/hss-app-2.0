import test from "node:test";
import assert from "node:assert/strict";
import { confirmSalesOrder } from "../src/lib/workflows/salesOrder";
import { logPurchaseOrder } from "../src/lib/workflows/purchaseOrders";
import { fixture, memoryDatabase } from "./memoryDatabase";
import { orderBall, type OrderBallInput } from "../src/lib/ballInCourt";
import { isRole, roleCan, defaultPermissionMatrix } from "../src/lib/permissions";

const input = { orderId: "order", supplierId: "company", lineItemIds: ["item"], number: "AQ-NEW" };

test("sales order confirmation requires payment and persists a stable sent date", async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, payment: [] });
  await assert.rejects(confirmSalesOrder(m.db, "order", true), /payment|invoic/i);
  assert.equal(m.state().order[0].salesOrderSentAt, undefined);
  const paid = memoryDatabase(seed);
  await confirmSalesOrder(paid.db, "order", true);
  const date = paid.state().order[0].salesOrderSentAt;
  assert.ok(date instanceof Date);
  await confirmSalesOrder(paid.db, "order", true);
  assert.deepEqual(paid.state().order[0].salesOrderSentAt, date);
  await confirmSalesOrder(paid.db, "order", false);
  assert.equal(paid.state().order[0].salesOrderSentAt, null);
});

test("PO creation cannot bypass payment or sales order confirmation", async () => {
  for (const paid of [false, true]) {
    const seed = fixture();
    const m = memoryDatabase({ ...seed, payment: paid ? seed.payment : [], lineItem: seed.lineItem.map(i => ({ ...i, orderId: "order" })) });
    await assert.rejects(logPurchaseOrder(m.db, input), paid ? /sales order/i : /payment|invoic/i);
    assert.equal(m.state().purchaseOrder.length, 1);
    assert.equal(m.state().lineItem[0].purchaseOrderId, null);
  }
});

test("sales confirmation rolls back on database failure", async () => {
  const m = memoryDatabase(fixture());
  m.fail("order.update");
  await assert.rejects(confirmSalesOrder(m.db, "order", true));
  assert.equal(m.state().order[0].salesOrderSentAt, undefined);
});

test("after payment, sales holds the ball before purchasing unassigned items", () => {
  const order: OrderBallInput = { status: "payment_received", orderType: "order", orderValue: 100, company: null, payments: [{status:"paid",amount:100}], quoteStatus:"not_needed", termsNotes:"Full upfront", paymentTerms:null, purchaseOrders:[], deliveries:[], openIssueCount:0, lineItems:[{rfqStatus:"approved",deliveryStatus:"pending",purchaseOrderId:null}] };
  assert.equal(orderBall(order).step, "salesOrder");
  assert.equal(orderBall(order).court, "sales");
  assert.equal(orderBall({...order,salesOrderSentAt:new Date()}).step, "pos");
  assert.equal(orderBall({...order,payments:[]}).step, "deposit");
});

test("Design is no longer an assignable or privileged role", () => {
  assert.equal(isRole("design"), false);
  assert.equal(roleCan(defaultPermissionMatrix(), "design", "deals.edit"), false);
});
