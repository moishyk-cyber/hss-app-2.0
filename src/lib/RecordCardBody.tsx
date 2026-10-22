'use client';
import { useState } from 'react';
import Link from './IntentLink';
import { Avatar } from './Avatar';
import { COURTS, type Ball } from './ballInCourt';
import { FilePreviewModal } from './FilePreviewModal';
import { DOCUMENT_KINDS, labelFor } from './constants';
import type { RecordCardDocument } from './recordCardDocuments';

function CardFiles({ documents }: { documents: RecordCardDocument[] }) {
  const [selected, setSelected] = useState<RecordCardDocument | null>(null);
  if (!documents.length) return null;
  return <><div className="record-card-files relative z-10" aria-label="Record documents">{documents.map(doc => <button type="button" key={doc.id} onClick={() => setSelected(doc)} title={doc.fileName ?? undefined} aria-label={`View ${labelFor(DOCUMENT_KINDS, doc.kind)}: ${doc.fileName ?? 'File'}`}>
    <svg viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 1h10l7 7v17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z"/><path d="M15 1v7h7M7 13h11M7 18h11M7 23h7"/></svg>
    <span>{labelFor(DOCUMENT_KINDS, doc.kind)}</span></button>)}</div>{selected && <FilePreviewModal key={selected.id} title={labelFor(DOCUMENT_KINDS, selected.kind)} documents={[selected]} onClose={() => setSelected(null)} />}</>;
}
export function RecordCardBody({ documents, href, title, companyId, companyName, value, daysOpen, ball, ballHref, context }: {
  ballHref?: string; context?: { label: string; href: string }; documents: RecordCardDocument[]; id: string; type: 'opportunity' | 'order'; href: string; title: string; companyId: string | null; companyName: string | null; assigneeName: string | null; value: number | null; daysOpen: number; ball: Ball;
}) {
  const holder = ball.holder ?? (ball.court ? COURTS[ball.court] : null);
  const companyContent = <><span className="record-card-business-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 21V4h11v17M15 10h5v11M2 21h20M8 8h3M8 12h3M8 16h3" /></svg></span><span>{companyName ?? 'No customer linked'}</span></>;
  return <>
    <div className="record-card-heading"><Link href={href} title={title} draggable={false} className="kanban-card-title block text-ink hover:underline after:absolute after:inset-0 after:content-['']">{title}</Link></div>
    {context && <Link href={context.href} className="record-card-context relative z-10" title={context.label}>{context.label}</Link>}
    {companyId ? <Link href={`/companies/${encodeURIComponent(companyId)}`} title={`View ${companyName ?? 'company'}`} className="record-card-customer record-card-company-link relative z-10">{companyContent}</Link> : <div className="record-card-customer">{companyContent}</div>}
    <div className="record-card-facts"><span className="font-medium tabular-nums">{value == null ? <span className="empty-value">No value</span> : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}</span><span>{daysOpen} {daysOpen === 1 ? 'day' : 'days'} open</span></div>
    <Link href={ballHref ?? (ball.step ? `${href.split(/[?#]/)[0]}?step=${ball.step}` : href)} title={ball.hint} aria-label={`${holder ?? 'Record'}: ${ball.hint}`} className="record-card-court relative z-10">{holder ? <Avatar name={holder} kind="person" size="md" /> : null}<div><span>Ball in court:</span><span>{holder ?? 'Ready to complete'}</span></div></Link>
    <CardFiles documents={documents} />
  </>;
}
