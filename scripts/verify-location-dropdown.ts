import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const direct = await db.order.findUniqueOrThrow({ where: { id: 'cmvjqu2420001rquxy82hpf08' } });
  assert.equal(direct.deliveryAddress, '100 QA Test Street, Test City'); assert.equal(direct.intakeDeliveryAddress, direct.deliveryAddress);
  const converted = await db.order.findFirstOrThrow({ where: { opportunityId: 'qa_destination_close_20261022' } });
  assert.equal(converted.locationId, 'qa_delivery_dropdown_alt_20261022'); assert.equal(converted.deliveryAddress, '[LOAD TEST] 222 Alternate Road, Test City');
  assert.equal(converted.intakeDeliveryAddress, '100 QA Test Street, Test City');
  const result = { directOrderId: direct.id, confirmedOrderId: converted.id, originalIntakeAddressPreserved: true, confirmationSavedSelectedLocation: true, directOrderRestoredToIntake: true, emailsEnabled: false, deleted: false };
  writeFileSync('qa-reports/location-dropdown.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : 'Location dropdown verification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
