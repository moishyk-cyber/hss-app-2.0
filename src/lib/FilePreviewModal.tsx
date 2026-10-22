'use client';
/* eslint-disable @next/next/no-img-element -- Private signed previews use their original URL without image optimization. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogAccessibility } from './useDialogAccessibility';
import { getSignedDownloadUrl } from '@/app/files/actions';
import { previewKind, safePreviewUrl, type PreviewDocument } from './filePreview';
import { Spinner } from './ui';
import { PdfPreview } from './PdfPreview';

type FileResult = { ok: true; documents: PreviewDocument[] } | { ok: false; message: string };
export function FilePreviewModal({ title, documents, load, onClose }: { title: string; documents?: PreviewDocument[]; load?: () => Promise<FileResult>; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [docs, setDocs] = useState(documents ?? null);
  const [selected, setSelected] = useState<PreviewDocument | null>(documents?.[0] ?? null);
  const [signed, setSigned] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const [loadedUrl, setLoadedUrl] = useState('');
  useDialogAccessibility(panel, true, onClose);
  useEffect(() => {
    if (!load) return;
    let active = true;
    load().then(result => { if (!active) return; if (result.ok) { setDocs(result.documents); setSelected(result.documents[0] ?? null); } else setError(result.message); }).catch(() => { if (active) setError('Could not load files. Please try again.'); });
    return () => { active = false; };
  }, [load]);
  useEffect(() => {
    if (!selected?.storagePath) return;
    let active = true;
    getSignedDownloadUrl(selected.id).then(result => { if (!active) return; if (result.ok) setSigned({ id: selected.id, url: result.url }); else setError(result.message); }).catch(() => { if (active) setError('Could not open this file. Please try again.'); });
    return () => { active = false; };
  }, [selected]);
  const url = selected ? safePreviewUrl(selected.storagePath ? signed?.id === selected.id ? signed.url : '' : selected.fileUrl) : null;
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="file-preview-backdrop" onClick={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={panel} className="file-preview-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <header className="file-preview-header"><div><h2>{title}</h2>{selected && <p>{selected.fileName ?? 'File'}</p>}</div><div className="flex items-center gap-2">{url && <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Open in new tab</a>}<button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close file preview">Close</button></div></header>
      {error ? <div role="alert" className="p-5">{error}</div> : docs === null || selected?.storagePath && !url ? <div className="file-preview-loading" role="status"><Spinner /> Loading files…</div> : !docs.length ? <p className="p-8 text-sm text-gray-dark">No {title.toLowerCase()} files attached yet.</p> : <>
        {docs.length > 1 && <nav className="file-preview-list" aria-label="Choose a file">{docs.map(doc => <button type="button" className="btn btn-sm" aria-pressed={selected?.id === doc.id} key={doc.id} onClick={() => { setSelected(doc); setError(''); }}>{doc.fileName ?? 'File'}</button>)}</nav>}
        <div className="file-preview-content">{url && selected ? <>{previewKind(selected) !== 'pdf' && loadedUrl !== url && <div role="status" className="file-preview-loading"><Spinner /> Loading preview…</div>}{previewKind(selected) === 'pdf' ? <PdfPreview key={url} url={url} /> : previewKind(selected) === 'image' ? <img src={url} alt={selected.fileName ?? 'File preview'} onLoad={() => setLoadedUrl(url)} onError={() => { setLoadedUrl(url); setError('Preview unavailable. Open the file in a new tab.'); }} /> : <iframe tabIndex={0} src={url} title={selected.fileName ?? 'File preview'} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" onLoad={() => setLoadedUrl(url)} />}</> : <p className="p-5">This file has no valid preview link.</p>}</div>
      </>}
    </div>
  </div>, document.body);
}
export function FilePreviewButton({ document: doc }: { document: PreviewDocument }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Open</button>{open && <FilePreviewModal title={doc.fileName ?? 'File preview'} documents={[doc]} onClose={() => setOpen(false)} />}</>;
}
