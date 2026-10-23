import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import { PrismaClient } from "@prisma/client";
import { requireTestDatabase } from "../src/lib/environmentMode";
import { syncRecordNotifications } from "../src/lib/notifications";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/session";

async function main() {
  const url = new URL(requireTestDatabase());
  const resolver = new Resolver(); resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  url.hostname = (await resolver.resolve4(url.hostname))[0];
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  const started = Date.now();
  const prefix = `qa_stage_handoff_${started}`;
  const reports: { step: string | null; assignee: string | null; milliseconds: number }[] = [];
  try {
    const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
    const idFor = (name: string) => users.find(user => user.name === name)!.id;
    const herman = idFor("Herman Freund"), chaim = idFor("Chaim Schwartz"), billing = idFor("Mrs Golderberger"), sam = idFor("Sam Freund"), creator = idFor("Joseph Castillo");
    const company = await db.company.create({ data: { id: `${prefix}_company`, name: "[LOAD TEST] Stage handoff customer", type: "customer", requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 } });
    const deal = await db.opportunity.create({ data: { id: `${prefix}_deal`, title: "[LOAD TEST] Automatic stage handoffs", stage: "estimating", companyId: null, salespersonId: creator, createdById: creator, neededByDate: new Date(), lineItems: { create: { id: `${prefix}_item`, name: "[LOAD TEST] Stage handoff oven", qty: 1, rfqStatus: "needs_pricing" } } } });
    let orderId: string | null = null;
    async function check(step: string | null, assignee: string | null, alreadySynced = false) {
      const before = performance.now();
      const kind = orderId ? "order" : "opportunity", id = orderId ?? deal.id;
      if (!alreadySynced) await syncRecordNotifications(db, kind, id);
      const row = orderId ? await db.order.findUniqueOrThrow({ where: { id } }) : await db.opportunity.findUniqueOrThrow({ where: { id } });
      assert.equal(row.courtStep, step); assert.equal(row.courtAssigneeId, assignee);
      const state = await db.notificationState.findUniqueOrThrow({ where: { key: `${kind}:${id}` } });
      assert.deepEqual((state.snapshot as { recipients: string[] }).recipients, assignee ? [assignee] : []);
      if (assignee) {
        const notice = await db.notification.findFirst({ where: { userId: assignee, eventKey: { startsWith: `${kind}:${id}:${state.version}:` } } });
        assert.ok(notice, `No current handoff notice for ${step}`);
      }
      if (orderId) assert.equal((await db.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).courtAssigneeId, assignee);
      const count = await db.notification.count({ where: { eventKey: { startsWith: `${kind}:${id}:` } } });
      await syncRecordNotifications(db, kind, id);
      assert.equal(await db.notification.count({ where: { eventKey: { startsWith: `${kind}:${id}:` } } }), count);
      reports.push({ step, assignee: users.find(user => user.id === assignee)?.name ?? null, milliseconds: Math.round(performance.now() - before) });
      console.log(`Passed ${step ?? "completed"}: ${reports.at(-1)!.assignee ?? "unassigned"}`);
    }
    await check("sales", herman);
    await db.opportunity.update({ where: { id: deal.id }, data: { companyId: company.id } });
    await check("pricing", chaim);
    // Exercise the actual authenticated RFQ endpoint, including its automatic audit/handoff hook.
    const token = await createSessionToken(creator);
    const response = await fetch(`http://127.0.0.1:3001/api/line-items/${prefix}_item/rfq-status`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE_NAME}=${token}`, Origin: "http://127.0.0.1:3001" }, body: JSON.stringify({ rfqStatus: "approved", source: "deal" }) });
    assert.equal(response.status, 200, await response.text());
    await check("clientQuote", chaim, true);
    await db.opportunity.update({ where: { id: deal.id }, data: { clientQuoteCreated: true, clientQuoteSent: true } });
    await check("close", creator);
    await db.opportunity.update({ where: { id: deal.id }, data: { salespersonId: herman } });
    await check("close", herman);
    assert.equal((await db.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).createdById, creator);
    await db.opportunity.update({ where: { id: deal.id }, data: { stage: "won" } });
    const order = await db.order.create({ data: { id: `${prefix}_order`, title: deal.title, companyId: company.id, opportunityId: deal.id, ownerId: herman, createdById: creator, orderValue: 100, depositRequired: 30, status: "awaiting_payment" } });
    orderId = order.id;
    await db.lineItem.update({ where: { id: `${prefix}_item` }, data: { orderId } });
    await check("deposit", billing);
    const payment = await db.payment.create({ data: { orderId, type: "full", amount: 100, status: "paid" } });
    await db.order.update({ where: { id: orderId }, data: { status: "payment_received" } });
    await check("pos", chaim);
    const po = await db.purchaseOrder.create({ data: { orderId, poNumber: `${prefix}_PO`, status: "shipped" } });
    const delivery = await db.delivery.create({ data: { orderId, purchaseOrderId: po.id, status: "in_transit" } });
    await db.lineItem.update({ where: { id: `${prefix}_item` }, data: { purchaseOrderId: po.id, deliveryId: delivery.id } });
    await db.order.update({ where: { id: orderId }, data: { status: "in_transit" } });
    await check("delivery", sam);
    await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "received" } });
    await db.delivery.update({ where: { id: delivery.id }, data: { status: "delivered_full" } });
    await db.lineItem.update({ where: { id: `${prefix}_item` }, data: { deliveryStatus: "arrived_complete" } });
    await db.order.update({ where: { id: orderId }, data: { status: "delivered" } });
    await check("service", chaim);
    await db.payment.delete({ where: { id: payment.id } });
    await db.order.update({ where: { id: orderId }, data: { status: "awaiting_payment" } });
    await check("deposit", billing);
    await db.payment.create({ data: { orderId, type: "full", amount: 100, status: "paid" } });
    await db.order.update({ where: { id: orderId }, data: { status: "complete" } });
    await check(null, null);
    // Leave the sample open in Close Out for client review.
    await db.order.update({ where: { id: orderId }, data: { status: "delivered" } });
    await check("service", chaim);
    const emailJobs = await db.notificationEmail.count({ where: { notification: { eventKey: { contains: prefix } } } });
    assert.equal(emailJobs, 0, "QA fixtures must never create outgoing email jobs");
    await mkdir("qa-reports/stage-assignments", { recursive: true });
    await writeFile("qa-reports/stage-assignments/verification.json", JSON.stringify({ orderId, dealId: deal.id, reports, emailJobs, elapsedMs: Date.now() - started }, null, 2));
    console.log(`Verified all handoffs; 0 email jobs. Review /records/${orderId}`);
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
