import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main() {
  assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED, 'false');
  const id = 'qa_rfq_browser_20261021';
  const deal = await db.opportunity.findUniqueOrThrow({ where: { id }, select: { title: true } });
  assert.ok(deal.title.startsWith('[LOAD TEST]'));
  for (const [index, label] of ['Quote preview', 'Alternative quote preview'].entries()) await db.document.upsert({ where: { id: `qa_card_preview_20261021_${index}` }, update: index === 1 ? { fileName: '[LOAD TEST] Alternative quote preview.pdf', fileUrl: 'http://127.0.0.1:3001/qa/record-file-preview.pdf', mimeType: 'application/pdf' } : {}, create: { id: `qa_card_preview_20261021_${index}`, linkedType: 'opportunity', linkedId: id, kind: 'quote', fileName: `[LOAD TEST] ${label}.${index === 1 ? 'pdf' : 'svg'}`, fileUrl: `http://127.0.0.1:3001/qa/record-file-preview.${index === 1 ? 'pdf' : 'svg'}`, source: 'link', mimeType: index === 1 ? 'application/pdf' : 'image/svg+xml', note: '[LOAD TEST] File preview QA fixture' } });
  for (const kind of ['drawing', 'tracking', 'other']) await db.document.upsert({ where: { id: `qa_card_preview_20261021_${kind}` }, update: {}, create: { id: `qa_card_preview_20261021_${kind}`, linkedType: 'opportunity', linkedId: id, kind, fileName: `[LOAD TEST] ${kind} preview.svg`, fileUrl: 'http://127.0.0.1:3001/qa/record-file-preview.svg', source: 'link', mimeType: 'image/svg+xml', note: '[LOAD TEST] File row wrapping QA fixture' } });
  console.log(JSON.stringify({ record: id, previewDocuments: 5, emailsSent: 0, deleted: false }));
}
main().catch(() => { console.error('Could not prepare the labeled preview fixture'); process.exitCode = 1; }).finally(() => db.$disconnect());
