import test from "node:test";
import assert from "node:assert/strict";
import { partnerNames, addPartner, renamePartner, rememberPartner, rememberDeliveryPartners, savedPartnerNames } from "../src/lib/workflows/deliveryPartners";
import { serialTransaction } from "../src/lib/workflows/transaction";
import { memoryDatabase, fixture } from "./memoryDatabase";
import { createFulfillment } from "../src/lib/workflows/fulfillment";

test("saved and historical partner names merge without whitespace or case duplicates", () => {
  assert.deepEqual(partnerNames([" UPS ", null, ""], ["ups", "FedEx"]), ["FedEx", "UPS"]);
});

test("shared lists keep carrier and trucker names separate and reuse existing names", async () => {
  const m = memoryDatabase(fixture());
  await serialTransaction(m.db, async tx => {
    await rememberDeliveryPartners(tx, " UPS ", "Andy");
    await rememberDeliveryPartners(tx, "ups", " ANDY ");
  });
  const rows = m.state().appSetting;
  assert.deepEqual(savedPartnerNames(rows.find(r => r.key === "delivery.carriers")?.value as string), ["UPS"]);
  assert.deepEqual(savedPartnerNames(rows.find(r => r.key === "delivery.truckers")?.value as string), ["Andy"]);
  await assert.rejects(serialTransaction(m.db, tx => rememberPartner(tx, "truckers", " ")));
});

test("selecting then clearing a delivery trucker retains the shared name for future deliveries", async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, delivery: [{ id: "leg", orderId: "order", purchaseOrderId: null, trucker: null, status: "pending" }] });
  const fulfillment = createFulfillment(m.db, { audit: async () => {}, refresh: () => {} });
  assert.equal((await fulfillment.setDeliveryTrucker("leg", "Andy")).ok, true);
  assert.equal((await fulfillment.setDeliveryTrucker("leg", "")).ok, true);
  assert.equal(m.state().delivery[0].trucker, null);
  assert.deepEqual(savedPartnerNames(m.state().appSetting[0].value as string), ["Andy"]);
});

test("creating from a delivery picker immediately selects the new name for its chosen type", async () => {
  const m = memoryDatabase({ ...fixture(), delivery: [{ id: "leg", orderId: "order", trucker: "Andy", trackingCarrier: null }] });
  await serialTransaction(m.db, tx => addPartner(tx, "carriers", "Any carrier name", "leg"));
  await serialTransaction(m.db, tx => addPartner(tx, "truckers", "Any trucker name", "leg"));
  assert.equal(m.state().delivery[0].trackingCarrier, "Any carrier name");
  assert.equal(m.state().delivery[0].trucker, "Any trucker name");
});

test("renaming from the table updates shared names and matching deliveries while preserving the other type", async () => {
  const m = memoryDatabase({ ...fixture(), delivery: [{ id: "leg", orderId: "order", trucker: "andy", trackingCarrier: "Andy" }] });
  await serialTransaction(m.db, tx => rememberPartner(tx, "truckers", "ANDY"));
  await serialTransaction(m.db, tx => renamePartner(tx, "truckers", "ANDY", "Andy Transport"));
  assert.equal(m.state().delivery[0].trucker, "Andy Transport");
  assert.equal(m.state().delivery[0].trackingCarrier, "Andy");
  assert.deepEqual(savedPartnerNames(m.state().appSetting[0].value as string), ["Andy Transport"]);
});

test("duplicate renames and unavailable originating deliveries cannot leave partial directory changes", async () => {
  const m = memoryDatabase(fixture());
  await serialTransaction(m.db, async tx => { await rememberPartner(tx, "truckers", "Andy"); await rememberPartner(tx, "truckers", "Bob"); });
  await assert.rejects(serialTransaction(m.db, tx => renamePartner(tx, "truckers", "Andy", "Bob")), /already exists/);
  await assert.rejects(serialTransaction(m.db, tx => addPartner(tx, "truckers", "Missing delivery name", "missing")), /Delivery not found/);
  assert.deepEqual(savedPartnerNames(m.state().appSetting[0].value as string), ["Andy", "Bob"]);
});
