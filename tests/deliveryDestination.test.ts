import test from "node:test";
import assert from "node:assert/strict";
import { deliveryDestination } from "../src/lib/deliveryDestination";

test("the intake/order destination wins over a business location's different address", () => {
  assert.deepEqual(deliveryDestination({ companyId: "client", deliveryAddress: "  123 Intake Street  ", location: { name: "Kitchen", address: "456 Other Street" } }), { location: "Kitchen", address: "123 Intake Street" });
});
test("saved locations supply the destination when an older order has no address snapshot", () => {
  assert.deepEqual(deliveryDestination({ companyId: "client", deliveryAddress: null, location: { name: "Kitchen", address: "123 Intake Street" } }), { location: "Kitchen", address: "123 Intake Street" });
});
test("unsaved intake location names remain visible without leaking a previous client's location", () => {
  const order = { companyId: "client", deliveryAddress: "123 Intake Street", opportunity: { companyId: "client", locationName: "Intake kitchen" } };
  assert.equal(deliveryDestination(order).location, "Intake kitchen");
  assert.equal(deliveryDestination({ ...order, companyId: "new-client" }).location, null);
  assert.deepEqual(deliveryDestination({ companyId: null, deliveryAddress: null }), { location: null, address: null });
});
