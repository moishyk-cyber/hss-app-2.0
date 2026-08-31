import Link from "next/link";
import type { ReactNode } from "react";

export type QueueRow = {
  href: string;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Right-aligned trailing content - amount due, a badge, etc. */
  meta?: ReactNode;
};

/**
 * Small muted count pill used next to every queue / section heading. Shared so
 * the number never reads as a status badge and never sits bare against the
 * title (Aug 31 feedback round 3).
 */
export function CountPill({ count }: { count: number }) {
  return (
    <span className="rounded bg-hover px-1.5 py-0.5 text-xs font-medium text-gray">{count}</span>
  );
}

/**
 * One actionable dashboard queue (docs/UX_FLOW.md §C): a title + count, up to
 * `rows.length` items (callers pass at most 8), a real "View all" button, and a
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
          <CountPill count={count} />
        </h3>
        <Link href={viewAllHref} className="btn btn-sm shrink-0">
          {viewAllLabel}
        </Link>
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
