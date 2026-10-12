"use client";

// Issue record content: description, ownership, status, and resolution.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  SERVICE_ISSUE_STATUSES,
  SERVICE_ISSUE_STATUS_COLORS,
  TASK_PRIORITIES,
  TASK_PRIORITY_COLORS,
  labelFor,
} from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
import { useToast } from "@/lib/toast";
import { fmtDateUTC } from "@/lib/dates";
import { assignServiceIssue, resolveServiceIssue, setServiceIssueStatus, updateServiceIssue } from "./actions";
import type { IssueRowData } from "./IssueRow";

export default function IssueDetail({
  issue,
  users,
}: {
  issue: IssueRowData;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const isOpenIssue = issue.status === "open" || issue.status === "in_progress";



  async function handleResolve() {
    setIsResolving(true);
    setError(null);
    const result = await resolveServiceIssue(issue.id, resolution);
    setIsResolving(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "Issue resolved." });
    router.refresh();
  }

  /** Editing the resolution note on an already-resolved/closed issue - does not touch status. */
  async function handleSaveResolution() {
    setIsResolving(true);
    setError(null);
    const result = await updateServiceIssue(issue.id, { resolution });
    setIsResolving(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "Resolution note saved." });
  }

  return (
    <div className="card space-y-6">


        <div className="flex flex-wrap items-center gap-1 text-xs text-gray">
          {issue.company ? (
            <Link href={`/companies/${issue.company.id}`} className="text-blue transition-colors hover:underline">
              {issue.company.name}
            </Link>
          ) : (
            <span className="empty-value">not linked to a business</span>
          )}
          {issue.location && (
            <>
              <span aria-hidden>›</span>
              <span>{issue.location.name}</span>
            </>
          )}
          {issue.order && (
            <>
              <span aria-hidden>›</span>
              <Link href={`/orders/${issue.order.id}#service`} className="text-blue transition-colors hover:underline">
                {issue.order.title}
              </Link>
            </>
          )}
          {issue.lineItem && (
            <>
              <span aria-hidden>›</span>
              <span>{issue.lineItem.name}</span>
            </>
          )}
        </div>

        {issue.description && <p className="text-sm text-gray-dark">{issue.description}</p>}

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Status
            </span>
            <BadgeSelect
              value={issue.status}
              options={SERVICE_ISSUE_STATUSES}
              action={(next) => setServiceIssueStatus(issue.id, next)}
              colorMap={SERVICE_ISSUE_STATUS_COLORS}
              ariaLabel="Change issue status"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Priority
            </span>
            <span className={`badge ${TASK_PRIORITY_COLORS[issue.priority] ?? "badge-gray"}`}>
              {labelFor(TASK_PRIORITIES, issue.priority)}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Assignee
            </span>
            <UserSelect value={issue.assigneeId ?? ""} users={users} action={(next) => assignServiceIssue(issue.id, next)} />
          </label>
          <span className="text-xs text-gray-dark">Reported {fmtDateUTC(issue.reportedAt)}</span>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <span className="field-label">Resolution</span>
          {issue.resolvedAt && <div className="text-xs text-gray">Resolved {fmtDateUTC(issue.resolvedAt)}</div>}
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            aria-label="Resolution note"
            rows={3}
            placeholder="How was this resolved?"
            className="input-klyne w-full"
          />
          {error && (
            <p role="alert" className="text-xs text-red">
              {error}
            </p>
          )}
          {isOpenIssue ? (
            <button type="button" onClick={handleResolve} disabled={isResolving} className="btn btn-primary btn-sm">
              {isResolving ? "Resolving…" : "Resolve"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveResolution}
              disabled={isResolving}
              className="btn btn-sm"
              title="Save an updated resolution note"
            >
              {isResolving ? "Saving…" : "Save resolution"}
            </button>
          )}
        </div>
    </div>
  );
}
