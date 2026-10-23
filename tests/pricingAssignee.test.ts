import test from "node:test";
import assert from "node:assert/strict";
import { createLineItemPricing } from "../src/lib/workflows/pricing";
import { getDefaultPricingAssignee } from "../src/lib/workflows/pricingAssignee";
import { fixture, memoryDatabase } from "./memoryDatabase";

const effects = { audit: async () => {}, refresh: () => {} };
function seed(value: string | null = "pricing-user") {
  return { ...fixture(), user: [
    { id: "pricing-user", name: "Pricing teammate", active: true },
    { id: "other-user", name: "Other teammate", active: true },
    { id: "inactive-user", name: "Inactive teammate", active: false },
  ], appSetting: value ? [{ id: "pricing-setting", key: "court.pricing.assigneeId", value }] : [] };
}

test("default remains unassigned until selected; inactive or deleted teammates are ignored", async () => {
  for (const value of [null, "missing-user", "inactive-user"]) {
    const m = memoryDatabase(seed(value));
    assert.equal(await getDefaultPricingAssignee(m.db), null);
    const item = await createLineItemPricing(m.db, effects).add({ opportunityId: "deal", name: "Oven", qty: 1 });
    assert.equal(item.assigneeId, null);
  }
});

test("new quote and pricing items on deals and orders use the configured default", async () => {
  for (const parent of [{ opportunityId: "deal" }, { orderId: "order" }]) {
    for (const rfqStatus of ["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes"]) {
      const m = memoryDatabase(seed());
      const item = await createLineItemPricing(m.db, effects).add({ ...parent, name: "Oven", qty: 1, rfqStatus });
      assert.equal(item.assigneeId, "pricing-user");
      assert.equal(m.state().lineItem[0].assigneeId, undefined); // existing work is untouched
    }
  }
});

test("explicit assignees and explicit unassignment win; approved items skip the default", async () => {
  const m = memoryDatabase(seed());
  const pricing = createLineItemPricing(m.db, effects);
  for (const assigneeId of ["other-user", null]) {
    const item = await pricing.add({ opportunityId: "deal", name: "Oven", qty: 1, assigneeId });
    assert.equal(item.assigneeId, assigneeId);
  }
  const item = await pricing.add({ orderId: "order", name: "Priced oven", qty: 1, rfqStatus: "approved" });
  assert.equal(item.assigneeId, null);
});

test("changing the default affects future items without reassigning previous work", async () => {
  const m = memoryDatabase(seed());
  const pricing = createLineItemPricing(m.db, effects);
  const first = await pricing.add({ opportunityId: "deal", name: "Oven", qty: 1 });
  await m.db.appSetting.update({ where: { key: "court.pricing.assigneeId" }, data: { value: "other-user" } });
  const second = await pricing.add({ opportunityId: "deal", name: "Fryer", qty: 1 });
  assert.equal(first.assigneeId, "pricing-user");
  assert.equal(m.state().lineItem.find(item => item.id === first.id)?.assigneeId, "pricing-user");
  assert.equal(second.assigneeId, "other-user");
});

test("existing items returning to pricing retain their assignment, including unassigned", async () => {
  for (const assigneeId of [null, "other-user"]) {
    const data = seed();
    const m = memoryDatabase({ ...data, lineItem: [{ ...data.lineItem[0], rfqStatus: "approved", assigneeId }] });
    const result = await createLineItemPricing(m.db, effects).change("item", { kind: "status", rfqStatus: "needs_pricing" });
    assert.equal(result.item.assigneeId, assigneeId);
  }
});
