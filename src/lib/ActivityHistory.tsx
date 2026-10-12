// Record-level history panel (reliability spec P0-2 acceptance criteria: "the
// new event appears both on the affected record and in the Admin audit
// view"). Server component - just a read, no interactivity - so it can be
// dropped into any detail page next to the fields it narrates.

import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getActivityEntries = cache((linkedType: string, linkedId: string, limit = 20) =>
  prisma.activityLog.findMany({
    where: { linkedType, linkedId },
    orderBy: { at: "desc" },
    take: limit,
  }).then(entries => entries)
);

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function ActivityHistory({
  linkedType,
  linkedId,
  limit = 20,
  title = "Activity",
  entries: pendingEntries,
}: {
  linkedType: string;
  linkedId: string;
  limit?: number;
  title?: string;
  entries?: ReturnType<typeof getActivityEntries>;
}) {
  const entries = await (pendingEntries ?? getActivityEntries(linkedType, linkedId, limit));

  if (entries.length === 0) {
    return (
      <div className="card space-y-2">
        <h3 className="section-label">{title}</h3>
        <p className="empty-value text-sm">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h3 className="section-label">{title}</h3>
      <ul className="space-y-2.5">
        {entries.map((e) => (
          <li key={e.id} className="border-b border-border pb-2.5 text-sm last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-medium text-ink">{e.userName ?? "System"}</span>
              <span className="text-xs text-gray">{fmtDateTime(e.at)}</span>
            </div>
            <p className="text-gray-dark">{e.detail ?? e.action}</p>
            {e.previousValue != null || e.newValue != null ? (
              <p className="text-xs text-gray">
                {e.previousValue ?? "(none)"} <span aria-hidden>&rarr;</span> {e.newValue ?? "(none)"}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
