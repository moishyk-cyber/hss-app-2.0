import { databaseConnectionUrl } from "../src/lib/environmentMode";
import { PrismaClient } from '@prisma/client';
import { deriveOrderStatus } from '../src/lib/flowRules';
import { plainMoney } from '../src/lib/money';
const db = new PrismaClient({ datasourceUrl: databaseConnectionUrl() });
async function main() {
  // Schema migration is additive. No invoices, terms, payments or notifications are rewritten.
  await db.$executeRawUnsafe('ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentPlan" JSONB');
  const rows = plainMoney(await db.order.findMany({ where: { status: { notIn: ['complete', 'stuck'] } }, select: {
    id: true, status: true, updatedAt: true, orderType: true, orderValue: true, depositRequired: true, paymentPlan: true,
    company: { select: { requiresDeposit: true, depositPercent: true } }, payments: { select: { status: true, amount: true } },
    lineItems: { select: { rfqStatus: true, deliveryStatus: true } }, purchaseOrders: { select: { status: true } }, deliveries: { select: { status: true } },
  } }));
  const groups = new Map<string, { id: string; updatedAt: Date }[]>();
  for (const row of rows) {
    const next = deriveOrderStatus(row);
    if (row.status !== next) groups.set(next, [...(groups.get(next) ?? []), { id: row.id, updatedAt: row.updatedAt }]);
  }
  let updated = 0;
  if (process.argv.includes('--apply')) for (const [status, targets] of groups) for (let start = 0; start < targets.length; start += 100) {
    // An order edited during the migration is left for its own transaction to reconcile.
    updated += (await db.order.updateMany({ where: { OR: targets.slice(start, start + 100), status: { notIn: ['complete', 'stuck'] } }, data: { status } })).count;
  }
  console.log(JSON.stringify({ apply: process.argv.includes('--apply'), scanned: rows.length, changes: Object.fromEntries([...groups].map(([status, rows]) => [status, rows.length])), updated }));
}
main().catch(() => { console.error('Could not reconcile payment workflow statuses.'); process.exitCode = 1; }).finally(() => db.$disconnect());
