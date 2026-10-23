import { after } from "next/server";
import { invalidateSharedReads } from "./shareRead";
import { dispatchNotificationEmails } from "@/lib/notificationEmails";
import { processNotificationActivity } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { currentUserId, currentUserName } from "@/lib/identityServer";

export type ActivityLogMeta = {
  /** Structured before/after for the audit view - optional, most call sites skip it and rely on `detail`. */
  previousValue?: string | null;
  newValue?: string | null;
  sourceScreen?: string | null;
};

/**
 * Write one activity-log entry attributed to the sidebar identity ("Working as").
 * Never throws - a logging hiccup must not fail or roll back the business
 * mutation it narrates. All per-folder log helpers should delegate here.
 */
type ActivityActor = { id: string; name: string };

/** Reuse a server-verified actor within one request, never a client-provided identity. */
export function activityLoggerFor(actor: ActivityActor) {
  return (...args: Parameters<typeof logActivity>) => writeActivity(actor, ...args);
}

export async function logActivity(
  linkedType: string, linkedId: string, action: string, detail: string, meta?: ActivityLogMeta
): Promise<void> {
  return writeActivity(null, linkedType, linkedId, action, detail, meta);
}

async function writeActivity(
  actor: ActivityActor | null,
  linkedType: string,
  linkedId: string,
  action: string,
  detail: string,
  meta?: ActivityLogMeta
): Promise<void> {
  invalidateSharedReads();
  try {
    const [userName, userId] = actor ? [actor.name, actor.id] : await Promise.all([currentUserName(), currentUserId()]);
    const entry = await prisma.activityLog.create({
      data: {
        userName,
        userId,
        linkedType,
        linkedId,
        action,
        detail,
        previousValue: meta?.previousValue ?? null,
        newValue: meta?.newValue ?? null,
        sourceScreen: meta?.sourceScreen ?? null,
      },
    });
    // Finish ordinary record handoffs before the next page reads My Items.
    // The audit row remains the durable retry job if the database is temporarily unavailable.
    let processed = false;
    if (["opportunity", "order", "line_item", "service_issue"].includes(linkedType)) {
      try { await processNotificationActivity(prisma, entry); processed = true; }
      catch (error) { console.error("assignment/notification queued for retry", error); }
    }
    after(async () => {
      try { if (!processed) await processNotificationActivity(prisma, entry); }
      catch (error) { console.error("notification delivery queued for retry", error); }
      invalidateSharedReads();
      try { await dispatchNotificationEmails(prisma); }
      catch { console.error("notification email delivery queued for retry"); }
    });
  } catch (err) {
    console.error("activity log write failed", err);
  }
}
