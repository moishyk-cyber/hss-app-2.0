"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "task", linkedId, action, detail },
  });
}

export async function createTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const priority = String(formData.get("priority") ?? "medium");
  const type = String(formData.get("type") ?? "internal");

  const task = await prisma.task.create({
    data: {
      title,
      assigneeId,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      priority,
      type,
    },
  });
  await log(task.id, "task_created", `Task "${title}" created`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

const TASK_ORDER = ["not_started", "in_progress", "done", "stuck"];

export async function advanceTaskStatus(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return;
  const idx = TASK_ORDER.indexOf(task.status);
  const next = idx >= 0 && idx < TASK_ORDER.length - 1 ? TASK_ORDER[idx + 1] : task.status;
  await prisma.task.update({ where: { id: taskId }, data: { status: next } });
  await log(taskId, "task_status_advanced", `Task status advanced to ${next}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function completeTask(taskId: string) {
  await prisma.task.update({ where: { id: taskId }, data: { status: "done" } });
  await log(taskId, "task_completed", "Task marked done");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
