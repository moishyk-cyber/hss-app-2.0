import test from 'node:test';
import assert from 'node:assert/strict';
import { editInvoiceRecord, deleteInvoiceRecord, invoiceAmountProblem, unpayInvoiceRecord } from '../src/lib/workflows/invoices';
import { fixture, memoryDatabase } from './memoryDatabase';
import { evaluatePaymentGate } from '../src/lib/flowRules';
const expected = { amount: 100, status: 'paid', dueDate: '2026-11-01' };
function setup() {
 const seed = fixture();
 return memoryDatabase({ ...seed, purchaseOrder: [], order: [{ ...seed.order[0], orderValue: 1000, depositRequired: 100, status: 'payment_received' }], payment: [{ ...seed.payment[0], dueDate: new Date('2026-11-01'), date: new Date('2026-10-22') }] });
}
test('editing a paid invoice updates its amount/date and recomputes the payment gate atomically', async () => {
 const m = setup();
 await editInvoiceRecord(m.db, 'payment', 75.126, '2026-11-12', expected);
 assert.equal(m.state().payment[0].amount, 75.13);
 assert.equal(m.state().payment[0].status, 'paid');
 assert.equal((m.state().payment[0].dueDate as Date).toISOString().slice(0, 10), '2026-11-12');
 assert.equal(m.state().order[0].status, 'awaiting_payment');
});
test('invalid amounts and rollover dates leave the invoice untouched', async () => {
 const m = setup();
 for (const amount of [0, -1, NaN, Infinity, 0.001, 10_000_001]) {
  assert.ok(invoiceAmountProblem(amount));
  await assert.rejects(editInvoiceRecord(m.db, 'payment', amount, '', expected));
 }
 await assert.rejects(editInvoiceRecord(m.db, 'payment', 100, '2026-02-30', expected), /valid due date/);
 assert.equal(m.state().payment[0].amount, 100);
});
test('clearing a due date preserves the paid amount and other invoice details', async () => {
 const m = setup(); await editInvoiceRecord(m.db, 'payment', 100, '', expected);
 assert.equal(m.state().payment[0].dueDate, null); assert.equal(m.state().payment[0].status, 'paid');
 assert.equal((m.state().payment[0].date as Date).toISOString().slice(0, 10), '2026-10-22');
});
test('deleting a paid invoice removes its received amount and reopens the required payment step', async () => {
 const m = setup(); const deleted = await deleteInvoiceRecord(m.db, 'payment', expected);
 assert.equal(deleted.amount, 100); assert.equal(m.state().payment.length, 0);
 assert.equal(m.state().order[0].status, 'awaiting_payment');
 const gate = evaluatePaymentGate({ orderType: 'order', orderValue: 1000, depositRequired: 100, company: null, payments: [] });
 assert.equal(gate.paidTotal, 0); assert.equal(gate.shortfall, 100);
});
test('deleting one invoice leaves unrelated invoices and orders intact', async () => {
 const m = setup();
 await m.db.payment.create({ data: { id: 'other', orderId: 'order', type: 'final', amount: 900, status: 'invoiced' } });
 await deleteInvoiceRecord(m.db, 'payment', expected);
 assert.equal(m.state().payment.length, 1); assert.equal(m.state().payment[0].id, 'other'); assert.equal(m.state().order.length, 1);
});
test('stale amount, status, or date prevents both edit and delete', async () => {
 for (const revision of [{ ...expected, amount: 99 }, { ...expected, status: 'invoiced' }, { ...expected, dueDate: '' }]) {
  const m = setup();
  await assert.rejects(editInvoiceRecord(m.db, 'payment', 50, '', revision), /changed in another session/);
  await assert.rejects(deleteInvoiceRecord(m.db, 'payment', revision), /changed in another session/);
  assert.equal(m.state().payment[0].amount, 100);
 }
});
test('reconciliation failure rolls back an amount change or deletion', async () => {
 for (const remove of [false, true]) {
  const m = setup(); m.fail('order.update');
  await assert.rejects(remove ? deleteInvoiceRecord(m.db, 'payment', expected) : editInvoiceRecord(m.db, 'payment', 50, '', expected));
  assert.equal(m.state().payment.length, 1); assert.equal(m.state().payment[0].amount, 100);
 }
});
test('serialization retries delete exactly one invoice', async () => {
 const m = setup(); m.conflictOnce(); await deleteInvoiceRecord(m.db, 'payment', expected);
 assert.equal(m.state().payment.length, 0); assert.deepEqual(m.isolation, ['Serializable', 'Serializable']);
});

test('Mark unpaid removes the invoice itself and its received amount', async () => {
 const m = setup(); await unpayInvoiceRecord(m.db, 'payment');
 assert.equal(m.state().payment.length, 0); assert.equal(m.state().order[0].status, 'awaiting_payment');
 assert.equal(await unpayInvoiceRecord(m.db, 'payment'), null);
});
test('Mark unpaid cannot remove an invoice whose paid status changed in another session', async () => {
 const m = setup(); await m.db.payment.update({ where: { id: 'payment' }, data: { status: 'invoiced' } });
 await assert.rejects(unpayInvoiceRecord(m.db, 'payment'), /no longer paid/);
 assert.equal(m.state().payment.length, 1);
});
test('Mark unpaid rolls back invoice removal if workflow reconciliation fails', async () => {
 const m = setup(); m.fail('order.update');
 await assert.rejects(unpayInvoiceRecord(m.db, 'payment'));
 assert.equal(m.state().payment.length, 1); assert.equal(m.state().payment[0].status, 'paid');
});

test('Mark unpaid rejects a stale invoice amount before deleting anything', async () => {
 const m = setup(); await assert.rejects(unpayInvoiceRecord(m.db, 'payment', { ...expected, amount: 99 }), /changed in another session/);
 assert.equal(m.state().payment.length, 1);
});
