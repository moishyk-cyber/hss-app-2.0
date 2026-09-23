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
export async function logActivity(
  linkedType: string,
  linkedId: string,
  action: string,
  detail: string,
  meta?: ActivityLogMeta
): Promise<void> {
  try {
    const [userName, userId] = await Promise.all([currentUserName(), currentUserId()]);
    await prisma.activityLog.create({
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
  } catch (err) {
    console.error("activity log write failed", err);
  }
}
