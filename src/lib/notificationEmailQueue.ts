import type { Prisma } from "@prisma/client";

export const EMAIL_START_KEY = "notifications.emailStartedAt";
export function validEmail(value: string) {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) && value.length <= 254;
}

/** Inbox notices and their email jobs commit together. Old inbox history never becomes an email blast. */
export async function saveNotificationRows(tx: Prisma.TransactionClient, data: Prisma.NotificationCreateManyInput[]) {
  if (!data.length) return;
  await tx.notification.createMany({ data, skipDuplicates: true });
  if (process.env.NOTIFICATION_EMAIL_ENABLED === "false" || process.env.BULK_TEST_MODE === 'true') return;
  const start = await tx.appSetting.findUnique({ where: { key: EMAIL_START_KEY } });
  if (!start) return;
  const allowed = new Set(data.map(row => `${row.userId}:${row.eventKey}`));
  const rows = await tx.notification.findMany({ where: {
    eventKey: { in: data.map(row => row.eventKey) }, userId: { in: [...new Set(data.map(row => row.userId))] },
    createdAt: { gte: new Date(start.value) },
  }, include: { user: { select: { active: true, email: true } } } });
  const jobs = rows.filter(row => row.kind !== 'qa_stress' && !`${row.title} ${row.message}`.includes('[LOAD TEST]') && allowed.has(`${row.userId}:${row.eventKey}`) && row.user.active && validEmail(row.user.email.trim())).map(row => ({
    notificationId: row.id, recipient: row.user.email.trim(), status: "pending", availableAt: new Date(),
  }));
  if (jobs.length) await tx.notificationEmail.createMany({ data: jobs, skipDuplicates: true });
}
