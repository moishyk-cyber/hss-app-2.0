'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditIconButton } from "@/lib/ui";
import { MoneyInput } from '@/lib/MoneyInput';
import { ConfirmDialog } from '@/lib/ConfirmDialog';
import { editInvoice, deleteInvoice } from '@/lib/workflowActions';
import { invoiceAmountProblem, type InvoiceRevision } from '@/lib/workflows/invoices';
import { fmtUSD } from '@/lib/money';
import { useToast } from '@/lib/toast';
import type { Payment } from '@/app/orders/[id]/PaymentsSection';
export function InvoiceEditor({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [dueDate, setDueDate] = useState('');
  const [expected, setExpected] = useState<InvoiceRevision>({ amount: payment.amount, status: payment.status, dueDate: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter(); const { toast } = useToast();
  function begin() {
    const date = payment.dueDate ? new Date(payment.dueDate).toISOString().slice(0, 10) : '';
    setAmount(String(payment.amount)); setDueDate(date); setExpected({ amount: payment.amount, status: payment.status, dueDate: date });
    setDeleting(false); setError(''); setOpen(true);
  }
  async function save(remove: boolean) {
    if (pending) return;
    if (!remove) { const problem = invoiceAmountProblem(Number(amount)); if (problem) { setError(problem); return; } }
    setPending(true); setError('');
    try {
      const result = remove ? await deleteInvoice(payment.id, expected) : await editInvoice(payment.id, Number(amount), dueDate, expected);
      if (!result.ok) { setError(result.message); return; }
      setOpen(false); router.refresh(); toast({ kind: 'success', message: remove ? 'Invoice deleted; payment totals updated' : 'Invoice updated' });
    } catch { setError('Could not confirm this change. Reload the record before trying again.'); }
    finally { setPending(false); }
  }
  return <>
    <EditIconButton label="Edit invoice" onClick={begin} opensDialog />
    <ConfirmDialog open={open && !deleting} title="Edit invoice" confirmLabel="Save changes" pending={pending} onConfirm={() => save(false)} onClose={() => setOpen(false)}>
      <div className="space-y-4">
        <label className="block"><span className="field-label">Amount</span><MoneyInput value={amount} onValueChange={setAmount} aria-label="Invoice amount" disabled={pending} className="input-klyne w-full" /></label>
        <label className="block"><span className="field-label">Due date</span><input type="date" aria-label="Invoice due date" value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={pending} className="input-klyne w-full" /></label>
        {expected.status === 'paid' && <p className="text-xs text-gray-dark">This invoice is paid. Changing its amount also changes the received total.</p>}
        {error && <p role="alert" className="banner-alert">{error}</p>}
        <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => { setError(''); setDeleting(true); }}>Delete invoice…</button>
      </div>
    </ConfirmDialog>
    <ConfirmDialog open={open && deleting} title="Delete this invoice?" confirmLabel="Delete invoice" pending={pending} danger onConfirm={() => save(true)} onClose={() => { setError(''); setDeleting(false); }}>
      <p>Delete the {fmtUSD(expected.amount, { cents: true })} {payment.type} invoice from HSS?{expected.status === 'paid' ? ' Its received amount will also be removed.' : ''} Payment totals and the order’s next step will be recalculated. This cannot be undone.</p>
      <p className="mt-2 text-xs">This does not delete an invoice in QuickBooks.</p>
      {error && <p role="alert" className="banner-alert mt-3">{error}</p>}
    </ConfirmDialog>
  </>;
}
