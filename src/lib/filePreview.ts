export type PreviewDocument = { id: string; fileName: string | null; fileUrl: string; storagePath: string | null; mimeType: string | null; kind?: string; note?: string | null };
export type CardFileKind = 'quote' | 'sales_order' | 'po' | 'invoice';
export const CARD_FILE_KINDS: { key: CardFileKind; label: string }[] = [
  { key: 'quote', label: 'Quote' }, { key: 'sales_order', label: 'Sales Order' }, { key: 'po', label: 'PO' }, { key: 'invoice', label: 'Invoice' },
];
export function safePreviewUrl(value: string): string | null {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function previewKind(doc: Pick<PreviewDocument, 'mimeType' | 'fileName' | 'fileUrl'>) {
  // Sharing pages return HTML even when their displayed filename ends in .pdf/.docx.
  if (!doc.mimeType) {
    try { if (['drive.google.com', 'docs.google.com'].includes(new URL(doc.fileUrl).hostname)) return 'frame'; } catch { /* Invalid links are handled by safePreviewUrl. */ }
  }
  if (doc.mimeType === 'application/pdf') return 'pdf';
  if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (doc.mimeType?.startsWith('image/')) return 'image';
  for (const value of [doc.fileName ?? '', doc.fileUrl]) {
    if (/\.pdf(?:[?#]|$)/i.test(value)) return 'pdf';
    if (/\.docx(?:[?#]|$)/i.test(value)) return 'docx';
    if (/\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(value)) return 'image';
  }
  return 'frame';
}

/** Use provider embed URLs rather than opening their surrounding sharing pages. */
export function embeddedPreviewUrl(value: string): string | null {
  const safe = safePreviewUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.hostname === 'drive.google.com') {
    const id = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1]
      ?? (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) {
      const preview = new URL(`https://drive.google.com/file/d/${id}/preview`);
      const resourceKey = url.searchParams.get('resourcekey');
      if (resourceKey) preview.searchParams.set('resourcekey', resourceKey);
      return preview.href;
    }
  }
  if (url.hostname === 'docs.google.com') {
    const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://docs.google.com/${match[1]}/d/${match[2]}/preview`;
  }
  return safe;
}
