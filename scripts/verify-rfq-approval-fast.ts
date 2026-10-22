import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { createSessionToken } from '../src/lib/session';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const manifest = JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json', 'utf8'));
  const id = 'qa_rfq_approval_perf_20261021';
  const fixture = await db.opportunity.findUniqueOrThrow({ where: { id }, select: { title: true } });
  assert.ok(fixture.title.startsWith('[LOAD TEST]'));
  await db.lineItem.updateMany({ where: { opportunityId: id }, data: { rfqStatus: 'needs_pricing' } });
  await db.opportunity.update({ where: { id }, data: { needsPricing: true } });
  const token = await createSessionToken(manifest.userId), origin = 'http://127.0.0.1:3001';
  const samples: {item:number;ms:number;serverTiming:string|null;workflowState:string|undefined;bytes:number}[] = [];
  const start = new Date();
  for (let i = 0; i < 3; i++) {
    const at = performance.now();
    const response = await fetch(`${origin}/api/line-items/${id}_item${i}/rfq-status`, { method: 'POST', headers: { origin, cookie: `hss_session=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rfqStatus: 'approved', source: i === 1 ? 'deal' : 'rfq' }), signal: AbortSignal.timeout(20000) });
    const body = await response.text(), result = JSON.parse(body);
    assert.equal(response.status, 200); assert.equal(result.ok, true); assert.equal(result.rfqStatus, 'approved');
    const workflowState = result.workflow?.quoteProgress.state;
    assert.equal(workflowState, i === 2 ? 'complete' : 'in_progress');
    samples.push({ item:i+1, ms:Math.round(performance.now()-at), serverTiming:response.headers.get('server-timing'), workflowState, bytes:body.length });
    console.log(JSON.stringify(samples.at(-1)));
  }
  const saved = await db.opportunity.findUniqueOrThrow({ where:{id}, include:{lineItems:true} });
  assert.equal(saved.needsPricing,false); assert.ok(saved.lineItems.every(item=>item.rfqStatus==='approved'));
  let activities = await db.activityLog.findMany({where:{linkedId:{in:[id,...saved.lineItems.map(item=>item.id)]},at:{gte:start}},select:{id:true,userId:true,notificationProcessedAt:true}});
  const deadline = Date.now()+20000;
  while(activities.some(row=>!row.notificationProcessedAt)&&Date.now()<deadline) {
    await new Promise(resolve=>setTimeout(resolve,500));
    activities = await db.activityLog.findMany({where:{id:{in:activities.map(row=>row.id)}},select:{id:true,userId:true,notificationProcessedAt:true}});
  }
  assert.ok(activities.length>=3); assert.ok(activities.every(row=>row.userId===manifest.userId)); assert.ok(activities.every(row=>row.notificationProcessedAt));
  const emailJobs = await db.notificationEmail.count({where:{notification:{href:{contains:id}}}}); assert.equal(emailJobs,0);
  const report={at:new Date().toISOString(),id,samples,auditRows:activities.length,notificationsProcessedAfterResponse:true,emailJobs,deleted:false};
  await fs.writeFile('qa-reports/rfq-approval-profile-after.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({auditRows:activities.length,notificationsProcessed:true,emailJobs}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Verification failed');process.exitCode=1;}).finally(()=>db.$disconnect());
