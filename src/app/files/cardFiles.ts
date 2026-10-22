'use server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/permissionsServer';
import { CARD_FILE_KINDS, type CardFileKind, type PreviewDocument } from '@/lib/filePreview';
export async function getCardFiles(id: string, type: 'opportunity' | 'order', kind: CardFileKind): Promise<{ ok: true; documents: PreviewDocument[] } | { ok: false; message: string }> {
  if (!await currentUser()) return { ok: false, message: 'Sign in again to view files.' };
  if (!CARD_FILE_KINDS.some(entry => entry.key === kind) || !['opportunity', 'order'].includes(type)) return { ok: false, message: 'Choose a valid file category.' };
  try {
    const deal = type === 'opportunity' ? await prisma.opportunity.findUnique({ where: { id }, select: { id: true, clientQuoteUrl: true, orders: { select: { id: true, purchaseOrders: { select: { id: true } } } } } }) : null;
    const order = type === 'order' ? await prisma.order.findUnique({ where: { id }, select: { id: true, opportunityId: true, opportunity: { select: { clientQuoteUrl: true } }, purchaseOrders: { select: { id: true } } } }) : null;
    if (!deal && !order) return { ok: false, message: 'This record is no longer available.' };
    const opportunityId = deal?.id ?? order?.opportunityId;
    const orders = deal?.orders ?? (order ? [order] : []);
    const documents = await prisma.document.findMany({ where: { kind, OR: [
      ...(opportunityId ? [{ linkedType: 'opportunity', linkedId: opportunityId }] : []),
      { linkedType: 'order', linkedId: { in: orders.map(row => row.id) } },
      { linkedType: 'purchase_order', linkedId: { in: orders.flatMap(row => row.purchaseOrders.map(po => po.id)) } },
    ] }, select: { id: true, fileName: true, fileUrl: true, storagePath: true, mimeType: true }, orderBy: { uploadedAt: 'desc' } });
    const quoteUrl = deal?.clientQuoteUrl ?? order?.opportunity?.clientQuoteUrl;
    if (kind === 'quote' && quoteUrl && !documents.some(doc => doc.fileUrl === quoteUrl)) documents.push({ id: `client-quote-${id}`, fileName: 'Client quote', fileUrl: quoteUrl, storagePath: null, mimeType: null });
    return { ok: true, documents };
  } catch { return { ok: false, message: 'Could not load files. Please try again.' }; }
}
