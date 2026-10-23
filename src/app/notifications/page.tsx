import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/permissionsServer";
import { PageHeader } from "@/lib/PageLayout";
import { collectionLimit } from "@/lib/CollectionWindow";
import { NotificationControls } from "./NotificationControls";
import { NotificationInbox, NotificationListControls } from "./NotificationInbox";

export const dynamic = "force-dynamic";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const renderedAt = new Date().toISOString();
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const unreadOnly = params.scope === "unread";
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const limit = collectionLimit(params);
  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}), ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { message: { contains: search, mode: "insensitive" as const } }] } : {}) };
  const [rows, count] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }),
    prisma.notification.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  return <div>
    <PageHeader title="Notifications" subtitle="Your workflow updates and task reminders."
      toolbar={<Suspense><NotificationListControls count={count} unreadOnly={unreadOnly} search={search} renderedAt={renderedAt} /></Suspense>}>
      <NotificationControls />
    </PageHeader>
    <NotificationInbox initialRows={rows.slice(0, limit).map(row => ({ id: row.id, title: row.title, message: row.message, href: row.href, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null }))} unreadOnly={unreadOnly} search={search} limit={limit} hasMore={hasMore} />
  </div>;
}
