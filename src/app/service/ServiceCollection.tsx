"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import ServiceBoard from "./ServiceBoard";
import type { ServiceGrouping } from "./boardConfig";
import { PageHeader } from "@/lib/PageLayout";
import { ListControls } from "@/lib/ListControls";
import type { ListField } from "@/lib/listQuery";
import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { MoreRecords } from "@/lib/CollectionWindow";
import IssueRow, { type IssueListData } from "./IssueRow";

export default function ServiceCollection({ issues: issueRows, users, fields: FIELDS, canEdit, hasMore, limit, filtered }: {
  issues: IssueListData[];
  users: { id: string; name: string }[];
  fields: ListField[];
  canEdit: boolean;
  hasMore: boolean;
  limit: number;
  filtered: boolean;
}) {
  const params = useSearchParams();
  const isKanban = params.get("view") === "kanban";
  const group: ServiceGrouping = params.get("group") === "priority" ? "priority" : "status";
  function changeDisplay(field: "view" | "group", value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(field, value);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Customer Service"
        subtitle="Customer issues from every order and line item."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={issueRows.length}
              groupBy={isKanban ? { value: group, options: [
                { value: "status", label: "Status" },
                { value: "priority", label: "Priority" },
              ], onChange: value => changeDisplay("group", value) } : undefined}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => changeDisplay("view", "list")}
                  className={`chip ${!isKanban ? "chip-active" : ""}`} aria-label="Table view" aria-pressed={!isKanban}
                  data-view-tooltip="Table view — Customer service in rows and columns">
                  <ToolbarIcon name="table" /><span className="sr-only">Table</span>
                </button>
                <button type="button" onClick={() => changeDisplay("view", "kanban")}
                  className={`chip ${isKanban ? "chip-active" : ""}`} aria-label="Kanban view" aria-pressed={isKanban}
                  data-view-tooltip="Kanban view — Customer service grouped by status or priority">
                  <ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span>
                </button>
              </div>
            </ListControls>
          </Suspense>
        }
      >
        <Link href="/service/new" className="btn btn-primary">
          Log an issue
        </Link>
      </PageHeader>

      {issueRows.length === 0 ? (
        <div className="empty-state">
          {filtered
            ? "No issues match these filters."
            : "No service issues yet. They land here once someone logs a customer call from the header, or from an order's Service tab."}
        </div>
      ) : isKanban ? (
        <ServiceBoard key={group} issues={issueRows} group={group} canEdit={canEdit} />
      ) : (
        <div className="table-scroll">
          <table className="table-klyne min-w-[900px]">
            <thead>
              <tr>
                <SortHeader field="title">Issue</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="priority">Priority</SortHeader>
                <SortHeader field="company">Related record</SortHeader>
                <SortHeader field="assignee">Assignee</SortHeader>
                <SortHeader field="reportedAt">Reported</SortHeader>
              </tr>
            </thead>
            <TableRows columns={6}>
              {issueRows.map((r) => (
                <IssueRow key={r.id} issue={r} users={users} />
              ))}
            </TableRows>
          </table>
        </div>
      )}
      <MoreRecords href="/service" limit={limit} hasMore={hasMore} />
    </div>
  );
}
