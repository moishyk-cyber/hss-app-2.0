// Shared, server-only helpers for the customer-service module.

import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/**
 * Default assignee for a new issue: the configured `service.defaultAssigneeId`
 * setting when it names an active user, else the active user whose name
 * starts with "Sam" (case-insensitive), else null (unassigned).
 */
export async function resolveDefaultAssigneeId(): Promise<string | null> {
  const configuredId = await getSetting("service.defaultAssigneeId");
  if (configuredId) {
    const user = await prisma.user.findUnique({ where: { id: configuredId }, select: { active: true } });
    if (user?.active) return configuredId;
  }
  const sam = await prisma.user.findFirst({
    where: { active: true, name: { startsWith: "Sam", mode: "insensitive" } },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return sam?.id ?? null;
}
