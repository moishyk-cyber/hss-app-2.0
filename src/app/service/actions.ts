"use server";

import { validateServiceIssueLinks } from "@/lib/serviceIssueLinks";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { isValidValue, SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { addServiceNote, serviceNoteProblem } from "@/lib/workflows/serviceNotes";
import { currentUser, requirePermission } from "@/lib/permissionsServer";
import { requireActiveAssignee } from "@/lib/ownership";
import { cleanText, parseDateOnly, TEXT_LIMITS } from "@/lib/input";

async function log(issueId: string, action: string, detail: string): Promise<void> {
  await logActivity("service_issue", issueId, action, detail);
}

/** Every surface a ServiceIssue's state is visible on. */
function revalidateIssue(issue: { orderId: string | null; companyId: string | null }): void {
  revalidatePath("/service");
  revalidatePath("/service/[id]", "page");
  revalidatePath("/dashboard");
  if (issue.orderId) revalidatePath(`/orders/${issue.orderId}`);
  if (issue.companyId) revalidatePath(`/companies/${issue.companyId}`);
}

export async function createServiceIssue(formData: FormData): Promise<ActionResult> {
  const denied = await requirePermission("service.edit");
  if (denied) return denied;

  const title = cleanText(formData.get("title"), TEXT_LIMITS.short);
  if (!title) return { ok: false, message: "Enter a title for the issue." };
  const priority = String(formData.get("priority") ?? "medium");
  if (!isValidValue(TASK_PRIORITIES, priority)) return { ok: false, message: "Not a valid priority." };

  const description = cleanText(formData.get("description"), TEXT_LIMITS.long) || null;
  const companyId = String(formData.get("companyId") ?? "") || null;
  const locationId = String(formData.get("locationId") ?? "") || null;
  const orderId = String(formData.get("orderId") ?? "") || null;
  const lineItemId = String(formData.get("lineItemId") ?? "") || null;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const reportedAt = parseDateOnly(formData.get("reportedAt"));
  if (reportedAt === undefined) return { ok: false, message: "Enter a valid reported date." };

  const inactive = await requireActiveAssignee(assigneeId);
  if (inactive) return inactive;

  const linkError = await validateServiceIssueLinks({ companyId, locationId, orderId, lineItemId }, prisma);
  if (linkError) return { ok: false, message: linkError };

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
        ...(reportedAt ? { reportedAt } : {}),
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
  const denied = await requirePermission("service.edit");
  if (denied) return denied;
  if (fields.priority !== undefined && !isValidValue(TASK_PRIORITIES, fields.priority)) {
    return { ok: false, message: "Not a valid priority." };
  }
  if (fields.title !== undefined && !fields.title.trim()) {
    return { ok: false, message: "Title can't be empty." };
  }
  return safeAction(async () => {
    const data: Prisma.ServiceIssueUpdateInput = {};
    if (fields.title !== undefined) data.title = cleanText(fields.title, TEXT_LIMITS.short);
    if (fields.description !== undefined) data.description = cleanText(fields.description, TEXT_LIMITS.long) || null;
    if (fields.priority !== undefined) data.priority = fields.priority;
    if (fields.resolution !== undefined) data.resolution = cleanText(fields.resolution, TEXT_LIMITS.long) || null;
    const issue = await prisma.serviceIssue.update({ where: { id }, data });
    await log(id, "service_issue_updated", `Issue "${issue.title}" updated`);
    revalidateIssue(issue);
  }, "Could not update the issue. Please try again.");
}

export async function setServiceIssueStatus(id: string, status: string): Promise<ActionResult> {
  const denied = await requirePermission("service.edit");
  if (denied) return denied;
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
  const denied = await requirePermission("service.assign");
  if (denied) return denied;
  const inactive = await requireActiveAssignee(userId);
  if (inactive) return inactive;
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
  const denied = await requirePermission("service.edit");
  if (denied) return denied;
  const trimmedResolution = cleanText(resolution, TEXT_LIMITS.long);
  return safeAction(async () => {
    const issue = await prisma.serviceIssue.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date(), resolution: trimmedResolution || null },
    });
    await log(id, "service_issue_resolved", `Issue "${issue.title}" resolved`);
    revalidateIssue(issue);
  }, "Could not resolve the issue. Please try again.");
}

/** Append an update using the signed-in user's identity, never form-supplied attribution. */
export async function addServiceIssueNote(issueId: string, body: string): Promise<ActionResult> {
  const denied = await requirePermission("service.edit");
  if (denied) return denied;
  const author = await currentUser();
  if (!author) return { ok: false, message: "Sign in before adding a note." };
  const problem = serviceNoteProblem(body);
  if (problem) return { ok: false, message: problem };
  return safeAction(async () => {
    const { issue } = await addServiceNote(prisma, issueId, body, author);
    revalidateIssue(issue);
  }, "Could not save your update. Please try again.");
}
