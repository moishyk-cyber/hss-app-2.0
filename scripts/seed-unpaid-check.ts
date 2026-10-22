import { requireTestDatabase } from "../src/lib/environmentMode";
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
try {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const parent = await db.order.findUniqueOrThrow({ where: { id: 'qa_payment_terms_20261022' } });
  assert.ok(parent.title.startsWith('[LOAD TEST]'));
  const order = await db.order.upsert({
    where: { id: 'qa_unpaid_display_20261022' }, update: {},
    create: {
      id: 'qa_unpaid_display_20261022', title: '[LOAD TEST] Unpaid deposit display',
      companyId: parent.companyId, ownerId: parent.ownerId, orderType: 'order', orderValue: 1000, depositRequired: 100, status: 'payment_received',
      deliveryAddress: parent.deliveryAddress, notes: '[LOAD TEST] Synthetic unpaid display QA. Do not bill, contact or fulfill.',
      payments: { create: { type: 'deposit', amount: 100, status: 'paid', date: new Date('2026-10-22'), notes: '[LOAD TEST] Synthetic deposit; no money was collected.' } },
      lineItems: { create: { name: '[LOAD TEST] Unpaid deposit item', qty: 1, rfqStatus: 'approved' } },
    },
  });
  console.log(JSON.stringify({ id: order.id }));
} catch (error) { console.log('QA fixture connection: ' + (error as Error).name); console.log((error as Error).message.split('\n').slice(-3).join(' ')); process.exitCode = 1; }
finally { await db.$disconnect(); }

}
void main();
