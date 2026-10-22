'use client';
import { useEffect, useState, useRef } from 'react';
import { paymentMilestoneLabel, paymentPlanAmounts, type PaymentPlan } from './paymentTerms';
export type TermsConversion = { text: string; plan: PaymentPlan | null; token: string; loading: boolean; error: string };
export function usePaymentTermsConversion(text: string, enabled = true) {
  const [result, setResult] = useState<TermsConversion>({ text: '', plan: null, token: '', loading: false, error: '' });
  useEffect(() => {
    if (!enabled || !text.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResult({ text, plan: null, token: '', loading: true, error: '' });
      try {
        const response = await fetch('/api/payment-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setResult({ text, plan: data.ok ? data.plan : null, token: data.token ?? '', loading: false, error: data.ok ? '' : data.message || 'Could not convert payment terms.' });
      } catch { if (!controller.signal.aborted) setResult({ text, plan: null, token: '', loading: false, error: 'Could not convert payment terms. Check your connection and try again.' }); }
    }, 800);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text, enabled]);
  if (!text.trim()) return { text, plan: null, token: '', loading: false, error: '' };
  return result.text === text ? result : { text, plan: null, token: '', loading: true, error: '' };
}
export function PaymentTermsPreview({ conversion, total }: { conversion: TermsConversion; total?: number | null }) {
  const { text, loading, error, plan } = conversion;
  if (!text.trim()) return <p className="text-xs text-gray-dark">The account’s deposit rule applies until custom terms are entered.</p>;
  if (loading) return <p role="status" className="flex items-center gap-2 text-xs text-gray-dark"><span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-ink motion-reduce:animate-none" />Converting payment terms…</p>;
  if (error) return <p role="alert" className="text-sm text-red">{error}</p>;
  if (!plan) return null;
  let amountError = '';
  let required: number | null = null;
  try { if (plan.status === 'ready') required = paymentPlanAmounts(plan, total ?? null).requiredBeforePurchase; } catch (error) { amountError = (error as Error).message; }
  return <div className="space-y-2 text-sm" aria-label="Interpreted payment terms">
    {plan.milestones.length > 0 && <ul className="list-disc space-y-1 pl-4">{plan.milestones.map((m, i) => <li key={i}>{paymentMilestoneLabel(m)}</li>)}</ul>}
    {plan.status === 'needs_clarification' ? <div role="alert" className="space-y-1 text-amber-800"><p className="font-medium">Clarify the terms above</p>{plan.questions.length ? plan.questions.map((q, i) => <p key={i}>{q}</p>) : <p>Specify the payment amounts, when they are due, and what is required before purchasing.</p>}</div> : amountError ? <p role="alert" className="text-red">{amountError}</p> : <p className="text-xs text-gray-dark">{required === 0 ? 'Purchasing can proceed without payment.' : required !== null ? `$${required.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} must be paid before purchasing.` : 'The required payment will be calculated when the order total is set.'} Saving applies these terms.</p>}
  </div>;
}
/** Standalone editor for forms that do not need to share conversion state. */
export function PaymentTermsField({ defaultValue = '', total }: { defaultValue?: string; total?: number | null }) {
  const [text, setText] = useState(defaultValue);
  const conversion = usePaymentTermsConversion(text);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.setCustomValidity(!text.trim() || (conversion.plan?.status === 'ready' && conversion.token) ? '' : conversion.error || (conversion.loading ? 'Wait for payment terms to finish converting.' : 'Clarify the payment terms.')); }, [text, conversion.plan, conversion.token, conversion.error, conversion.loading]);
  return <div className="space-y-2"><label className="block"><span className="field-label">Payment terms</span><textarea ref={input} name="termsNotes" value={text} onChange={event => setText(event.target.value)} maxLength={4000} rows={3} className="input-klyne w-full" placeholder="e.g. 30% deposit before ordering; balance before delivery" /></label><input type="hidden" name="paymentTermsToken" value={conversion.token} /><PaymentTermsPreview conversion={conversion} total={total} /></div>;
}
