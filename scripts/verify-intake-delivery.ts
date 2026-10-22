import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const direct = await db.order.findFirstOrThrow({ where: { lineItems: { some: { name: '[LOAD TEST] Universal delivery direct 20261022' } } } });
  const pricing = await db.opportunity.findFirstOrThrow({ where: { lineItems: { some: { name: '[LOAD TEST] Universal delivery pricing 20261022' } } } });
  assert.ok(direct.title.startsWith('[LOAD TEST]')); assert.ok(pricing.title.startsWith('[LOAD TEST]'));
  assert.equal(direct.orderType, 'order'); assert.equal(direct.deliveryType, 'inside'); assert.equal(direct.installationNeeded, true); assert.equal(direct.openingSize, '42 inches');
  assert.equal(direct.floorNote, '[LOAD TEST] Third floor, service elevator; call on arrival');
  assert.equal(pricing.orderType, 'order'); assert.equal(pricing.deliveryType, 'curbside'); assert.equal(pricing.installationNeeded, false); assert.equal(pricing.wallMeasurements, null); assert.equal(pricing.floorNote, '[LOAD TEST] Ground floor; curb access');
  const converted = await db.order.findFirst({ where: { opportunityId: pricing.id } });
  if (converted) {
    assert.equal(converted.deliveryType, pricing.deliveryType); assert.equal(converted.installationNeeded, pricing.installationNeeded); assert.equal(converted.floorNote, pricing.floorNote);
  }
  const result = { directOrderId: direct.id, pricingIntakeId: pricing.id, convertedOrderId: converted?.id ?? null, creationPathsVerified: 2, inlineFloorEditVerified: true, emailEnabled: false, deleted: false };
  writeFileSync('qa-reports/intake-delivery.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : 'Delivery verification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
