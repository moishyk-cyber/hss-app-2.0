import test from 'node:test';
import assert from 'node:assert/strict';
import { readPaymentPlan, paymentPlanAmounts, type PaymentPlan } from '../src/lib/paymentTerms';
import { evaluatePaymentGate } from '../src/lib/flowRules';
import { verifiedPaymentInterpretation, signPaymentInterpretation, interpretPaymentTerms } from '../src/lib/interpretPaymentTerms';
import { logPurchaseOrder } from '../src/lib/workflows/purchaseOrders';
import { memoryDatabase, fixture } from './memoryDatabase';
const plan: PaymentPlan = { status: 'ready', purchaseRequirement: 'milestones', milestones: [{ basis: 'percent', value: 30, event: 'before_purchase', days: null, date: null }, { basis: 'balance', value: null, event: 'before_delivery', days: null, date: null }], questions: [] };
const order = { orderType: 'order', orderValue: 1000, company: { requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 }, payments: [{ status: 'paid', amount: 300 }] };
test('standard orders and projects unlock purchasing on the account deposit, not full payment', () => {
 for (const orderType of ['order', 'project']) {
  assert.equal(evaluatePaymentGate({ ...order, orderType }).open, true);
  assert.equal(evaluatePaymentGate({ ...order, orderType, payments: [{ status: 'paid', amount: 299.99 }] }).open, false);
 }
});
test('custom terms override both the default percentage and a no-deposit account', () => {
 const full: PaymentPlan = { ...plan, milestones: [{ ...plan.milestones[0], value: 100 }] };
 assert.equal(evaluatePaymentGate({ ...order, company: { requiresDeposit: false, paymentTermsConfigured: true, depositPercent: 0 }, paymentPlan: full }).open, false);
 assert.equal(evaluatePaymentGate({ ...order, paymentPlan: plan, depositRequired: 1000 }).requiredTotal, 300);
 assert.equal(evaluatePaymentGate({ ...order, paymentPlan: { invalid: true } }).open, false);
});
test('payment in full on a deal overrides the customer 30 percent deposit default', () => {
 const full: PaymentPlan = { ...plan, milestones: [{ ...plan.milestones[0], value: 100 }] };
 for (const orderType of ['order', 'project']) {
  const deal = { ...order, orderType, paymentPlan: full, depositRequired: 300 };
  const gate = evaluatePaymentGate(deal);
  assert.equal(gate.requiredTotal, 1000);
  assert.equal(gate.shortfall, 700);
  assert.equal(gate.open, false);
  assert.equal(evaluatePaymentGate({ ...deal, payments: [{ status: 'paid', amount: 1000 }] }).open, true);
  assert.equal(evaluatePaymentGate({ ...order, orderType }).requiredTotal, 300);
 }
});
test('agreed legacy deposit also takes precedence over account exemption', () => {
 assert.equal(evaluatePaymentGate({ ...order, company: { requiresDeposit: false, paymentTermsConfigured: true, depositPercent: 0 }, payments: [], depositRequired: 200 }).open, false);
});
test('milestones retain the balance and calculate cents deterministically', () => {
 assert.deepEqual(paymentPlanAmounts(plan, 1234.56), { requiredBeforePurchase: 370.37, amounts: [370.37, 864.19] });
 const fixed: PaymentPlan = { ...plan, milestones: [{ ...plan.milestones[0], basis: 'fixed', value: 200 }, plan.milestones[1]] };
 assert.equal(paymentPlanAmounts(fixed, 1000).requiredBeforePurchase, 200);
 assert.throws(() => paymentPlanAmounts(fixed, 100), /add up/);
 assert.equal(evaluatePaymentGate({ ...order, orderValue: null, paymentPlan: plan }).open, false);
});
test('explicit payment after delivery permits purchasing without pretending an invoice was paid', () => {
 const deferred: PaymentPlan = { status: 'ready', purchaseRequirement: 'none', milestones: [{ basis: 'percent', value: 100, event: 'after_delivery', days: 30, date: null }], questions: [] };
 const gate = evaluatePaymentGate({ ...order, payments: [], paymentPlan: deferred });
 assert.equal(gate.open, true); assert.equal(gate.exempt, true); assert.equal(gate.paidTotal, 0);
});
test('invalid or contradictory schedules cannot become executable payment terms', () => {
 assert.equal(readPaymentPlan({ ...plan, milestones: [{ ...plan.milestones[0], value: 130 }] }), null);
 assert.equal(readPaymentPlan({ ...plan, purchaseRequirement: 'none' }), null);
 assert.equal(readPaymentPlan({ ...plan, milestones: [plan.milestones[0]] }), null);
 assert.equal(readPaymentPlan({ ...plan, milestones: [{ ...plan.milestones[0], event: 'after_invoice', days: null }] }), null);
 assert.equal(readPaymentPlan({ ...plan, questions: ['Which invoice?'] }), null);
 const unclear: PaymentPlan = { status: 'needs_clarification', purchaseRequirement: 'unclear', milestones: [], questions: ['What starts the 30 days?'] };
 assert.equal(readPaymentPlan(unclear)?.status, 'needs_clarification');
 assert.equal(evaluatePaymentGate({ ...order, paymentPlan: unclear }).open, false);
});
test('signed conversion cannot be reused after editing the terms, tampered with, or supplied unsigned', () => {
 process.env.SESSION_SECRET = 'payment-terms-test-secret';
 const token = signPaymentInterpretation('30% upfront, balance before delivery', plan);
 assert.deepEqual(verifiedPaymentInterpretation('30% upfront, balance before delivery', token).plan, plan);
 assert.throws(() => verifiedPaymentInterpretation('0% upfront', token));
 assert.throws(() => verifiedPaymentInterpretation('30% upfront, balance before delivery', token + 'x'));
 assert.throws(() => verifiedPaymentInterpretation('30% upfront, balance before delivery', JSON.stringify(plan)));
});
test('Anthropic uses structured output and rejects incomplete output without unlocking anything', async () => {
 process.env.ANTHROPIC_API_KEY = 'test-key';
 let body: Record<string, unknown> = {};
 const transport = (async (_url: unknown, init: RequestInit) => { body = JSON.parse(String(init.body)); return Response.json({ stop_reason: 'max_tokens', content: [{ type: 'text', text: JSON.stringify(plan) }] }); }) as typeof fetch;
 await assert.rejects(interpretPaymentTerms('unique incomplete terms', transport), /incomplete/);
 assert.ok(body.output_config); assert.equal(body.tools, undefined);
 const valid = (async () => Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(plan) }] })) as typeof fetch;
 assert.deepEqual(await interpretPaymentTerms('unique validated terms', valid), plan);
});
test('the actual PO mutation accepts a paid deposit on a standard order and rejects a one-cent shortfall', async () => {
 for (const paid of [300, 299.99]) {
  const seed = fixture();
  const db = memoryDatabase({ ...seed, order: [{ ...seed.order[0], orderType: 'order', orderValue: 1000, paymentPlan: plan }], payment: [{ id: 'deposit', orderId: 'order', status: 'paid', amount: paid }], lineItem: [{ ...seed.lineItem[0], orderId: 'order', purchaseOrderId: null }] });
  const input = { orderId: 'order', supplierId: 'supplier', lineItemIds: ['item'], number: 'QA-DEPOSIT' };
  if (paid === 300) assert.equal((await logPurchaseOrder(db.db, input)).poNumber, 'QA-DEPOSIT');
  else { await assert.rejects(logPurchaseOrder(db.db, input), /outstanding/); assert.equal(db.state().lineItem[0].purchaseOrderId, null); }
 }
});

