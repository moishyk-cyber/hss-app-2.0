import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { evaluatePaymentGate } from '../src/lib/flowRules';
import { readPaymentPlan } from '../src/lib/paymentTerms';
import { plainMoney } from '../src/lib/money';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
 assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
 const order = plainMoney(await db.order.findUniqueOrThrow({ where: { id: 'qa_payment_terms_20261022' }, include: { company: true, payments: true } }));
 assert.ok(order.title.startsWith('[LOAD TEST]'));
 assert.equal(readPaymentPlan(order.paymentPlan)?.milestones[0].value, 30);
 assert.equal(evaluatePaymentGate(order).requiredTotal, 300); assert.equal(evaluatePaymentGate(order).open, true);
 const confirmed = plainMoney(await db.order.findFirstOrThrow({ where: { opportunityId: 'qa_terms_close_20261022' }, include: { company: true, payments: true } }));
 assert.equal(readPaymentPlan(confirmed.paymentPlan)?.milestones[0].value, 25);
 assert.equal(evaluatePaymentGate(confirmed).requiredTotal, 250); assert.equal(evaluatePaymentGate(confirmed).open, false);
 assert.equal(confirmed.payments.length, 0);
 const audit = await db.activityLog.findFirst({ where: { linkedId: order.id, action: 'terms_updated' }, orderBy: { at: 'desc' } });
 assert.ok(audit?.userId);
 const po = await db.purchaseOrder.findFirst({ where: { orderId: order.id, poNumber: 'QA-TERMS-DEPOSIT-20261022' } });
 assert.ok(po);
 const result = { orderId: order.id, confirmedOrderId: confirmed.id, standardOrderDepositGateOpen: true, browserCreatedPoWithDepositOnly: true, confirmedDepositGateRequired: 250, paidAmount: 300, invoicesCreatedByConversion: 0, emailsEnabled: false, deleted: false };
 writeFileSync('qa-reports/payment-terms.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
main().catch(() => { console.error('Payment terms QA verification failed.'); process.exitCode=1; }).finally(() => db.$disconnect());
