import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { startOrderSupportingReads } from "../src/app/orders/[id]/supportingData";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function database(issues: Promise<unknown[]>, vendors: Promise<unknown[]>) {
  return {
    company: { findMany: (args: { where: { type: { in: string[] } } }) =>
      args.where.type.in.includes("supplier") ? vendors : Promise.resolve([]) },
    contact: { findMany: () => Promise.resolve([]) },
    serviceIssue: { findMany: () => issues },
    purchaseOrder: { findMany: () => Promise.resolve([]) },
    lineItem: { findMany: () => Promise.resolve([]) },
    delivery: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaClient;
}

test("a slow vendor lookup does not delay service, delivery, or editor data", async () => {
  const vendors = deferred<unknown[]>();
  const issues = deferred<unknown[]>();
  const reads = startOrderSupportingReads("order-1", database(issues.promise, vendors.promise));
  issues.resolve([]);
  // Awaiting any independent section must complete while vendors remain pending.
  await Promise.all([reads.issues, reads.items, reads.deliveries, reads.companies, reads.contacts]);
  let vendorsReady = false;
  void reads.vendors.then(() => { vendorsReady = true; });
  await Promise.resolve();
  assert.equal(vendorsReady, false);
  vendors.resolve([]);
  await reads.vendors;
});

test("a supporting read failure remains visible to its section and other reads complete", async () => {
  const issues = deferred<unknown[]>();
  const reads = startOrderSupportingReads("order-1", database(issues.promise, Promise.resolve([])));
  const failure = new Error("service unavailable");
  issues.reject(failure);
  // Its preload rejection handler must not turn a failure into empty service data.
  await assert.rejects(reads.issues, error => error === failure);
  assert.deepEqual(await reads.vendors, []);
  assert.deepEqual(await reads.deliveries, []);
});
