import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { loadDeliveryCollection } from "../src/app/deliveries/collectionData";

test("small delivery collections share one snapshot between table and board", async () => {
  let calls = 0;
  const rows = [{ id: "delivery-1" }];
  const result = await loadDeliveryCollection(async () => { calls++; return rows; }, {}, 120);
  assert.equal(calls, 1);
  assert.deepEqual(result, { rows, hasMore: false });
});

test("lane windows keep all five statuses visible and preserve tracking filters and recent-delivery scope", async () => {
  const where: Prisma.DeliveryWhereInput = { AND: [{ trucker: "Andy" }, { OR: [{ status: "in_transit" }, { deliveredAt: { gte: new Date("2026-10-01") } }] }] };
  let fullReads = 0;
  const lanes: string[] = [];
  const result = await loadDeliveryCollection(async conditions => {
    fullReads++;
    if (conditions === where) return [{ id: "pending-1" }, { id: "pending-2" }];
    const clauses = conditions.AND as Prisma.DeliveryWhereInput[];
    assert.deepEqual(clauses[0], where);
    return (clauses[1].id as { in: string[] }).in.map(id => ({ id }));
  }, where, 1, async conditions => {
    if (conditions === where) return [{ id: "initial-1" }, { id: "initial-2" }];
    const clauses = conditions.AND as Prisma.DeliveryWhereInput[];
    assert.deepEqual(clauses[0], where);
    const status = String(clauses[1].status ?? clauses[1].mode);
    lanes.push(status);
    return [{ id: status }, { id: `${status}-older` }];
  });
  assert.equal(fullReads, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.rows.length, 8);
  assert.deepEqual(new Set(lanes), new Set(["pending", "scheduled", "in_transit", "delivered_partial", "delivered_full", "manufacturer_to_customer", "hss_to_customer", "manufacturer_to_hss_to_customer"]));
});

test("Stage groups by workflow progress, regardless of delivery dates", async () => {
  const { deliveryLane, deliveryLanes } = await import("../src/app/deliveries/boardConfig");
  const delivery = { mode: "hss_to_customer", status: "pending", scheduledDeliveryDate: null, expectedDelivery: null };
  assert.equal(deliveryLane(delivery, "stage"), "pending");
  assert.equal(deliveryLane({ ...delivery, status: "scheduled" }, "stage"), "scheduled");
  const withEta = { ...delivery, expectedDelivery: new Date("2026-10-13") };
  const inTransit = { ...delivery, status: "in_transit", scheduledDeliveryDate: new Date("2026-10-13") };
  assert.equal(deliveryLane(withEta, "stage"), "pending");
  assert.equal(deliveryLane(inTransit, "stage"), "in_transit");
  assert.equal(deliveryLane({ ...delivery, status: "delivered_partial" }, "stage"), "delivered_partial");
  assert.equal(deliveryLane({ ...delivery, status: "delivered_full" }, "stage"), "delivered_full");
  assert.equal(deliveryLane(delivery, "mode"), "hss_to_customer");
  assert.deepEqual(deliveryLanes("stage"), deliveryLanes("status"));
  assert.equal(deliveryLanes("stage").length, 5);
});
