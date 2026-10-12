"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/lib/PageLayout";
import { ListControls } from "@/lib/ListControls";
import type { ListField } from "@/lib/listQuery";
import { QueryLink } from "@/lib/QueryLink";
import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { MoreRecords } from "@/lib/CollectionWindow";
import TaskBoard from "./TaskBoard";
import type { TaskGrouping } from "./boardConfig";
import QuickAddTask from "./QuickAddTask";
import TaskListClient from "./TaskListClient";
import type { TaskListData } from "./TaskRow";

export default function TaskCollection({ rows, users, fields: FIELDS, currentUserId: signedInUserId, canEdit, hasMore, limit, statusFilter: validStatus }: {
  rows: TaskListData[];
  users: { id: string; name: string }[];
  fields: ListField[];
  currentUserId: string | null;
  canEdit: boolean;
  hasMore: boolean;
  limit: number;
  statusFilter: string | null;
}) {
  const params = useSearchParams();
  const isKanban = params.get("view") === "kanban";
  const group: TaskGrouping = params.get("group") === "priority" ? "priority" : "status";
  function changeDisplay(field: "view" | "group", value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(field, value);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Tasks"
        subtitle="Internal, customer-service, and external follow-ups."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={
                rows.filter((t) => !validStatus || t.status === validStatus)
                  .length
              }
              scopeControls={<div className="toolbar-segmented" role="group" aria-label="Task scope">
              <QueryLink
                href="/tasks"
                clear={["mine"]}
                className={params.get("mine") === "1" ? "scope-option" : "scope-option is-active"}
                aria-current={params.get("mine") !== "1" ? "page" : undefined}
              >
                All tasks
              </QueryLink>
              <QueryLink
                href="/tasks?mine=1"
                className={params.get("mine") === "1" ? "scope-option is-active" : "scope-option"}
                aria-current={params.get("mine") === "1" ? "page" : undefined}
              >
                My tasks
              </QueryLink>
      </div>}
              groupBy={isKanban ? { value: group, options: [
                { value: "status", label: "Status" },
                { value: "priority", label: "Priority" },
              ], onChange: value => changeDisplay("group", value) } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => changeDisplay("view", "list")}
                  className={`chip ${!isKanban ? "chip-active" : ""}`} aria-label="Table view" aria-pressed={!isKanban} data-view-tooltip="Table view — Tasks in rows and columns">
                  <ToolbarIcon name="table" /><span className="sr-only">Table</span>
                </button>
                <button type="button" onClick={() => changeDisplay("view", "kanban")}
                  className={`chip ${isKanban ? "chip-active" : ""}`} aria-label="Kanban view" aria-pressed={isKanban} data-view-tooltip="Kanban view — Tasks grouped by status or priority">
                  <ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span>
                </button>
              </div>
            </ListControls>
          </Suspense>
        }
      >
        <Link href="/tasks/new" className="btn btn-primary">New task</Link>
      </PageHeader>

      <QuickAddTask />

      {isKanban ? (rows.length ? <TaskBoard key={group} tasks={rows} group={group} canEdit={canEdit} /> :
        <div className="empty-state">No tasks match this view. Adjust the filters or add a task above.</div>) : <TaskListClient
        tasks={rows}
        statusFilter={validStatus}
        users={users}
        currentUserId={signedInUserId}
      />}

      <MoreRecords href="/tasks" limit={limit} hasMore={hasMore} />
    </div>
  );
}
