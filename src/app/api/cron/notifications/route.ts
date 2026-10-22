import { prisma } from "@/lib/prisma";
import { authorizedNotificationCron } from "@/lib/notificationCron";
import { dispatchNotificationEmails } from "@/lib/notificationEmails";
import { notificationEmailConfig } from "@/lib/resendEmail";
import { notifyAllDueTasks, retryNotificationActivity } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!authorizedNotificationCron(request, process.env.CRON_SECRET)) return Response.json({ ok: false }, { status: 401 });
  if (!notificationEmailConfig()) return Response.json({ ok: false, message: "Email notifications are not configured." }, { status: 503 });
  try {
    const started = Date.now();
    await retryNotificationActivity(prisma);
    await notifyAllDueTasks(prisma);
    const result = await dispatchNotificationEmails(prisma, { limit: 25, maxMs: Math.max(1000, 40000 - (Date.now() - started)) });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, message: "Notification processing failed; queued deliveries will retry." }, { status: 503 }); }
}
