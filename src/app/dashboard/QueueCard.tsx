import Link from "next/link";
import type { ReactNode } from "react";

export type QueueRow = {
  href: string;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Right-aligned trailing content — amount due, a badge, etc. */
  meta?: ReactNode;
};

/**
 * One actionable dashboard queue (docs/UX_FLOW.md §C): a title + count, up to
 * `rows.length` items (callers pass at most 5), a "View all →" link, and a
 * one-line empty state that teaches where the queue's items come from.
 */
export function QueueCard({
  title,
  count,
  viewAllHref,
  viewAllLabel = "View all",
  rows,
  emptyText,
}: {
  title: string;
  count: number;
  viewAllHref: string;
  viewAllLabel?: string;
  rows: QueueRow[];
  emptyText: ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-label flex items-center gap-2">
          {title}
          <span className="badge badge-gray">{count}</span>
        </h3>
        {rows.length > 0 && (
          <Link href={viewAllHref} className="shrink-0 text-xs font-medium text-blue transition-colors hover:underline">
            {viewAllLabel} →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state mt-2">{emptyText}</div>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={row.href} className="min-w-0 flex-1 truncate text-blue transition-colors hover:underline">
                {row.primary}
              </Link>
              {row.secondary && <span className="shrink-0 truncate text-xs text-gray-dark">{row.secondary}</span>}
              {row.meta && <span className="shrink-0 text-xs font-medium text-ink">{row.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
