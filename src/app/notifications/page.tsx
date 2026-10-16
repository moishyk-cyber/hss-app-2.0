import { Suspense } from "react";
import Link from "@/lib/IntentLink";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/permissionsServer";
import { PageHeader } from "@/lib/PageLayout";
import { ListControls } from "@/lib/ListControls";
import { TableRows } from "@/lib/CollectionViews";
import { MoreRecords } from "@/lib/CollectionWindow";
import { NotificationControls, ReadNotificationButton } from "./NotificationControls";
import type { ListField } from "@/lib/listQuery";

const fields: ListField[] = [];
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const dynamic = "force-dynamic";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const unreadOnly = params.scope === "unread";
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const rawLimit = Number(params.records);
  const limit = Number.isSafeInteger(rawLimit) ? Math.max(120, Math.min(rawLimit, 1200)) : 120;
  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}), ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { message: { contains: search, mode: "insensitive" as const } }] } : {}) };
  const [rows, count] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }),
    prisma.notification.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  return <div>
    <PageHeader title="Notifications" subtitle="Updates for you. New alerts appear while the app is open; enable sound for a buzz."
      toolbar={<Suspense><ListControls fields={fields} searchParam="q" count={count} scopeSelect={{ label: "Notifications", value: unreadOnly ? "unread" : "all", options: [{ value: "all", label: "All" }, { value: "unread", label: "Unread" }], param: "scope" }} /></Suspense>}>
      <NotificationControls />
    </PageHeader>
    <p className="mb-4 text-sm text-gray-dark">Updates refresh every 30 seconds while the app is open. Turn on sound for a buzz in this session.</p>
    {!rows.length ? <div className="empty-state">{search ? "No notifications match your search." : unreadOnly ? "You’re all caught up. No unread notifications." : "No notifications yet. Your workflow handoffs and task reminders will appear here."}</div> : <>
      <div className="table-scroll"><table className="table-klyne">
        <thead><tr><th>Status</th><th>Notification</th><th>Received (UTC)</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <TableRows columns={4}>{rows.slice(0, limit).map(row => <tr key={row.id}>
          <td><span className={`badge ${row.readAt ? "badge-gray" : "badge-blue"}`}>{row.readAt ? "Read" : "Unread"}</span></td>
          <td><Link href={row.href} className={`${row.readAt ? "font-medium" : "font-semibold"} hover:underline`}>{row.title}</Link><p className="mt-1 max-w-prose whitespace-normal text-xs text-gray-dark">{row.message}</p></td>
          <td><time dateTime={row.createdAt.toISOString()}>{dateFormat.format(row.createdAt)}</time></td>
          <td>{!row.readAt && <ReadNotificationButton id={row.id} />}</td>
        </tr>)}</TableRows>
      </table></div>
      <MoreRecords limit={limit} hasMore={hasMore} href="/notifications" />
    </>}
  </div>;
}
