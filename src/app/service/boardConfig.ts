import { SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";

export type ServiceGrouping = "status" | "priority";
export function serviceLanes(group: ServiceGrouping) {
  return group === "priority" ? [...TASK_PRIORITIES].reverse() : SERVICE_ISSUE_STATUSES;
}
