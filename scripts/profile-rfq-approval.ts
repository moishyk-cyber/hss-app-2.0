import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { createLineItemPricing } from '../src/lib/workflows/pricing';
import { processNotificationActivity } from '../src/lib/notifications';
import { dispatchNotificationEmails } from '../src/lib/notificationEmails';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const manifest = JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json', 'utf8'));
  const company = await db.company.findFirstOrThrow({ where: { id: { startsWith: manifest.run } }, select: { id: true } });
  const id = 'qa_rfq_approval_perf_20261021';
  await db.opportunity.upsert({ where: { id }, update: {}, create: { id, title: '[LOAD TEST] RFQ approval performance', companyId: company.id, salespersonId: manifest.userId, stage: 'estimating', orderType: 'project', needsPricing: true, neededByDate: new Date('2026-11-10'), deliveryAddress: '[LOAD TEST] 100 QA Test Street', lineItems: { create: Array.from({length: 3}, (_,i) => ({ id: `${id}_item${i}`, name: `[LOAD TEST] Approval item ${i+1}`, qty: 1, rfqStatus: 'needs_pricing' })) } } });
  const samples: {name:string;ms:number}[] = [];
  async function timed<T>(name:string, work:()=>Promise<T>) { const t=performance.now();const result=await work();samples.push({name,ms:Math.round(performance.now()-t)});return result; }
  const audit = async (kind:string, key:string, action:string, detail:string) => {
    const entry = await timed('audit.insert', () => db.activityLog.create({ data: { linkedType: kind, linkedId: key, action, detail, userId: manifest.userId, userName: '[LOAD TEST] Approval profiler' } }));
    await timed('audit.notifications', () => processNotificationActivity(db, entry));
    await timed('audit.emailDisabled', () => dispatchNotificationEmails(db));
  };
  const pricing = createLineItemPricing(db, { audit, refresh: () => {} });
  for (let i = 0; i < 3; i++) {
    const start = samples.length;
    await timed(`approval${i+1}.total`, async () => {
      await timed(`approval${i+1}.pricingChange`, () => pricing.change(`${id}_item${i}`, { kind: 'status', rfqStatus: 'approved' }));
      await audit('line_item', `${id}_item${i}`, 'rfq_status_set', '[LOAD TEST] Approval performance status changed to approved');
    });
    console.log(JSON.stringify(samples.slice(start)));
  }
  await fs.writeFile('qa-reports/rfq-approval-profile-before.json', JSON.stringify({at:new Date().toISOString(),id,samples,emailEnabled:false,deleted:false},null,2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Profile failed');process.exitCode=1; }).finally(()=>db.$disconnect());
