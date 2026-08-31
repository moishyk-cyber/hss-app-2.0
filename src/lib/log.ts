import { prisma } from "@/lib/prisma";
import { currentUserName } from "@/lib/identityServer";

/**
 * Write one activity-log entry attributed to the sidebar identity ("Working as").
 * Never throws - a logging hiccup must not fail or roll back the business
 * mutation it narrates. All per-folder log helpers should delegate here.
 */
export async function logActivity(
  linkedType: string,
  linkedId: string,
  action: string,
  detail: string
): Promise<void> {
  try {
    const userName = await currentUserName();
    await prisma.activityLog.create({
      data: { userName, linkedType, linkedId, action, detail },
    });
  } catch (err) {
    console.error("activity log write failed", err);
  }
}
