import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const order = await db.order.findUniqueOrThrow({ where: { id: 'cmvjqu2420001rquxy82hpf08' }, include: { company: { include: { locations: true } } } });
  assert.ok(order.title.startsWith('[LOAD TEST]')); assert.ok(order.company?.name.startsWith('[LOAD TEST]'));
  const alternate = await db.location.upsert({ where: { id: 'qa_delivery_dropdown_alt_20261022' }, update: {}, create: { id: 'qa_delivery_dropdown_alt_20261022', companyId: order.companyId!, name: '[LOAD TEST] Alternate site', address: '[LOAD TEST] 222 Alternate Road, Test City' } });
  const original = order.company!.locations.find(location => location.address === order.intakeDeliveryAddress)!;
  assert.ok(original);
  const id = 'qa_destination_close_20261022';
  const deal = await db.opportunity.upsert({ where: { id }, update: {}, create: { id, title: '[LOAD TEST] Location dropdown confirmation', companyId: order.companyId, locationId: original.id, locationName: original.name, deliveryAddress: original.address, salespersonId: order.ownerId, orderType: 'order', stage: 'estimating', needsPricing: false, clientQuoteCreated: true, clientQuoteSent: true, value: 100, neededByDate: new Date('2026-11-21'), lineItems: { create: { id: `${id}_item`, name: '[LOAD TEST] Location dropdown item', qty: 1, rfqStatus: 'approved' } } } });
  const delivery = await db.delivery.findFirst({ where: { order: { title: { startsWith: '[LOAD TEST]' } }, mode: { in: ['hss_to_customer', 'manufacturer_to_hss_to_customer'] } }, select: { id: true, orderId: true } });
  const result = { directOrderId: order.id, alternateLocationId: alternate.id, closeIntakeId: deal.id, originalAddress: order.intakeDeliveryAddress, delivery, deleted: false, emailsSent: 0 };
  writeFileSync('qa-reports/location-dropdown-fixtures.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
main().catch(() => { console.error('Could not prepare labeled location fixtures'); process.exitCode = 1; }).finally(() => db.$disconnect());
