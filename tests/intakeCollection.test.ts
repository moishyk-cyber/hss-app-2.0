import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { orderIntakeQuery, sortIntakeRows } from '../src/lib/intakeCollection';
import { readPipelineWorkflowIndex } from '../src/app/pipeline/workflowData';
test('direct-order filters preserve nested conditions, dates and ownership', () => {
  const date = new Date('2026-10-21');
  assert.deepEqual(orderIntakeQuery({ AND: [{ salespersonId: 'user' }, { OR: [{ value: { gte: 50 } }, { salesperson: { name: { contains: 'Joe' } } }] }], neededByDate: { lte: date } }), { AND: [{ ownerId: 'user' }, { OR: [{ orderValue: { gte: 50 } }, { owner: { name: { contains: 'Joe' } } }] }], neededByDate: { lte: date } });
});
test('global intake sorting includes every direct order and deal before pagination', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), title: `Record ${i}`, orderType: 'order', value: 5000-i, createdAt: new Date('2026-10-21'), neededByDate: null, nextFollowUp: null, company: null, salesperson: null }));
  assert.equal(sortIntakeRows(rows, 'value', 'asc')[0].id, '4999');
  assert.equal(sortIntakeRows(rows, 'value', 'desc')[0].id, '0');
});
test('direct orders appear at Payment until their real payment requirement is met', async () => {
  const base = { orderType: 'order', orderValue: 100, depositRequired: null, company: { requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 } };
  const db = { opportunity: { findMany: async () => [] }, order: { findMany: async () => [{ ...base, id: 'unpaid', payments: [] }, { ...base, id: 'paid', payments: [{ status: 'paid', amount: 100 }] }, { ...base, id: 'partial', payments: [{ status: 'paid', amount: 30 }] }] } } as unknown as PrismaClient;
  assert.deepEqual(await readPipelineWorkflowIndex(db, { company: true, neededBy: true }), [{ id: 'unpaid', source: 'order', step: 'deposit' }]);
});
