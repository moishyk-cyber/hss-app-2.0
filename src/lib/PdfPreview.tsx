'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Spinner } from './ui';

/** Load the PDF renderer only when a PDF is opened, with one page in memory on screen. */
export function PdfPreview({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const library = await import('pdfjs-dist');
        if (!active) return;
        library.GlobalWorkerOptions.workerSrc = `/vendor/pdfjs/pdf.worker.min.mjs?v=${library.version}`;
        task = library.getDocument({ url, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", wasmUrl: "/vendor/pdfjs/wasm/" });
        const document = await task.promise;
        if (active) setPdf(document);
      } catch { if (active) { setError('This PDF could not be previewed here. Use Open in new tab to view it.'); setBusy(false); } }
    })();
    return () => { active = false; void task?.destroy().catch(() => {}); };
  }, [url]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let render: RenderTask | undefined;
    void (async () => {
      try {
        const documentPage = await pdf.getPage(page);
        if (!active || !canvas.current) return;
        const base = documentPage.getViewport({ scale: 1 });
        const scale = Math.max(.3, Math.min(1.5, ((area.current?.clientWidth ?? 800) - 32) / base.width)) * zoom;
        const viewport = documentPage.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.floor(viewport.width * outputScale);
        target.height = Math.floor(viewport.height * outputScale);
        target.style.width = `${Math.floor(viewport.width)}px`;
        target.style.height = `${Math.floor(viewport.height)}px`;
        render = documentPage.render({ canvas: target, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
        const [content] = await Promise.all([documentPage.getTextContent(), render.promise]);
        if (active) { setText(content.items.map(item => 'str' in item ? item.str : '').join(' ')); setBusy(false); }
      } catch { if (active) { setError('Could not display this page. Use Open in new tab to view the file.'); setBusy(false); } }
    })();
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, zoom]);
  return <div className="pdf-preview">
    {pdf && <div className="pdf-preview-controls"><button type="button" className="btn btn-sm" disabled={page <= 1 || busy} onClick={() => { setBusy(true); setPage(page - 1); }}>Previous page</button><span>Page {page} of {pdf.numPages}</span><button type="button" className="btn btn-sm" disabled={page >= pdf.numPages || busy} onClick={() => { setBusy(true); setPage(page + 1); }}>Next page</button><button type="button" className="btn btn-sm" aria-label="Zoom out" disabled={zoom <= .5 || busy} onClick={() => { setBusy(true); setZoom(value => value - .25); }}>−</button><button type="button" className="btn btn-sm" aria-label="Zoom in" disabled={zoom >= 3 || busy} onClick={() => { setBusy(true); setZoom(value => value + .25); }}>+</button></div>}
    <div ref={area} className="pdf-preview-page">{error ? <p role="alert" className="p-5 text-sm">{error}</p> : <><canvas ref={canvas} aria-label={`PDF page ${page}`} /><p className="sr-only">{text}</p>{busy && <div role="status" className="file-preview-loading"><Spinner /> Loading PDF…</div>}</>}</div>
  </div>;
}
