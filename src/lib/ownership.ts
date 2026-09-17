// Shared ownership/assignment guards (reliability spec P0-4): keep open work
// off inactive teammates, both going forward (don't let it be assigned to one)
// and looking back (don't let a teammate go inactive while still holding some).

import { prisma } from "@/lib/prisma";
import { RFQ_QUEUE_STATUSES } from "@/app/rfq/queue-statuses";

const RFQ_QUEUE_VALUES = RFQ_QUEUE_STATUSES.map((s) => s.value) as string[];

/**
 * Call before writing any assigneeId/ownerId. Empty string/null always passes
 * (unassigning is always allowed). Returns null when the pick is fine, or the
 * ActionResult to hand straight back otherwise:
 *   const denied = await requireActiveAssignee(assigneeId); if (denied) return denied;
 */
export async function requireActiveAssignee(
  userId: string | null | undefined
): Promise<{ ok: false; message: string } | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, active: true } });
  if (!user) return { ok: false, message: "That teammate could not be found." };
  if (!user.active) {
    return { ok: false, message: `${user.name} is inactive and can't be assigned new work. Reactivate them first, or pick someone else.` };
  }
  return null;
}

export type OpenWorkCounts = {
  opportunities: number;
  orders: number;
  tasks: number;
  lineItems: number;
  serviceIssues: number;
  total: number;
};

/** Everything open a teammate currently owns/is assigned, across every record type that tracks one. */
export async function openWorkForUser(userId: string): Promise<OpenWorkCounts> {
  const [opportunities, orders, tasks, lineItems, serviceIssues] = await prisma.$transaction([
    prisma.opportunity.count({ where: { salespersonId: userId, stage: { notIn: ["won", "lost"] } } }),
    prisma.order.count({ where: { ownerId: userId, status: { not: "complete" } } }),
    prisma.task.count({ where: { assigneeId: userId, status: { not: "done" } } }),
    prisma.lineItem.count({ where: { assigneeId: userId, rfqStatus: { in: RFQ_QUEUE_VALUES } } }),
    prisma.serviceIssue.count({ where: { assigneeId: userId, status: { in: ["open", "in_progress"] } } }),
  ]);
  return {
    opportunities,
    orders,
    tasks,
    lineItems,
    serviceIssues,
    total: opportunities + orders + tasks + lineItems + serviceIssues,
  };
}

/** Batched version of openWorkForUser for a whole team list (one round trip per record type instead of per user). */
export async function openWorkForUsers(userIds: string[]): Promise<Map<string, OpenWorkCounts>> {
  const map = new Map<string, OpenWorkCounts>(
    userIds.map((id) => [id, { opportunities: 0, orders: 0, tasks: 0, lineItems: 0, serviceIssues: 0, total: 0 }])
  );
  if (userIds.length === 0) return map;

  const [opportunities, orders, tasks, lineItems, serviceIssues] = await prisma.$transaction([
    prisma.opportunity.groupBy({
      by: ["salespersonId"] as const,
      where: { salespersonId: { in: userIds }, stage: { notIn: ["won", "lost"] } },
      orderBy: { salespersonId: "asc" },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["ownerId"] as const,
      where: { ownerId: { in: userIds }, status: { not: "complete" } },
      orderBy: { ownerId: "asc" },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ["assigneeId"] as const,
      where: { assigneeId: { in: userIds }, status: { not: "done" } },
      orderBy: { assigneeId: "asc" },
      _count: true,
    }),
    prisma.lineItem.groupBy({
      by: ["assigneeId"] as const,
      where: { assigneeId: { in: userIds }, rfqStatus: { in: RFQ_QUEUE_VALUES } },
      orderBy: { assigneeId: "asc" },
      _count: true,
    }),
    prisma.serviceIssue.groupBy({
      by: ["assigneeId"] as const,
      where: { assigneeId: { in: userIds }, status: { in: ["open", "in_progress"] } },
      orderBy: { assigneeId: "asc" },
      _count: true,
    }),
  ]);

  // Prisma's groupBy _count return type varies with how it's inferred inside
  // $transaction's heterogeneous array - normalize instead of fighting it.
  const countOf = (c: unknown): number =>
    typeof c === "number" ? c : typeof c === "object" && c && "_all" in c && typeof c._all === "number" ? c._all : 0;

  for (const row of opportunities) {
    if (row.salespersonId) map.get(row.salespersonId)!.opportunities = countOf(row._count);
  }
  for (const row of orders) {
    if (row.ownerId) map.get(row.ownerId)!.orders = countOf(row._count);
  }
  for (const row of tasks) {
    if (row.assigneeId) map.get(row.assigneeId)!.tasks = countOf(row._count);
  }
  for (const row of lineItems) {
    if (row.assigneeId) map.get(row.assigneeId)!.lineItems = countOf(row._count);
  }
  for (const row of serviceIssues) {
    if (row.assigneeId) map.get(row.assigneeId)!.serviceIssues = countOf(row._count);
  }
  for (const counts of map.values()) {
    counts.total = counts.opportunities + counts.orders + counts.tasks + counts.lineItems + counts.serviceIssues;
  }
  return map;
}

/**
 * Moves every open record owned by `fromUserId` to `toUserId`, atomically.
 * Used by deactivateAndReassign so a deactivation can never leave work
 * silently stranded on an inactive teammate.
 */
export async function reassignAllOpenWork(fromUserId: string, toUserId: string): Promise<OpenWorkCounts> {
  const counts = await openWorkForUser(fromUserId);
  await prisma.$transaction([
    prisma.opportunity.updateMany({
      where: { salespersonId: fromUserId, stage: { notIn: ["won", "lost"] } },
      data: { salespersonId: toUserId },
    }),
    prisma.order.updateMany({
      where: { ownerId: fromUserId, status: { not: "complete" } },
      data: { ownerId: toUserId },
    }),
    prisma.task.updateMany({
      where: { assigneeId: fromUserId, status: { not: "done" } },
      data: { assigneeId: toUserId },
    }),
    prisma.lineItem.updateMany({
      where: { assigneeId: fromUserId, rfqStatus: { in: RFQ_QUEUE_VALUES } },
      data: { assigneeId: toUserId },
    }),
    prisma.serviceIssue.updateMany({
      where: { assigneeId: fromUserId, status: { in: ["open", "in_progress"] } },
      data: { assigneeId: toUserId },
    }),
  ]);
  return counts;
}
