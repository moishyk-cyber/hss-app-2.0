'use client';
import { useId, useState } from 'react';
/** Saved item context is shared by Pipeline, Pricing and RFQ tables. */
export type ItemDetailsFields = {
  brand?: string | null;
  sku?: string | null;
  description?: string | null;
  moreDetails?: string | null;
  notes?: string | null;
};
export function ItemMetadata({ item }: { item: ItemDetailsFields }) {
  const values = [item.brand?.trim() ? `Brand: ${item.brand.trim()}` : null, item.sku?.trim() ? `Model / SKU: ${item.sku.trim()}` : null].filter(Boolean);
  return values.length ? <div className="item-metadata">{values.map(value => <div key={value}>{value}</div>)}</div> : null;
}
export function ItemNotes({ item }: { item: ItemDetailsFields }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const text = [...new Set([item.description, item.moreDetails, item.notes].map(value => value?.trim()).filter((value): value is string => !!value))].join('\n\n');
  if (!text) return <span className="empty-value">—</span>;
  if (text.length <= 160 && text.split('\n').length <= 3) return <div className="item-notes-text">{text}</div>;
  const excerpt = text.slice(0, 160).trimEnd();
  const lastSpace = excerpt.lastIndexOf(' ');
  const preview = lastSpace > 100 ? excerpt.slice(0, lastSpace) : excerpt;
  return <div className="item-notes-disclosure">
    <div id={contentId} className="item-notes-text">{expanded ? text : `${preview}…`}</div>
    <button type="button" className="item-notes-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>{expanded ? 'Read less' : 'Read more…'}</button>
  </div>;
}
