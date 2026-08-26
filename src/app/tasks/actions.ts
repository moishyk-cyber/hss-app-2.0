"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "task", linkedId, action, detail },
  });
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Enter a title for the task." };
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const priority = String(formData.get("priority") ?? "medium");
  const type = String(formData.get("type") ?? "internal");
  const linkedType = String(formData.get("linkedType") ?? "") || null;
  const linkedId = String(formData.get("linkedId") ?? "") || null;

  return safeAction(async () => {
    const task = await prisma.task.create({
      data: {
        title,
        assigneeId,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        priority,
        type,
        linkedType,
        linkedId,
      },
    });
    await log(task.id, "task_created", `Task "${title}" created`);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
  }, "Could not create the task. Please try again.");
}

export async function setTaskStatus(taskId: string, status: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.task.update({ where: { id: taskId }, data: { status } });
    await log(taskId, "task_status_set", `Task status set to ${status}`);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
  }, "Could not update task status. Please try again.");
}

export async function setTaskAssignee(taskId: string, assigneeId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.task.update({ where: { id: taskId }, data: { assigneeId: assigneeId || null } });
    await log(taskId, "task_assignee_set", `Assignee set to ${assigneeId || "unassigned"}`);
    revalidatePath("/tasks");
  }, "Could not update the assignee. Please try again.");
}

export async function setTaskPriority(taskId: string, priority: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.task.update({ where: { id: taskId }, data: { priority } });
    await log(taskId, "task_priority_set", `Task priority set to ${priority}`);
    revalidatePath("/tasks");
  }, "Could not update task priority. Please try again.");
}

export async function setTaskLink(taskId: string, linkedType: string, linkedId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.task.update({ where: { id: taskId }, data: { linkedType, linkedId } });
    await log(taskId, "task_linked", `Task linked to ${linkedType}:${linkedId}`);
    revalidatePath("/tasks");
  }, "Could not link the task. Please try again.");
}

export async function addTaskComment(
  taskId: string,
  body: string,
  authorId: string | null,
  authorName: string | null
): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { ok: false, message: "Comment can't be empty." };
  return safeAction(async () => {
    await prisma.taskComment.create({
      data: {
        taskId,
        body: text,
        authorId: authorId || null,
        authorName: authorId ? null : authorName || "Team",
      },
    });
    await log(taskId, "task_commented", "Comment added");
    revalidatePath("/tasks");
  }, "Could not post the comment. Please try again.");
}

export type TaskCommentData = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string | null;
  author: { name: string } | null;
};

/** Comment bodies aren't shipped with the task list — fetched lazily on first expand. */
export async function getTaskComments(taskId: string): Promise<TaskCommentData[]> {
  return prisma.taskComment.findMany({
    where: { taskId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export type SearchResult = {
  type: "opportunity" | "order" | "line_item" | "company" | "contact";
  id: string;
  label: string;
};

/** Combobox search across the record types a task can link to. Top ~8 matches. */
export async function searchRecords(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];

  const [opportunities, orders, lineItems, companies, contacts] = await Promise.all([
    prisma.opportunity.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      select: { id: true, title: true },
      take: 5,
    }),
    prisma.order.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      select: { id: true, title: true },
      take: 5,
    }),
    prisma.lineItem.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 5,
    }),
    prisma.company.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 5,
    }),
    prisma.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      take: 5,
    }),
  ]);

  const results: SearchResult[] = [
    ...opportunities.map((o) => ({ type: "opportunity" as const, id: o.id, label: o.title })),
    ...orders.map((o) => ({ type: "order" as const, id: o.id, label: o.title })),
    ...lineItems.map((i) => ({ type: "line_item" as const, id: i.id, label: i.name })),
    ...companies.map((c) => ({ type: "company" as const, id: c.id, label: c.name })),
    ...contacts.map((c) => ({ type: "contact" as const, id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() })),
  ];

  return results.slice(0, 8);
}
