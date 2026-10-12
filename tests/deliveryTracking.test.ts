import test from "node:test";
import assert from "node:assert/strict";
import { manufacturerShipmentStatus } from "../src/app/deliveries/_ui";

function shipment(mode: string, statuses: string[], status = "pending") {
  return manufacturerShipmentStatus({ mode, status, lineItems: statuses.map(deliveryStatus => ({ deliveryStatus })) });
}

test("HSS stock has no manufacturer shipment", () => {
  assert.equal(shipment("hss_to_customer", ["in_transit_to_client"], "in_transit"), null);
});

test("distinguishes manufacturer transit from the later HSS to customer leg", () => {
  assert.equal(shipment("manufacturer_to_hss_to_customer", ["in_transit_to_hss"], "in_transit"), "Manufacturer in transit");
  assert.equal(shipment("manufacturer_to_hss_to_customer", ["in_transit_to_client"], "in_transit"), "Arrived at HSS");
  assert.equal(shipment("manufacturer_to_customer", ["in_transit_to_client"], "in_transit"), "Manufacturer in transit");
});

test("mixed shipment progress is never reported as wholly shipped or received", () => {
  assert.equal(shipment("manufacturer_to_hss_to_customer", ["ordered", "in_transit_to_hss"]), "Partially shipped");
  assert.equal(shipment("manufacturer_to_hss_to_customer", ["ordered", "in_transit_to_client"]), "Partially received");
  assert.equal(shipment("manufacturer_to_customer", ["backordered", "backordered"]), "Backordered");
});

test("partial customer delivery does not imply partial manufacturer receipt", () => {
  assert.equal(shipment("manufacturer_to_hss_to_customer", ["in_transit_to_client", "arrived_complete"], "delivered_partial"), "Arrived at HSS");
});

test("saved delivery completion takes precedence over stale item tracking", () => {
  assert.equal(shipment("manufacturer_to_customer", ["ordered"], "delivered_full"), "Shipment complete");
  assert.equal(shipment("manufacturer_to_customer", ["ordered"], "delivered_partial"), "Partially delivered");
});

test("without item tracking an in-transit leg does not claim a manufacturer position", () => {
  assert.equal(shipment("manufacturer_to_hss_to_customer", [], "in_transit"), "In transit");
  assert.equal(shipment("manufacturer_to_customer", []), "Awaiting shipment");
});
