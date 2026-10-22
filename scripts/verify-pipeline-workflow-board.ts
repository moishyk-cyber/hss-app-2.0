import { requireTestDatabase } from "../src/lib/environmentMode";
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readPipelineWorkflowIndex } from '../src/app/pipeline/workflowData';
import { PIPELINE_CARD_SELECT } from '../src/app/pipeline/data';
import { plainMoney } from '../src/lib/money';
import { pipelineWorkflowStep } from '../src/lib/pipelineWorkflow';
import { collectionSnapshot } from '../src/lib/collectionIndex';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const settings = await db.fieldRequirement.findMany();
  const required = { company: settings.find(row => row.entity === 'opportunity' && row.field === 'companyId')?.required ?? true, neededBy: settings.find(row => row.entity === 'opportunity' && row.field === 'neededByDate')?.required ?? true };
  const start = performance.now();
  const index = await readPipelineWorkflowIndex(db, required);
  const indexMs = Math.round(performance.now() - start);
  const active = index.filter(row => !['complete', 'lost'].includes(row.step));
  const first = collectionSnapshot(active.map(row => ({ id: row.id, groups: { workflowStep: row.step } })), 120);
  const more = collectionSnapshot(active.map(row => ({ id: row.id, groups: { workflowStep: row.step } })), 360);
  assert.deepEqual(first.snapshot.laneTotals, more.snapshot.laneTotals);
  const hydrationStart = performance.now();
  const hydrated = plainMoney(await db.opportunity.findMany({ where: { id: { in: first.ids } }, select: PIPELINE_CARD_SELECT, relationLoadStrategy: 'join' }));
  const hydrateMs = Math.round(performance.now() - hydrationStart);
  const expected = new Map(index.map(row => [row.id, row.step]));
  for (const deal of hydrated) {
    const order = deal.orders[0];
    assert.equal(pipelineWorkflowStep(deal, required, order ? { ...order, openIssueCount: order._count.serviceIssues } : null), expected.get(deal.id));
  }
  assert.equal(expected.get('qa_approved_workflow_20261021'), 'pos');
  const report = { at: new Date().toISOString(), records: index.length, active: active.length, initialHydrated: hydrated.length, indexMs, hydrateMs, laneTotals: first.snapshot.laneTotals, stableTotals: true, hydratedLanesMatch: true, emailsSent: false, deleted: false };
  await fs.writeFile('qa-reports/pipeline-workflow-board.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
