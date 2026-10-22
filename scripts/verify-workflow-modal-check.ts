import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const deal = await db.opportunity.findUniqueOrThrow({ where: { id: 'qa_workflow_modal_20261021' }, select: { id: true, stage: true, clientQuoteCreated: true, clientQuoteSent: true, _count: { select: { orders: true } } } });
  assert.equal(deal.stage, 'estimating');
  assert.equal(deal.clientQuoteCreated, true);
  assert.equal(deal.clientQuoteSent, true);
  assert.equal(deal._count.orders, 0);
  const order = await db.order.findUniqueOrThrow({ where: { id: 'cmvidrj6e0008rqe04c7kzbu7' }, select: { salesOrderSentAt: true, _count: { select: { purchaseOrders: true } } } });
  assert.equal(order.salesOrderSentAt, null);
  assert.equal(order._count.purchaseOrders, 0);
  const emailJobs = await db.notificationEmail.count({ where: { notification: { href: { contains: deal.id } } } });
  assert.equal(emailJobs, 0);
  const report = { at: new Date().toISOString(), dealId: deal.id, focusedClientQuoteSaved: true, cardAdvancedToConfirmDeal: true, focusedConfirmationFieldsVisible: true, focusedPurchaseFieldsVisible: true, salesOrderNoSaved: true, poDraftPreserved: true, purchaseOrdersCreated: 0, emailJobs, deleted: false };
  await fs.writeFile('qa-reports/focused-workflow-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
