"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { isValidValue, SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";

async function log(issueId: string, action: string, detail: string): Promise<void> {
  await logActivity("service_issue", issueId, action, detail);
}

/** Every surface a ServiceIssue's state is visible on. */
function revalidateIssue(issue: { orderId: string | null; companyId: string | null }): void {
  revalidatePath("/service");
  revalidatePath("/dashboard");
  if (issue.orderId) revalidatePath(`/orders/${issue.orderId}`);
  if (issue.companyId) revalidatePath(`/companies/${issue.companyId}`);
}

export async function createServiceIssue(formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Enter a title for the issue." };
  const priority = String(formData.get("priority") ?? "medium");
  if (!isValidValue(TASK_PRIORITIES, priority)) return { ok: false, message: "Not a valid priority." };

  const description = String(formData.get("description") ?? "").trim() || null;
  const companyId = String(formData.get("companyId") ?? "") || null;
  const locationId = String(formData.get("locationId") ?? "") || null;
  const orderId = String(formData.get("orderId") ?? "") || null;
  const lineItemId = String(formData.get("lineItemId") ?? "") || null;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const reportedAtRaw = String(formData.get("reportedAt") ?? "");

  return safeAction(async () => {
    const issue = await prisma.serviceIssue.create({
      data: {
        title,
        description,
        priority,
        companyId,
        locationId,
        orderId,
        lineItemId,
        assigneeId,
        ...(reportedAtRaw ? { reportedAt: new Date(reportedAtRaw) } : {}),
      },
    });
    await log(issue.id, "service_issue_created", `Issue "${title}" logged`);
    revalidateIssue(issue);
  }, "Could not log the issue. Please try again.");
}

export async function updateServiceIssue(
  id: string,
  fields: { title?: string; description?: string; priority?: string; resolution?: string }
): Promise<ActionResult> {
  if (fields.priority !== undefined && !isValidValue(TASK_PRIORITIES, fields.priority)) {
    return { ok: false, message: "Not a valid priority." };
  }
  if (fields.title !== undefined && !fields.title.trim()) {
    return { ok: false, message: "Title can't be empty." };
  }
  return safeAction(async () => {
    const data: Prisma.ServiceIssueUpdateInput = {};
    if (fields.title !== undefined) data.title = fields.title.trim();
    if (fields.description !== undefined) data.description = fields.description.trim() || null;
    if (fields.priority !== undefined) data.priority = fields.priority;
    if (fields.resolution !== undefined) data.resolution = fields.resolution.trim() || null;
    const issue = await prisma.serviceIssue.update({ where: { id }, data });
    await log(id, "service_issue_updated", `Issue "${issue.title}" updated`);
    revalidateIssue(issue);
  }, "Could not update the issue. Please try again.");
}

export async function setServiceIssueStatus(id: string, status: string): Promise<ActionResult> {
  if (!isValidValue(SERVICE_ISSUE_STATUSES, status)) {
    return { ok: false, message: "Not a valid status." };
  }
  return safeAction(async () => {
    const current = await prisma.serviceIssue.findUniqueOrThrow({
      where: { id },
      select: { title: true, resolvedAt: true },
    });
    const reopening = status === "open" || status === "in_progress";
    const data: Prisma.ServiceIssueUpdateInput = { status };
    if (reopening) data.resolvedAt = null;
    else if (!current.resolvedAt) data.resolvedAt = new Date();

    const issue = await prisma.serviceIssue.update({ where: { id }, data });
    await log(id, "service_issue_status_set", `Issue "${current.title}" status set to ${status}`);
    revalidateIssue(issue);
  }, "Could not update the issue status. Please try again.");
}

export async function assignServiceIssue(id: string, userId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const issue = await prisma.serviceIssue.update({
      where: { id },
      data: { assigneeId: userId || null },
    });
    await log(id, "service_issue_assigned", `Assignee set to ${userId || "unassigned"}`);
    revalidateIssue(issue);
  }, "Could not update the assignee. Please try again.");
}

/** "Resolve": sets status = resolved, stamps resolvedAt, and records the resolution text. */
export async function resolveServiceIssue(id: string, resolution: string): Promise<ActionResult> {
  return safeAction(async () => {
    const issue = await prisma.serviceIssue.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date(), resolution: resolution.trim() || null },
    });
    await log(id, "service_issue_resolved", `Issue "${issue.title}" resolved`);
    revalidateIssue(issue);
  }, "Could not resolve the issue. Please try again.");
}
