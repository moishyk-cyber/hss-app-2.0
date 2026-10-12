import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { validateServiceIssueLinks, type ServiceIssueLinks } from "../src/lib/serviceIssueLinks";

const links: ServiceIssueLinks = {
  companyId: "business-1", locationId: "location-1", orderId: "order-1", lineItemId: "item-1",
};
const records = {
  company: { id: "business-1" },
  location: { companyId: "business-1" },
  order: { companyId: "business-1", locationId: "location-1" as string | null },
  lineItem: { orderId: "order-1" },
};
function database(overrides: Partial<{ [K in keyof typeof records]: typeof records[K] | null }> = {}) {
  return Object.fromEntries(Object.entries({ ...records, ...overrides }).map(([key, record]) => [
    key, { findUnique: async () => record },
  ])) as unknown as PrismaClient;
}

for (const field of Object.keys(links) as (keyof ServiceIssueLinks)[]) {
  test(`requires ${field} before any database lookup`, async () => {
    const db = {} as PrismaClient;
    assert.ok(await validateServiceIssueLinks({ ...links, [field]: null }, db));
    assert.ok(await validateServiceIssueLinks({ ...links, [field]: "  " }, db));
  });
}

test("accepts a complete path from business through location and order to item", async () => {
  assert.equal(await validateServiceIssueLinks(links, database()), null);
});

test("requires a ticket location even when the order has no recorded location", async () => {
  const db = database({ order: { companyId: "business-1", locationId: null } });
  assert.equal(await validateServiceIssueLinks(links, db), null);
  assert.ok(await validateServiceIssueLinks({ ...links, locationId: null }, db));
});

for (const record of Object.keys(records) as (keyof typeof records)[]) {
  test(`rejects a missing ${record} record`, async () => {
    assert.match((await validateServiceIssueLinks(links, database({ [record]: null })))!, /could not be found/);
  });
}

test("rejects a location belonging to another business", async () => {
  assert.match((await validateServiceIssueLinks(links, database({ location: { companyId: "business-2" } })))!, /different business/);
});

test("rejects an order belonging to another business", async () => {
  assert.match((await validateServiceIssueLinks(links, database({ order: { companyId: "business-2", locationId: "location-1" } })))!, /different business/);
});

test("rejects an order belonging to another location", async () => {
  assert.match((await validateServiceIssueLinks(links, database({ order: { companyId: "business-1", locationId: "location-2" } })))!, /different location/);
});

test("rejects an item belonging to another order", async () => {
  assert.match((await validateServiceIssueLinks(links, database({ lineItem: { orderId: "order-2" } })))!, /different order/);
});
