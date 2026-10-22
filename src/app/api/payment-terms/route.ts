import { currentUser, can } from '@/lib/permissionsServer';
import { hasSameOrigin } from '@/lib/requestOrigin';
import { interpretPaymentTerms, signPaymentInterpretation } from '@/lib/interpretPaymentTerms';
export const runtime = 'nodejs';
export const maxDuration = 30;
const recent = new Map<string, number[]>();
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ ok: false, message: 'Reload before converting terms.' }, { status: 403 });
  try {
    const user = await currentUser();
    if (!user || !(await can('terms.edit') || await can('deals.close') || await can('intake.create'))) return Response.json({ ok: false, message: 'You do not have permission to enter payment terms.' }, { status: 403 });
    const text = await request.text();
    if (text.length > 25000) return Response.json({ ok: false, message: 'Keep payment terms under 4,000 characters.' }, { status: 400 });
    let input; try { input = JSON.parse(text); } catch { return Response.json({ ok: false, message: 'Invalid payment terms.' }, { status: 400 }); }
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000) return Response.json({ ok: false, message: 'Enter payment terms under 4,000 characters.' }, { status: 400 });
    const attempts = (recent.get(user.id) ?? []).filter(time => time > Date.now() - 60000);
    if (attempts.length >= 20) return Response.json({ ok: false, message: 'Please wait a moment before converting more terms.' }, { status: 429 });
    if (recent.size > 1000) recent.clear();
    recent.set(user.id, [...attempts, Date.now()]);
    const plan = await interpretPaymentTerms(input.text);
    return Response.json({ ok: true, plan, token: plan.status === 'ready' ? signPaymentInterpretation(input.text, plan) : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ ok: false, message: error instanceof Error ? error.message : 'Could not convert payment terms.' }, { status: 503 }); }
}
