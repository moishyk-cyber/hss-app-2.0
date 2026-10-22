import type { PrismaClient } from '@prisma/client';
import { parseInvoiceDueDate } from '../invoices';
import { toMoney, roundCents } from '../money';
import { serialTransaction } from './transaction';
import { reconcileOrderStatus } from './orderState';
export type InvoiceRevision = { amount: number; status: string; dueDate: string };
export class InvoiceEditError extends Error {}
export function invoiceAmountProblem(amount: number): string | null {
  return !Number.isFinite(amount) || amount <= 0 || roundCents(amount) <= 0 || amount > 10_000_000 ? 'Enter an amount between $0.01 and $10,000,000.' : null;
}
function assertUnchanged(payment: { amount: unknown; status: string; dueDate: Date | null }, expected: InvoiceRevision) {
  if (!expected || typeof expected.amount !== 'number' || typeof expected.status !== 'string' || typeof expected.dueDate !== 'string' || Number(payment.amount) !== expected.amount || payment.status !== expected.status || (payment.dueDate?.toISOString().slice(0, 10) ?? '') !== expected.dueDate) throw new InvoiceEditError('This invoice changed in another session. Reload and review it before saving or deleting.');
}
export async function editInvoiceRecord(db: PrismaClient, id: string, amount: number, dueDate: string, expected: InvoiceRevision) {
  const problem = invoiceAmountProblem(amount); if (problem) throw new InvoiceEditError(problem);
  if (typeof dueDate !== 'string') throw new InvoiceEditError('Enter a valid due date.');
  const date = parseInvoiceDueDate(dueDate); if (date === undefined) throw new InvoiceEditError('Enter a valid due date.');
  return serialTransaction(db, async tx => {
    const previous = await tx.payment.findUnique({ where: { id } });
    if (!previous) throw new InvoiceEditError('This invoice no longer exists. Reload the record.');
    assertUnchanged(previous, expected);
    const payment = await tx.payment.update({ where: { id }, data: { amount: roundCents(amount), dueDate: date } });
    await reconcileOrderStatus(tx, payment.orderId);
    return { previous: { amount: toMoney(previous.amount), dueDate: previous.dueDate, status: previous.status }, payment };
  });
}
export async function deleteInvoiceRecord(db: PrismaClient, id: string, expected: InvoiceRevision) {
  return serialTransaction(db, async tx => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) throw new InvoiceEditError('This invoice no longer exists. Reload the record.');
    assertUnchanged(payment, expected);
    await tx.payment.delete({ where: { id } });
    await reconcileOrderStatus(tx, payment.orderId);
    return payment;
  });
}

/** Mark unpaid removes the paid invoice, rather than leaving an unpaid copy. */
export async function unpayInvoiceRecord(db: PrismaClient, id: string, expected?: InvoiceRevision) {
  return serialTransaction(db, async tx => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) return null;
    if (payment.status !== 'paid') throw new InvoiceEditError('This invoice is no longer paid. Reload before changing it.');
    if (expected) assertUnchanged(payment, expected);
    await tx.payment.delete({ where: { id } });
    await reconcileOrderStatus(tx, payment.orderId);
    return payment;
  });
}
