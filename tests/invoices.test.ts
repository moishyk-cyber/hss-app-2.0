import test from "node:test";
import assert from "node:assert/strict";
import { billingToday, invoiceOverdue, parseInvoiceDueDate } from "../src/lib/invoices";
import { invoiceQuery, loadInvoiceCollection } from "../src/app/invoices/data";
import type { Prisma } from "@prisma/client";

test("invoice status windows preserve filters and include paid records beyond a busy pending queue", async () => {
  const where: Prisma.PaymentWhereInput = { type: "deposit" };
  const statuses: string[] = [];
  const result = await loadInvoiceCollection(async condition => {
    if (condition === where) return [{ id: "pending-1" }, { id: "pending-2" }];
    const clauses = condition.AND as Prisma.PaymentWhereInput[];
    assert.deepEqual(clauses[0], where);
    return (clauses[1].id as { in: string[] }).in.map(id => ({ id }));
  }, where, 1, async condition => {
    if (condition === where) return [{ id: "initial-1" }, { id: "initial-2" }];
    const clauses = condition.AND as Prisma.PaymentWhereInput[];
    assert.deepEqual(clauses[0], where);
    const status = String(clauses[1].status);
    statuses.push(status);
    return [{ id: status }, { id: `${status}-older` }];
  });
  assert.deepEqual(new Set(statuses), new Set(["pending", "invoiced", "paid"]));
  assert.equal(result.rows.length, 3);
  assert.equal(result.hasMore, true);
});

test("due dates reject invalid calendar days and support clearing", () => {
  assert.equal(parseInvoiceDueDate("2026-02-30"), undefined);
  assert.equal(parseInvoiceDueDate("2026-13-01"), undefined);
  assert.equal(parseInvoiceDueDate("not a date"), undefined);
  assert.equal(parseInvoiceDueDate(""), null);
  assert.equal(parseInvoiceDueDate("2028-02-29")?.toISOString(), "2028-02-29T00:00:00.000Z");
});

test("overdue excludes today's due dates, paid invoices, and missing dates", () => {
  for (const status of ["pending", "invoiced"]) {
    assert.equal(invoiceOverdue(status, "2026-10-07", "2026-10-08"), true);
    assert.equal(invoiceOverdue(status, "2026-10-08", "2026-10-08"), false);
    assert.equal(invoiceOverdue(status, "2026-10-09", "2026-10-08"), false);
  }
  assert.equal(invoiceOverdue("paid", "2026-10-07", "2026-10-08"), false);
  assert.equal(invoiceOverdue("pending", null, "2026-10-08"), false);
  assert.equal(billingToday(new Date("2026-10-08T01:00:00Z")), "2026-10-07");
});

test("overdue and customer filters compose before pagination", () => {
  const query = invoiceQuery({ f_attention: "overdue", f_company: "Kitchen", f_type: "deposit" }, "2026-10-08");
  assert.equal(query.where.type, "deposit");
  assert.deepEqual(query.where.AND, [
    { order: { company: { name: { contains: "Kitchen", mode: "insensitive" } } } },
    { status: { not: "paid" }, dueDate: { lt: new Date("2026-10-08T00:00:00Z") } },
  ]);
});

test("nested billing queues retain AND/OR semantics and exclude paid from overdue", () => {
  const filter_tree = JSON.stringify({ id: "root", logic: "OR", children: [
    { id: "overdue", field: "attention", operator: "is", value: "overdue" },
    { id: "pending", field: "status", operator: "is", value: "pending" },
  ] });
  const query = invoiceQuery({ filter_tree, sort: "dueDate:desc" }, "2026-10-08");
  assert.deepEqual(query.where.AND, [{ OR: [
    { status: { not: "paid" }, dueDate: { lt: new Date("2026-10-08T00:00:00Z") } },
    { status: "pending" },
  ] }]);
  assert.deepEqual(query.orderBy[0], { dueDate: { sort: "desc", nulls: "last" } });
});
