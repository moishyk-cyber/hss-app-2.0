import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
 assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
 const parent = await db.order.findUniqueOrThrow({ where: { id: 'cmvjqu2420001rquxy82hpf08' } });
 assert.ok(parent.title.startsWith('[LOAD TEST]'));
 const order = await db.order.upsert({ where: { id: 'qa_payment_terms_20261022' }, update: {}, create: {
  id: 'qa_payment_terms_20261022', title: '[LOAD TEST] Custom payment terms 20261022', companyId: parent.companyId, ownerId: parent.ownerId, orderType: 'order', orderValue: 1000, status: 'payment_received',
  deliveryAddress: parent.deliveryAddress, intakeDeliveryAddress: parent.intakeDeliveryAddress, intakeLocationName: parent.intakeLocationName, neededByDate: new Date('2026-11-21'),
  notes: '[LOAD TEST] Synthetic payment rules QA. Do not contact, bill or fulfill.',
  payments: { create: { type: 'deposit', amount: 300, status: 'paid', date: new Date('2026-10-22'), notes: '[LOAD TEST] Synthetic payment; no money was collected.' } },
  lineItems: { create: { id: 'qa_payment_terms_20261022_item', name: '[LOAD TEST] Payment gate item', qty: 1, rfqStatus: 'approved' } },
 } });
 await db.order.upsert({ where: { id: 'qa_terms_unpriced_20261022' }, update: {}, create: {
  id: 'qa_terms_unpriced_20261022', title: '[LOAD TEST] Payment terms without initial total', companyId: parent.companyId, ownerId: parent.ownerId, orderType: 'order', status: 'awaiting_payment', orderValue: null,
  deliveryAddress: parent.deliveryAddress, intakeDeliveryAddress: parent.intakeDeliveryAddress, neededByDate: new Date('2026-11-21'), notes: '[LOAD TEST] Price and custom terms QA. Do not contact, bill or fulfill.',
  lineItems: { create: { name: '[LOAD TEST] Unpriced payment terms item', qty: 1, rfqStatus: 'approved' } },
 } });
 const deal = await db.opportunity.upsert({ where: { id: 'qa_terms_close_20261022' }, update: {}, create: {
  id: 'qa_terms_close_20261022', title: '[LOAD TEST] Automatic terms at confirmation', companyId: parent.companyId, salespersonId: parent.ownerId, orderType: 'order', value: 1000, stage: 'estimating', needsPricing: false, clientQuoteCreated: true, clientQuoteSent: true, neededByDate: new Date('2026-11-21'), deliveryAddress: parent.deliveryAddress, locationName: parent.intakeLocationName,
  lineItems: { create: { name: '[LOAD TEST] Confirmation payment terms item', qty: 1, rfqStatus: 'approved' } },
 } });
 console.log(JSON.stringify({ orderId: order.id, dealId: deal.id, deleted: false, emailsSent: 0 }));
}
main().catch(error => { console.error('Could not prepare payment terms QA fixtures.', error.name, error.code ?? ''); process.exitCode=1; }).finally(() => db.$disconnect());
