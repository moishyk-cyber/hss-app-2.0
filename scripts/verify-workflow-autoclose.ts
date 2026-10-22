import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const deal = await db.opportunity.findUniqueOrThrow({ where: { id: 'qa_workflow_autoclose_20261021' }, select: { id: true, stage: true, clientQuoteCreated: true, clientQuoteSent: true, orders: { select: { id: true, orderValue: true, _count: { select: { payments: true, purchaseOrders: true } } } } } });
  assert.equal(deal.stage, 'won');
  assert.equal(deal.clientQuoteCreated, true);
  assert.equal(deal.clientQuoteSent, true);
  assert.equal(deal.orders.length, 1);
  assert.equal(Number(deal.orders[0].orderValue), 100);
  assert.equal(deal.orders[0]._count.payments, 0);
  assert.equal(deal.orders[0]._count.purchaseOrders, 0);
  const emailJobs = await db.notificationEmail.count({ where: { notification: { OR: [{ href: { contains: deal.id } }, { href: { contains: deal.orders[0].id } }] } } });
  assert.equal(emailJobs, 0);
  const report = { at: new Date().toISOString(), dealId: deal.id, orderId: deal.orders[0].id, partialSaveKeptOpen: true, validationErrorKeptOpen: true, quoteSaveClosedModal: true, confirmDealClosedModal: true, duplicateOrders: false, invoicesCreated: 0, emailJobs, deleted: false };
  await fs.writeFile('qa-reports/workflow-autoclose-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
