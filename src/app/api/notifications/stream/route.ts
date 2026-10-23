import { currentUser } from "@/lib/permissionsServer";
import { prisma } from "@/lib/prisma";
import { notificationStream } from "@/lib/notificationStream";
import { subscribeNotificationChanges } from "@/lib/notificationLiveHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Sign in to receive notifications." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const counts = async () => {
    const [unread, total] = await Promise.all([
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.notification.count({ where: { userId: user.id } }),
    ]);
    return { unread, total };
  };
  return notificationStream({
    signal: request.signal,
    subscribe: listener => subscribeNotificationChanges(user.id, listener),
    counts,
    snapshot: () => prisma.$transaction(async tx => {
      const [unread, total, rows] = await Promise.all([
        tx.notification.count({ where: { userId: user.id, readAt: null } }),
        tx.notification.count({ where: { userId: user.id } }),
        tx.notification.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, title: true, message: true, href: true, createdAt: true, readAt: true } }),
      ]);
      return { unread, total, latest: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })) };
    }, { isolationLevel: "RepeatableRead" }),
  });
}
