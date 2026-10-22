"use client";
import { BackgroundStatus } from "@/lib/BackgroundStatus";
import { useLaneTotal } from "@/lib/CollectionScope";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/lib/IntentLink";
import { LaneItems } from "@/lib/CollectionViews";
import { CollapsibleKanbanLane } from "@/lib/CollapsibleKanbanLane";
import { BadgeSelect, FormAlert } from "@/lib/ui";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLORS, labelFor } from "@/lib/constants";
import { TASK_STATUS_COLORS, TASK_TYPE_LABELS, isOverdue } from "./lib";
import { fmtDateUTC } from "@/lib/dates";
import { setTaskStatus, setTaskPriority } from "./actions";
import type { TaskListData } from "./TaskRow";
import { taskLanes, type TaskGrouping } from "./boardConfig";

export default function TaskBoard({ tasks, group, canEdit }: {
  tasks: TaskListData[];
  group: TaskGrouping;
  canEdit: boolean;
}) {
  const total=useLaneTotal(group);
  const router = useRouter();
  const [cards, applyMove] = useOptimistic(tasks, (current, move: { id: string; field: TaskGrouping; value: string }) =>
    current.map(card => card.id === move.id ? { ...card, [move.field]: move.value } : card));
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lanes = taskLanes(group);

  async function move(id: string, field: TaskGrouping, value: string) {
    setError(null);
    applyMove({ id, field, value });
    try {
      return field === "status" ? await setTaskStatus(id, value) : await setTaskPriority(id, value);
    } catch {
      return { ok: false as const, message: "Could not save the change. Please try again." };
    }
  }

  return <div className="space-y-3" aria-busy={pending}>
    <BackgroundStatus active={pending}/>
    {error && <FormAlert>{error}</FormAlert>}
    <div className="kanban-board" aria-label={`Tasks by ${group}`}>
      {lanes.map(lane => {
        const laneCards = cards.filter(card => card[group] === lane.value);
        return <CollapsibleKanbanLane key={lane.value} label={lane.label} count={total(lane.value,laneCards.length,tasks.filter(row=>row[group]===lane.value).length)} className={target === lane.value ? "is-drop-target" : ""}
          onDragOver={event => {
            if (!canEdit || pending || !dragging) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setTarget(lane.value);
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
          }}
          onDrop={event => {
            event.preventDefault();
            const id = event.dataTransfer.getData("application/x-hss-task");
            setDragging(null);
            setTarget(null);
            if (!canEdit || pending || !cards.some(card => card.id === id && card[group] !== lane.value)) return;
            startTransition(async () => {
              const result = await move(id, group, lane.value);
              if (result.ok === false) setError(result.message);
              else router.refresh();
            });
          }}>
            <LaneItems laneKey={`tasks:${group}:${lane.value}`}>
              {laneCards.map(card => <article key={card.id}
                draggable={canEdit && !pending}
                onDragStart={event => {
                  if (!canEdit || pending || (event.target as HTMLElement).closest("button,input,select")) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData("application/x-hss-task", card.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragging(card.id);
                }}
                onDragEnd={() => { setDragging(null); setTarget(null); }}
                className={`card-sunken card-interactive kanban-card relative ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === card.id ? "opacity-50" : ""}`}>
                <Link href={`/tasks/${card.id}`} draggable={false} title={card.title}
                  className="kanban-card-title block text-ink hover:underline after:absolute after:inset-0 after:content-['']">{card.title}</Link>
                <div className="kanban-card-company text-xs text-gray-dark">
                  {TASK_TYPE_LABELS[card.type] ?? card.type}
                </div>
                {card.linkedLabel && <p className="kanban-card-note text-xs text-gray-dark break-words">{card.linkedLabel}</p>}
                {card.subtasks.length > 0 && <p className="kanban-card-note text-xs text-gray-dark">
                  {card.subtasks.filter(task => task.status === "done").length}/{card.subtasks.length} subtasks complete
                </p>}
                <div className="kanban-card-status relative z-10 flex flex-wrap gap-1.5">
                  {canEdit ? <>
                    <BadgeSelect value={card.status} options={TASK_STATUSES} colorMap={TASK_STATUS_COLORS}
                      ariaLabel={`Status for ${card.title}`} action={next => move(card.id, "status", next)} />
                    <BadgeSelect value={card.priority} options={TASK_PRIORITIES} colorMap={TASK_PRIORITY_COLORS}
                      ariaLabel={`Priority for ${card.title}`} action={next => move(card.id, "priority", next)} />
                  </> : <>
                    <span className={`badge ${TASK_STATUS_COLORS[card.status] ?? "badge-gray"}`}>{labelFor(TASK_STATUSES, card.status)}</span>
                    <span className={`badge ${TASK_PRIORITY_COLORS[card.priority] ?? "badge-gray"}`}>{labelFor(TASK_PRIORITIES, card.priority)}</span>
                  </>}
                </div>
                <div className="kanban-card-facts flex justify-between gap-2 text-xs text-gray-dark">
                  <span>{card.assigneeName ?? "Unassigned"}</span>
                  <span className={isOverdue(card.dueDate, card.status) ? "text-red" : ""}>{card.dueDate ? `${isOverdue(card.dueDate, card.status) ? "Overdue" : "Due"} ${fmtDateUTC(card.dueDate)}` : "No due date"}</span>
                </div>
              </article>)}
            </LaneItems>
            {!laneCards.length && <p className="text-xs text-gray-dark">No tasks</p>}
        </CollapsibleKanbanLane>;
      })}
    </div>
  </div>;
}
