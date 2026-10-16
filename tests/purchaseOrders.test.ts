import test from "node:test";
import assert from "node:assert/strict";
import { logPurchaseOrder, renamePurchaseOrder, savePoExpectedDate, poNumberProblem } from "../src/lib/workflows/purchaseOrders";
import { fixture, memoryDatabase } from "./memoryDatabase";

function poFixture() {
  const seed = fixture();
  return { ...seed, order: seed.order.map(order => ({ ...order, salesOrderSentAt: new Date() })), lineItem: seed.lineItem.map(item => ({ ...item, orderId: "order" })) };
}

const input = { orderId: "order", supplierId: "company", lineItemIds: ["item"], number: "  AQ-00421/A  " };

test("logging an AutoQuotes PO uses its exact number throughout and attaches only selected items", async () => {
  const m = memoryDatabase(poFixture());
  const po = await logPurchaseOrder(m.db, input);
  assert.equal(po.poNumber, "AQ-00421/A");
  assert.equal(po.autoQuotesPoNumber, "AQ-00421/A");
  assert.equal(m.state().lineItem[0].purchaseOrderId, po.id);
  assert.equal(m.state().order[0].poSequence, undefined);
});

test("blank or overlong AutoQuotes numbers cannot create a PO", async () => {
  for (const number of ["", "  ", "a".repeat(41)]) {
    const m = memoryDatabase(poFixture());
    await assert.rejects(logPurchaseOrder(m.db, { ...input, number }));
    assert.equal(m.state().purchaseOrder.length, 1);
  }
  assert.equal(poNumberProblem("0"), null);
  assert.equal(poNumberProblem("a".repeat(40)), null);
});

test("PO corrections update the primary and AutoQuotes numbers together", async () => {
  const m = memoryDatabase(poFixture());
  await renamePurchaseOrder(m.db, "po", "  AQ-CORRECTED  ");
  assert.equal(m.state().purchaseOrder[0].poNumber, "AQ-CORRECTED");
  assert.equal(m.state().purchaseOrder[0].autoQuotesPoNumber, "AQ-CORRECTED");
  await assert.rejects(renamePurchaseOrder(m.db, "po", " "));
  assert.equal(m.state().purchaseOrder[0].poNumber, "AQ-CORRECTED");
});

test("stale selected items roll back PO creation instead of logging an empty or partial PO", async () => {
  const m = memoryDatabase(poFixture());
  await assert.rejects(logPurchaseOrder(m.db, { ...input, lineItemIds: ["item", "another-order-item"] }), /no longer available/);
  assert.equal(m.state().purchaseOrder.length, 1);
  assert.equal(m.state().lineItem[0].purchaseOrderId, null);
});

test("serialization retries keep the AutoQuotes number and create only one PO", async () => {
  const m = memoryDatabase(poFixture());
  m.conflictOnce();
  const po = await logPurchaseOrder(m.db, input);
  assert.equal(m.state().purchaseOrder.filter(p => p.poNumber === input.number.trim()).length, 1);
  assert.equal(m.state().lineItem[0].purchaseOrderId, po.id);
});

test("a new PO stores its expected date without changing item or delivery dates", async () => {
  const m = memoryDatabase(poFixture());
  const po = await logPurchaseOrder(m.db, { ...input, expectedDate: "2026-11-05" });
  assert.equal(po.expectedDate?.toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(m.state().delivery.length, 0);
  assert.equal(m.state().lineItem[0].leadTimeDate, undefined);
});

test("PO expected dates can be corrected or cleared; invalid dates leave the saved date intact", async () => {
  const m = memoryDatabase(poFixture());
  await savePoExpectedDate(m.db, "po", "2026-11-05");
  await savePoExpectedDate(m.db, "po", "2026-11-12");
  for (const value of ["2026-02-30", "2026-13-01", "not a date", "2026-11-05T18:00:00Z"]) {
    await assert.rejects(savePoExpectedDate(m.db, "po", value), /valid expected date/);
  }
  assert.equal((m.state().purchaseOrder[0].expectedDate as Date).toISOString().slice(0, 10), "2026-11-12");
  await savePoExpectedDate(m.db, "po", "");
  assert.equal(m.state().purchaseOrder[0].expectedDate, null);
});
