import 'server-only';
import { prisma } from './prisma';
import type { PreviewDocument } from './filePreview';

export type RecordCardDocument = PreviewDocument & { kind: string; note?: string | null };
/** Fetch attachments once for the visible records, including their intake and POs. */
export async function recordCardDocuments(records: { id: string; type: 'opportunity' | 'order' }[]) {
  const result = new Map<string, RecordCardDocument[]>();
  if (!records.length) return result;
  const dealIds = records.filter(row => row.type === 'opportunity').map(row => row.id);
  const orderIds = records.filter(row => row.type === 'order').map(row => row.id);
  const [deals, orders] = await Promise.all([
    prisma.opportunity.findMany({ where: { id: { in: dealIds } }, select: { id: true, clientQuoteUrl: true } }),
    prisma.order.findMany({ where: { OR: [{ id: { in: orderIds } }, { opportunityId: { in: dealIds } }] }, select: { id: true, opportunityId: true, opportunity: { select: { clientQuoteUrl: true } }, purchaseOrders: { select: { id: true } } } }),
  ]);
  const allDealIds = [...new Set([...dealIds, ...orders.flatMap(order => order.opportunityId ? [order.opportunityId] : [])])];
  const docs = await prisma.document.findMany({ where: { OR: [
    { linkedType: 'opportunity', linkedId: { in: allDealIds } },
    { linkedType: 'order', linkedId: { in: orders.map(order => order.id) } },
    { linkedType: 'purchase_order', linkedId: { in: orders.flatMap(order => order.purchaseOrders.map(po => po.id)) } },
  ] }, select: { id: true, kind: true, note: true, fileName: true, fileUrl: true, storagePath: true, mimeType: true, linkedType: true, linkedId: true }, orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }] });
  const byTarget = new Map<string, RecordCardDocument[]>();
  for (const { linkedType, linkedId, ...doc } of docs) {
    const key = `${linkedType}:${linkedId}`;
    const list = byTarget.get(key) ?? []; list.push(doc); byTarget.set(key, list);
  }
  for (const record of records) {
    const relatedOrders = orders.filter(order => record.type === 'order' ? order.id === record.id : order.opportunityId === record.id);
    const dealId = record.type === 'opportunity' ? record.id : relatedOrders[0]?.opportunityId;
    const keys = [...(dealId ? [`opportunity:${dealId}`] : []), ...relatedOrders.flatMap(order => [`order:${order.id}`, ...order.purchaseOrders.map(po => `purchase_order:${po.id}`)])];
    const files = keys.flatMap(key => byTarget.get(key) ?? []);
    const quoteUrl = record.type === 'opportunity' ? deals.find(deal => deal.id === record.id)?.clientQuoteUrl : relatedOrders[0]?.opportunity?.clientQuoteUrl;
    if (quoteUrl && !files.some(file => file.fileUrl === quoteUrl)) files.push({ id: `client-quote-${record.id}`, kind: 'quote', fileName: 'Client quote', fileUrl: quoteUrl, storagePath: null, mimeType: null });
    result.set(record.id, files);
  }
  return result;
}