test('percentage schedules conserve every cent and zero-deposit orders appear in purchasing', async () => {
 const split: PaymentPlan = { ...plan, milestones: [{ ...plan.milestones[0], value: 50 }, { ...plan.milestones[0], value: 50, event: 'on_delivery' }] };
 assert.deepEqual(paymentPlanAmounts(split, 0.01).amounts, [0.01, 0]);
 const { orderPhase } = await import('../src/lib/flowRules');
 assert.equal(orderPhase({ ...order, status: 'new', company: { requiresDeposit: false, paymentTermsConfigured: true, depositPercent: 0 }, payments: [], lineItems: [], purchaseOrders: [], deliveries: [] }), 'pos');
});

test('an outstanding invoice does not count toward received money', () => {
 const invoice = { status: 'paid', amount: 100 };
 const input = { ...order, company: { requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 10 }, payments: [invoice] };
 assert.equal(evaluatePaymentGate(input).paidTotal, 100);
 const unpaid = { ...invoice, status: 'invoiced' };
 const gate = evaluatePaymentGate({ ...input, payments: [unpaid] });
 assert.equal(unpaid.amount, 100);
 assert.equal(gate.paidTotal, 0);
 assert.equal(gate.shortfall, 100);
 assert.equal(gate.open, false);
});
