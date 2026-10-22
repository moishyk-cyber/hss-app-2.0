import type { Prisma } from "@prisma/client";
import { SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { loadBoardCollection } from "@/lib/loadBoardCollection";

/** Load one shared snapshot for both layouts and grouping choices. */
export async function loadServiceCollection<Row extends { id: string }>(
  query: (where: Prisma.ServiceIssueWhereInput, take?: number) => Promise<Row[]>,
  where: Prisma.ServiceIssueWhereInput,
  limit: number,
  queryIds: (where: Prisma.ServiceIssueWhereInput, take?: number) => Promise<{ id: string }[]> = query,
  sorted = false,
): Promise<{ rows: Row[]; hasMore: boolean }> {
  return loadBoardCollection<Row, Prisma.ServiceIssueWhereInput>(query, where, limit, sorted ? [] : [
    ...SERVICE_ISSUE_STATUSES.map(lane => ({ status: lane.value })),
    ...TASK_PRIORITIES.map(lane => ({ priority: lane.value })),
  ], AND => ({ AND }), ids => ({ id: { in: ids } }), queryIds);
}
