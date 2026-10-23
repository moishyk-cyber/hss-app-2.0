'use client';
/* eslint-disable @next/next/no-img-element -- Private signed previews use their original URL without image optimization. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogAccessibility } from './useDialogAccessibility';
import { getSignedDownloadUrl } from '@/app/files/actions';
import { embeddedPreviewUrl, previewKind, safePreviewUrl, type PreviewDocument } from './filePreview';
import { documentKindLabel } from './documentKind';
import { Spinner } from './ui';
import { PdfPreview } from './PdfPreview';
import { FileLabel } from './FileLabel';
import { WordPreview } from './WordPreview';

type FileResult = { ok: true; documents: PreviewDocument[] } | { ok: false; message: string };
export function FilePreviewModal({ title, documents, load, onClose }: { title: string; documents?: PreviewDocument[]; load?: () => Promise<FileResult>; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [docs, setDocs] = useState(documents ?? null);
  const [selected, setSelected] = useState<PreviewDocument | null>(documents?.[0] ?? null);
  const [signed, setSigned] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const [loadedUrl, setLoadedUrl] = useState('');
  const [attempt, setAttempt] = useState(0);
  useDialogAccessibility(panel, true, onClose);
  useEffect(() => {
    if (!load) return;
    let active = true;
    load().then(result => { if (!active) return; if (result.ok) { setDocs(result.documents); setSelected(result.documents[0] ?? null); } else setError(result.message); }).catch(() => { if (active) setError('Could not load files. Please try again.'); });
    return () => { active = false; };
  }, [load, attempt]);
  useEffect(() => {
    if (!selected?.storagePath) return;
    let active = true;
    getSignedDownloadUrl(selected.id).then(result => { if (!active) return; if (result.ok) setSigned({ id: selected.id, url: result.url }); else setError(result.message); }).catch(() => { if (active) setError('Could not open this file. Please try again.'); });
    return () => { active = false; };
  }, [selected, attempt]);
  const url = selected ? safePreviewUrl(selected.storagePath ? signed?.id === selected.id ? signed.url : '' : selected.fileUrl) : null;
  const heading = selected?.kind ? documentKindLabel({ kind: selected.kind, note: selected.note }) : title;
  const frameUrl = url ? embeddedPreviewUrl(url) : null;
  const retry = () => { setError(''); setSigned(null); setLoadedUrl(''); setAttempt(value => value + 1); };
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="file-preview-backdrop" onClick={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={panel} className="file-preview-modal" role="dialog" aria-modal="true" aria-label={heading} tabIndex={-1}>
      <header className="file-preview-header"><div className="min-w-0 flex-1"><h2><FileLabel text={heading} /></h2>{selected?.fileName && selected.fileName !== heading && <p><FileLabel text={selected.fileName} /></p>}</div><button type="button" className="btn btn-sm shrink-0" onClick={onClose} aria-label="Close file preview">Close</button></header>
      {error ? <div className="space-y-3 p-5"><p role="alert" className="text-sm text-gray-dark">{error}</p><button type="button" className="btn btn-sm" onClick={retry}>Try again</button></div> : docs === null || selected?.storagePath && !url ? <div className="file-preview-loading" role="status"><Spinner /> Loading files…</div> : !docs.length ? <p className="p-8 text-sm text-gray-dark">No {title.toLowerCase()} files attached yet.</p> : <>
        {docs.length > 1 && <nav className="file-preview-list" aria-label="Choose a file">{docs.map(doc => <button type="button" className="btn btn-sm" aria-pressed={selected?.id === doc.id} key={doc.id} onClick={() => { setSelected(doc); setError(''); }}><FileLabel text={doc.fileName ?? 'File'} focusable={false} className="max-w-60" /></button>)}</nav>}
        <div className="file-preview-content">{url && selected ? <>{!['pdf', 'docx'].includes(previewKind(selected)) && loadedUrl !== url && <div role="status" className="file-preview-loading"><Spinner /> Loading preview…</div>}{previewKind(selected) === 'pdf' ? <PdfPreview key={`${url}:${attempt}`} url={url} onError={setError} /> : previewKind(selected) === 'docx' ? <WordPreview key={`${url}:${attempt}`} url={url} name={selected.fileName ?? 'Word document'} onError={setError} /> : previewKind(selected) === 'image' ? <img src={url} alt={selected.fileName ?? 'File preview'} onLoad={() => setLoadedUrl(url)} onError={() => { setLoadedUrl(url); setError('This image could not be loaded. Try again, or upload a fresh copy of the file.'); }} /> : <iframe key={`${frameUrl}:${attempt}`} tabIndex={0} src={frameUrl ?? url} title={selected.fileName ?? 'File preview'} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" onLoad={() => setLoadedUrl(url)} onError={() => setError("This provider could not display a preview. Upload a PDF or image to preview it here.")} />}</> : <p className="p-5">This file has no valid preview link.</p>}</div>
      </>}
    </div>
  </div>, document.body);
}
export function FilePreviewButton({ document: doc, label = "Open" }: { document: PreviewDocument; label?: string }) {
  const [open, setOpen] = useState(false);
  const title = doc.kind ? documentKindLabel({ kind: doc.kind, note: doc.note }) : doc.fileName ?? "File preview";
  return <><button type="button" className="btn btn-sm" onClick={() => setOpen(true)} aria-label={`${label}: ${doc.fileName ?? title}`}>{label}</button>{open && <FilePreviewModal title={title} documents={[doc]} onClose={() => setOpen(false)} />}</>;
}

/** URL-only documents use the same modal as uploaded files and kanban attachments. */
export function FileLinkPreview({ url, name, kind, label = "Open" }: { url: string; name: string; kind?: string; label?: string }) {
  return <FilePreviewButton label={label} document={{ id: "linked-document", fileName: name, kind, fileUrl: url, storagePath: null, mimeType: null }} />;
}
