"use client";

// List row for /service (and reused by OrderIssuesPanel's per-order list):
// title + priority badge, a breadcrumb of the record it's linked to, reported
// date and assignee, and a status pill. Clicking the row (anywhere but a
// breadcrumb link or the status pill) opens IssueModal with the full detail.

import { useState } from "react";
import Link from "next/link";
import {
  SERVICE_ISSUE_STATUSES,
  SERVICE_ISSUE_STATUS_COLORS,
  TASK_PRIORITIES,
  TASK_PRIORITY_COLORS,
  labelFor,
} from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import { BadgeSelect } from "@/lib/ui";
import { fmtDateUTC } from "@/lib/dates";
import { setServiceIssueStatus } from "./actions";
import IssueModal from "./IssueModal";

export type IssueRowData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  reportedAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  company: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  order: { id: string; title: string } | null;
  lineItem: { id: string; name: string } | null;
};

function Breadcrumb({ issue }: { issue: IssueRowData }) {
  const parts: React.ReactNode[] = [];
  if (issue.company) {
    parts.push(
      <Link
        key="company"
        href={`/companies/${issue.company.id}`}
        onClick={(e) => e.stopPropagation()}
        className="truncate text-blue transition-colors hover:underline"
      >
        {issue.company.name}
      </Link>
    );
  }
  if (issue.location) parts.push(<span key="location">{issue.location.name}</span>);
  if (issue.order) {
    parts.push(
      <Link
        key="order"
        href={`/orders/${issue.order.id}#service`}
        onClick={(e) => e.stopPropagation()}
        className="truncate text-blue transition-colors hover:underline"
      >
        {issue.order.title}
      </Link>
    );
  }
  if (issue.lineItem) parts.push(<span key="item">{issue.lineItem.name}</span>);

  if (parts.length === 0) return <span className="empty-value">not linked to a record</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {parts.map((part, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <span aria-hidden className="text-gray">›</span>}
          {part}
        </span>
      ))}
    </span>
  );
}

export default function IssueRow({
  issue,
  users,
}: {
  issue: IssueRowData;
  users: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex cursor-pointer flex-wrap items-start gap-3 px-4 py-2.5 transition-colors hover:bg-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{issue.title}</span>
            <span className={`badge ${TASK_PRIORITY_COLORS[issue.priority] ?? "badge-gray"} shrink-0`}>
              {labelFor(TASK_PRIORITIES, issue.priority)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray">
            <Breadcrumb issue={issue} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray">
            <span>Reported {fmtDateUTC(issue.reportedAt)}</span>
            {issue.assigneeName ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={issue.assigneeName} kind="person" size="sm" />
                {issue.assigneeName}
              </span>
            ) : (
              <span>Unassigned</span>
            )}
          </div>
        </div>

        <span className="relative z-10 shrink-0" onClick={(e) => e.stopPropagation()}>
          <BadgeSelect
            value={issue.status}
            options={SERVICE_ISSUE_STATUSES}
            action={(next) => setServiceIssueStatus(issue.id, next)}
            colorMap={SERVICE_ISSUE_STATUS_COLORS}
            ariaLabel="Change issue status"
          />
        </span>
      </div>

      {open && <IssueModal issue={issue} users={users} onClose={() => setOpen(false)} />}
    </>
  );
}
