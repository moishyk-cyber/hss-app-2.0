"use client";

// Shared issue row with a full-page record link and independent status control.

import { SectionLink as Link } from "@/lib/SectionLink";
import {
  SERVICE_ISSUE_STATUSES,
  SERVICE_ISSUE_STATUS_COLORS,
  TASK_PRIORITIES,
  TASK_PRIORITY_COLORS,
  labelFor,
} from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { fmtDateUTC } from "@/lib/dates";
import { setServiceIssueStatus } from "@/lib/workflowActions";

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

function Breadcrumb({ issue, fullPage }: { issue: IssueRowData; fullPage: boolean }) {
  const parts: React.ReactNode[] = [];
  if (issue.company) {
    parts.push(
      <Link fullPage={fullPage}
        key="company"
        href={`/companies/${issue.company.id}`}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 truncate text-blue transition-colors hover:underline"
      >
        {issue.company.name}
      </Link>,
    );
  }
  if (issue.location)
    parts.push(<span key="location">{issue.location.name}</span>);
  if (issue.order) {
    parts.push(
      <Link fullPage={fullPage}
        key="order"
        href={`/orders/${issue.order.id}#service`}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 truncate text-blue transition-colors hover:underline"
      >
        {issue.order.title}
      </Link>,
    );
  }
  if (issue.lineItem) parts.push(<span key="item">{issue.lineItem.name}</span>);

  if (parts.length === 0)
    return <span className="empty-value">not linked to a record</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {parts.map((part, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && (
            <span aria-hidden className="text-gray">
              ›
            </span>
          )}
          {part}
        </span>
      ))}
    </span>
  );
}

export default function IssueRow({
  issue,
  fullPage = false,
}: {
  issue: IssueRowData;
  fullPage?: boolean;
  users: { id: string; name: string }[];
}) {
  return (
    <tr>
      <td>
        <Link fullPage={fullPage}
          href={`/service/${issue.id}`}
          className="font-medium hover:underline"
        >
          {issue.title}
        </Link>
      </td>
      <td>
        <BadgeSelect
          value={issue.status}
          options={SERVICE_ISSUE_STATUSES}
          action={(next) => setServiceIssueStatus(issue.id, next)}
          colorMap={SERVICE_ISSUE_STATUS_COLORS}
          ariaLabel={`Status for ${issue.title}`}
        />
      </td>
      <td>
        <span
          className={`badge ${TASK_PRIORITY_COLORS[issue.priority] ?? "badge-gray"}`}
        >
          {labelFor(TASK_PRIORITIES, issue.priority)}
        </span>
      </td>
      <td>
        <Breadcrumb fullPage={fullPage} issue={issue} />
      </td>
      <td className="min-w-[140px] whitespace-nowrap">
        {issue.assigneeName ?? "Unassigned"}
      </td>
      <td className="whitespace-nowrap">{fmtDateUTC(issue.reportedAt)}</td>
    </tr>
  );
}
