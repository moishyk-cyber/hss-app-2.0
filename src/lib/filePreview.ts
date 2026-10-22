export type PreviewDocument = { id: string; fileName: string | null; fileUrl: string; storagePath: string | null; mimeType: string | null };
export type CardFileKind = 'quote' | 'sales_order' | 'po' | 'invoice';
export const CARD_FILE_KINDS: { key: CardFileKind; label: string }[] = [
  { key: 'quote', label: 'Quote' }, { key: 'sales_order', label: 'Sales Order' }, { key: 'po', label: 'PO' }, { key: 'invoice', label: 'Invoice' },
];
export function safePreviewUrl(value: string): string | null {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function previewKind(doc: Pick<PreviewDocument, 'mimeType' | 'fileName' | 'fileUrl'>) {
  if (doc.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(`${doc.fileName ?? ""} ${doc.fileUrl}`)) return 'image';
  if (doc.mimeType === 'application/pdf' || /\.pdf(?:[?#]|$)/i.test(`${doc.fileName ?? ''} ${doc.fileUrl}`)) return 'pdf';
  return 'frame';
}
