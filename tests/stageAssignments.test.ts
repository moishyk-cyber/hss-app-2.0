import test from "node:test";
import assert from "node:assert/strict";
import { stageAssignee } from "../src/lib/stageAssignments";
import { syncRecordNotifications, initializeStageAssignments } from "../src/lib/notifications";
import { fixture, memoryDatabase } from "./memoryDatabase";

const now = new Date("2026-10-22T12:00:00Z");
const users = [
  { id: "herman", name: "Herman Freund", role: "sales", active: true },
  { id: "chaim", name: "Chaim Schwartz", role: "purchasing", active: true },
  { id: "billing", name: "Mrs Golderberger", role: "billing", active: true },
  { id: "sam", name: "Sam Freund", role: "admin", active: true },
  { id: "creator", name: "Other intake creator", role: "sales", active: true },
  { id: "inactive", name: "Former salesperson", role: "sales", active: false },
];
function seed() {
  const data = fixture();
  return { ...data, user: users,
    appSetting: [{ id: "start", key: "notifications.startedAt", value: "2026-10-01" }],
    opportunity: data.opportunity.map(row => ({ ...row, title: "[LOAD TEST] Automatic stage handoffs", createdAt: now, createdById: "creator", salespersonId: "creator", companyId: null, neededByDate: now, courtStep: null, courtAssigneeId: null, clientQuoteCreated: false, clientQuoteSent: false })),
    order: data.order.map(row => ({ ...row, title: "[LOAD TEST] Stage handoff order", createdAt: now, createdById: "creator", ownerId: "creator", opportunityId: null, courtStep: null, courtAssigneeId: null })),
  };
}

test("all eight defaults resolve one active user, independent of creator and legacy role/multi-person pins", () => {
  const expected = { sales: "herman", pricing: "chaim", clientQuote: "chaim", close: "creator", deposit: "billing", pos: "chaim", delivery: "sam", service: "chaim" };
  for (const [step, id] of Object.entries(expected)) {
    assert.equal(stageAssignee(step as keyof typeof expected, "creator", users, { "court.sales.userIds": "sam,chaim", "court.sales.role": "admin" })?.id, id);
  }
  assert.equal(stageAssignee("pricing", null, users, { "court.pricing.assigneeId": "sam" })?.id, "sam");
  assert.equal(stageAssignee("pricing", null, users, { "court.pricing.assigneeId": "inactive" }), null);
  assert.equal(stageAssignee("pricing", null, [...users, { ...users[1], id: "duplicate" }], {}), null);
  assert.equal(stageAssignee("close", "inactive", users, {}), null);
  assert.equal(stageAssignee("close", null, users, {}), null);
});

test("full workflow updates the persisted assignee and exactly one recipient, including reassignments and payment reversal", async () => {
  const m = memoryDatabase(seed());
  async function check(kind: string, step: string | null, userId: string | null) {
    await syncRecordNotifications(m.db, kind, kind === "order" ? "order" : "deal", now);
    const row = m.state()[kind].find(row => row.id === (kind === "order" ? "order" : "deal"))!;
    assert.equal(row.courtStep, step); assert.equal(row.courtAssigneeId, userId);
    // Locate by the canonical record key rather than the generated state-row ID.
    const snapshot = m.state().notificationState.find(row => row.key === `${kind}:${kind === "order" ? "order" : "deal"}`)!.snapshot as { recipients: string[] };
    assert.deepEqual(snapshot.recipients, userId ? [userId] : []);
    const count = m.state().notification.length;
    await syncRecordNotifications(m.db, kind, kind === "order" ? "order" : "deal", now);
    assert.equal(m.state().notification.length, count, "unchanged saves must not notify again");
    if (kind === "order") assert.equal(m.state().opportunity[0].courtAssigneeId, userId, "linked intake shares the order assignment");
  }
  await check("opportunity", "sales", "herman");
  await m.db.opportunity.update({ where: { id: "deal" }, data: { companyId: "company" } });
  await check("opportunity", "pricing", "chaim");
  await m.db.lineItem.update({ where: { id: "item" }, data: { rfqStatus: "approved" } });
  await check("opportunity", "clientQuote", "chaim");
  await m.db.opportunity.update({ where: { id: "deal" }, data: { clientQuoteCreated: true, clientQuoteSent: true } });
  await check("opportunity", "close", "creator");
  await m.db.opportunity.update({ where: { id: "deal" }, data: { salespersonId: "herman" } });
  await check("opportunity", "close", "herman");
  assert.equal(m.state().opportunity[0].createdById, "creator");
  await m.db.opportunity.update({ where: { id: "deal" }, data: { stage: "won" } });
  await m.db.order.update({ where: { id: "order" }, data: { opportunityId: "deal" } });
  await m.db.lineItem.update({ where: { id: "item" }, data: { orderId: "order", purchaseOrderId: "po" } });
  await m.db.payment.deleteMany({ where: { orderId: "order" } });
  await check("order", "deposit", "billing");
  await m.db.payment.create({ data: { id: "received", orderId: "order", amount: 100, status: "paid", type: "deposit" } });
  await check("order", "pos", "chaim");
  await m.db.purchaseOrder.update({ where: { id: "po" }, data: { status: "shipped" } });
  await check("order", "delivery", "sam");
  await m.db.lineItem.update({ where: { id: "item" }, data: { deliveryStatus: "arrived_complete" } });
  await m.db.purchaseOrder.update({ where: { id: "po" }, data: { status: "received" } });
  await check("order", "service", "chaim");
  await m.db.payment.deleteMany({ where: { orderId: "order" } });
  await check("order", "deposit", "billing");
  await m.db.payment.create({ data: { orderId: "order", amount: 100, status: "paid", type: "deposit" } });
  await m.db.order.update({ where: { id: "order" }, data: { status: "complete" } });
  await check("order", null, null);
  assert.equal(m.state().order[0].ownerId, "creator", "workflow handoffs must preserve sales ownership");
});

test("notification failure rolls back the new assignment as well as the workflow snapshot", async () => {
  const m = memoryDatabase(seed());
  m.fail("notification.createMany");
  await assert.rejects(syncRecordNotifications(m.db, "opportunity", "deal", now));
  assert.equal(m.state().opportunity[0].courtAssigneeId, null);
  m.fail();
  await syncRecordNotifications(m.db, "opportunity", "deal", now);
  assert.equal(m.state().opportunity[0].courtAssigneeId, "herman");
});

test("rollout baseline assigns existing cards without historical alerts", async () => {
  const m = memoryDatabase(seed());
  await initializeStageAssignments(m.db);
  assert.equal(m.state().opportunity[0].courtAssigneeId, "herman");
  assert.equal(m.state().notification?.length ?? 0, 0);
  await syncRecordNotifications(m.db, "opportunity", "deal", now);
  assert.equal(m.state().notification?.length ?? 0, 0);
});
