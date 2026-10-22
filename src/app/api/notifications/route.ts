import { dispatchNotificationEmails } from "@/lib/notificationEmails";
import { currentUser } from "@/lib/permissionsServer";
import { prisma } from "@/lib/prisma";
import { notifyDueTasks, retryNotificationActivity } from "@/lib/notifications";
import { hasSameOrigin } from "@/lib/requestOrigin";

const privateHeaders = { "Cache-Control": "private, no-store" };
async function feed(userId: string) {
  const [unread, latest] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5, select: { id: true, title: true, createdAt: true, readAt: true } }),
  ]);
  return Response.json({ unread, latest }, { headers: privateHeaders });
}
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Sign in to view notifications." }, { status: 401, headers: privateHeaders });
  try { return await feed(user.id); }
  catch { return Response.json({ message: "Could not load notifications." }, { status: 503, headers: privateHeaders }); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ message: "Reload the app and try again." }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ message: "Sign in to view notifications." }, { status: 401, headers: privateHeaders });
  try {
    await retryNotificationActivity(prisma);
    await notifyDueTasks(prisma, user.id);
    try { await dispatchNotificationEmails(prisma); } catch { console.error("notification email retry deferred"); }
    return await feed(user.id);
  } catch {
    return Response.json({ message: "Notifications are temporarily unavailable. Please retry." }, { status: 503, headers: privateHeaders });
  }
}
