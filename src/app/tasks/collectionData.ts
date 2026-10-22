import type { Prisma } from "@prisma/client";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { loadBoardCollection } from "@/lib/loadBoardCollection";

export function loadTaskCollection<Row extends { id: string }>(
  query: (where: Prisma.TaskWhereInput, take?: number) => Promise<Row[]>,
  where: Prisma.TaskWhereInput,
  limit: number,
  queryIds: (where: Prisma.TaskWhereInput, take?: number) => Promise<{ id: string }[]> = query,
  sorted = false,
) {
  return loadBoardCollection<Row, Prisma.TaskWhereInput>(query, where, limit, sorted ? [] : [
    ...TASK_STATUSES.map(lane => ({ status: lane.value })),
    ...TASK_PRIORITIES.map(lane => ({ priority: lane.value })),
  ], AND => ({ AND }), ids => ({ id: { in: ids } }), queryIds);
}
