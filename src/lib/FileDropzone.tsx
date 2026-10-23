'use client';
import { useId, useRef, useState } from 'react';
import { FileLabel } from './FileLabel';
import { UPLOAD_ACCEPT, uploadProblem } from './uploadPolicy';

export function FileDropzone({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const problem = files.map(file => uploadProblem(file)).find(Boolean);
  function add(incoming: File[]) {
    const next = [...files];
    for (const file of incoming) if (!next.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) next.push(file);
    onChange(next);
  }
  return <div className="file-dropzone-field">
    <input ref={input} type="file" multiple accept={UPLOAD_ACCEPT} disabled={disabled} tabIndex={-1} className="file-dropzone-input" aria-label="Choose files to attach" onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    <div className={`file-dropzone${dragging ? ' file-dropzone-active' : ''}${disabled ? ' file-dropzone-disabled' : ''}`} onDragEnter={event => { event.preventDefault(); if (!disabled) { dragDepth.current++; setDragging(true); } }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }} onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!disabled) add(Array.from(event.dataTransfer.files)); }}>
      <svg className="file-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <p className="file-dropzone-title">{dragging ? 'Release to attach files' : 'Drop files here'}</p>
      <p id={`${id}-help`} className="file-dropzone-help">PDF, Word, or images · Up to 20 MB per file</p>
      <button type="button" className="btn btn-sm" disabled={disabled} aria-describedby={`${id}-help`} onClick={() => input.current?.click()}>Attach files</button>
    </div>
    {files.length > 0 && <div className="file-dropzone-selection" role="region" aria-label="Chosen files">
      <p className="file-dropzone-count" role="status">{files.length} {files.length === 1 ? 'file' : 'files'} chosen</p>
      <ul>{files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}`}>
        <svg viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 1h8l6 6v15H2V1h2Zm8 0v6h6M6 12h8M6 16h8" /></svg>
        <div className="file-dropzone-file"><FileLabel text={file.name} /><span>{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span></div>
        <button type="button" className="file-dropzone-remove" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
      </li>)}</ul>
    </div>}
    {problem && <p role="alert" className="mt-2 text-sm text-red">{problem}</p>}
  </div>;
}
