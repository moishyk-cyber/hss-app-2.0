'use client';
import { useEffect, useState } from 'react';
import { MAX_UPLOAD_BYTES } from './uploadPolicy';
import { Spinner } from './ui';

/** Parse privately in this browser; never send signed file URLs to an Office viewer. */
export function WordPreview({ url, name, onError }: { url: string; name: string; onError: (message: string) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('File request failed');
        if (Number(response.headers.get('content-length')) > MAX_UPLOAD_BYTES) throw new Error('File too large');
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) throw new Error('File too large');
        const mammoth = await import('mammoth');
        if (!active) return;
        const result = await mammoth.convertToHtml({ arrayBuffer }, { externalFileAccess: false });
        if (!active) return;
        // Mammoth preserves headings, lists, tables and embedded pictures. Its HTML
        // is untrusted: remove navigation and isolate it in a scriptless CSP frame.
        const parsed = new DOMParser().parseFromString(result.value, 'text/html');
        for (const link of parsed.querySelectorAll('a')) link.removeAttribute('href');
        setHtml(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{margin:0 auto;padding:32px;max-width:800px;font:16px/1.6 system-ui,sans-serif;color:#242424;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto}td,th{border:1px solid #d9d9d9;padding:8px}h1,h2,h3{line-height:1.25}a{color:inherit}@media(max-width:600px){body{padding:20px}}</style></head><body>${parsed.body.innerHTML || '<p>This document contains no previewable content.</p>'}</body></html>`);
      } catch {
        if (active) onError('This Word document could not be previewed. Try again, or upload a fresh .docx or PDF copy.');
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [url, onError]);
  return html === null ? <div role="status" className="file-preview-loading"><Spinner /> Loading Word document…</div> : <iframe title={name} srcDoc={html} sandbox="" referrerPolicy="no-referrer" />;
}
