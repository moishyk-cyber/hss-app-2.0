import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const targets = [
    { opportunityId: 'qa_rfq_browser_20261021' },
    { orderId: 'qaapp_mvhczst6_scale_order_1200' },
  ];
  const parent = await db.opportunity.findUniqueOrThrow({ where: { id: targets[0].opportunityId } });
  assert.ok(parent.title.startsWith('[LOAD TEST]'));
  if (!parent.notes) await db.opportunity.update({ where: { id: parent.id }, data: { notes: '[LOAD TEST] Notes for the team: confirm site access and final dimensions with the customer before placing the order.' } });
  await db.lineItem.upsert({ where: { id: 'qa_intake_details_rfq_20261022_item' }, update: { moreDetails: '[LOAD TEST] Brand/model notes: stainless finish, left-hand hinge. Confirm dimensions before ordering. Ask the supplier to confirm electrical requirements, installation clearance, and the expected delivery window before the team proceeds with purchasing.' }, create: { id: 'qa_intake_details_rfq_20261022_item', opportunityId: parent.id, name: '[LOAD TEST] Brand model visibility', qty: 1, rfqStatus: 'rfq_sent', brand: 'QA Brand', sku: 'QA-220', moreDetails: '[LOAD TEST] Brand/model notes: stainless finish, left-hand hinge.\nConfirm dimensions before ordering.' } });
  for (const where of targets) {
    const item = await db.lineItem.findFirstOrThrow({ where: { ...where, id: { not: 'qa_intake_details_rfq_20261022_item' } }, include: { opportunity: true, order: true } });
    assert.ok((item.opportunity?.title ?? item.order?.title)?.startsWith('[LOAD TEST]'));
    await db.lineItem.update({ where: { id: item.id }, data: { brand: 'QA Brand', sku: 'QA-220', moreDetails: '[LOAD TEST] Brand/model notes: stainless finish, left-hand hinge.\nConfirm dimensions before ordering.' } });
    console.log(JSON.stringify({ item: item.id, updated: 'Labeled brand/model display fixture', emailsSent: 0 }));
  }
}
main().catch(() => { console.error('Could not prepare labeled item details fixtures'); process.exitCode = 1; }).finally(() => db.$disconnect());
