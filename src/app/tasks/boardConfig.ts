import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
export type TaskGrouping = "status" | "priority";
export function taskLanes(group: TaskGrouping) {
  return group === "priority" ? [...TASK_PRIORITIES].reverse() : TASK_STATUSES;
}
