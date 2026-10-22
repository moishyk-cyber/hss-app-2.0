/** Client-safe payment schedule validation and arithmetic. AI never calculates money. */
export const PAYMENT_EVENTS = ['before_purchase', 'before_delivery', 'on_delivery', 'after_invoice', 'after_delivery', 'after_confirmation', 'on_date'] as const;
export type PaymentMilestone = { basis: 'percent' | 'fixed' | 'balance'; value: number | null; event: typeof PAYMENT_EVENTS[number]; days: number | null; date: string | null };
export type PaymentPlan = { status: 'ready' | 'needs_clarification'; purchaseRequirement: 'milestones' | 'none' | 'unclear'; milestones: PaymentMilestone[]; questions: string[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function readPaymentPlan(raw: unknown): PaymentPlan | null {
  if (!object(raw) || !['ready', 'needs_clarification'].includes(String(raw.status)) || !['milestones', 'none', 'unclear'].includes(String(raw.purchaseRequirement)) || !Array.isArray(raw.milestones) || raw.milestones.length > 12 || !Array.isArray(raw.questions) || raw.questions.length > 8 || !raw.questions.every(q => typeof q === 'string' && q.length <= 500)) return null;
  for (const m of raw.milestones) {
    if (!object(m) || !['percent', 'fixed', 'balance'].includes(String(m.basis)) || !PAYMENT_EVENTS.includes(m.event as PaymentMilestone['event'])) return null;
    if (m.basis === 'balance' ? m.value !== null : typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value <= 0 || (m.basis === 'percent' && m.value > 100) || m.value > 1e10) return null;
    if (m.days !== null && (typeof m.days !== 'number' || !Number.isInteger(m.days) || m.days < 0 || m.days > 3650)) return null;
    if (m.date !== null && (typeof m.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(Date.parse(m.date)) || new Date(m.date).toISOString().slice(0, 10) !== m.date)) return null;
    if (m.event === 'on_date' ? !m.date || m.days !== null : m.date !== null) return null;
    if (String(m.event).startsWith('after_') ? m.days === null : m.days !== null) return null;
  }
  const plan = raw as PaymentPlan;
  if (plan.status === 'ready') {
    if (plan.questions.length || !plan.milestones.length || plan.purchaseRequirement === 'unclear') return null;
    const before = plan.milestones.some(m => m.event === 'before_purchase');
    if ((plan.purchaseRequirement === 'milestones') !== before) return null;
    const balances = plan.milestones.filter(m => m.basis === 'balance');
    if (balances.length > 1 || balances.some(m => m.event === 'before_purchase')) return null;
    const percentage = plan.milestones.filter(m => m.basis === 'percent').reduce((sum, m) => sum + m.value!, 0);
    if (percentage > 100 || (percentage === 100 && (balances.length || plan.milestones.some(m => m.basis === 'fixed')))) return null;
    if (!balances.length && plan.milestones.every(m => m.basis === 'percent') && Math.abs(percentage - 100) > 0.00001) return null;
  }
  return plan;
}
export function paymentPlanAmounts(plan: PaymentPlan, total: number | null) {
  if (plan.status !== 'ready') throw new Error('Clarify the payment terms before saving.');
  if (total === null || total <= 0) {
    // Percentages can be captured before pricing; purchasing stays blocked until a total exists.
    return { requiredBeforePurchase: plan.purchaseRequirement === 'none' ? 0 : null, amounts: plan.milestones.map(() => null) };
  }
  const totalCents = Math.round(total * 100);
  const amounts = plan.milestones.map(m => m.basis === 'balance' ? null : m.basis === 'fixed' ? Math.round(m.value! * 100) : Math.round(totalCents * m.value! / 100));
  // Allocate percentage-only schedules using largest remainders, so rounding
  // cannot create or lose a cent (including very small order totals).
  if (plan.milestones.every(m => m.basis === 'percent')) {
    const quotas = plan.milestones.map(m => totalCents * m.value! / 100);
    quotas.forEach((quota, i) => { amounts[i] = Math.floor(quota); });
    const remaining = totalCents - amounts.reduce<number>((sum, amount) => sum + amount!, 0);
    const priority = quotas.map((quota, i) => ({ i, fraction: quota - Math.floor(quota) })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (let cent = 0; cent < remaining && cent < priority.length; cent++) amounts[priority[cent].i]!++;
  }
  const specified = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  if (specified > totalCents || (!plan.milestones.some(m => m.basis === 'balance') && specified !== totalCents)) throw new Error('The payment milestones must add up to the order total. Adjust the terms.');
  const resolved = amounts.map(amount => (amount ?? totalCents - specified) / 100);
  return { requiredBeforePurchase: Math.round(resolved.reduce((sum, amount, i) => sum + (plan.milestones[i].event === 'before_purchase' ? Math.round(amount * 100) : 0), 0)) / 100, amounts: resolved };
}
export function paymentMilestoneLabel(m: PaymentMilestone): string {
  const amount = m.basis === 'balance' ? 'Balance' : m.basis === 'percent' ? `${m.value}%` : `$${m.value!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const when = { before_purchase: 'before purchasing', before_delivery: 'before delivery', on_delivery: 'on delivery', after_invoice: `${m.days} days after invoice`, after_delivery: `${m.days} days after delivery`, after_confirmation: `${m.days} days after deal confirmation`, on_date: `on ${m.date}` }[m.event];
  return `${amount} ${when}`;
}
