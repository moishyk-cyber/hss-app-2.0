"use client";
import { useMemo } from "react";
import Link from "@/lib/IntentLink";
import { TableRows } from "@/lib/CollectionViews";
import { MoreRecords } from "@/lib/CollectionWindow";
import { ListControls } from "@/lib/ListControls";
import { notificationInboxRows, notificationMatches } from "@/lib/notificationInbox";
import { notificationHref } from "@/lib/notificationLiveTypes";
import type { LiveNotification } from "@/lib/notificationLiveTypes";
import { useNotifications } from "./NotificationProvider";
import { ReadNotificationButton } from "./NotificationControls";

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function NotificationListControls({ count, unreadOnly, search, renderedAt }: { count: number; unreadOnly: boolean; search: string; renderedAt: string }) {
  const live = useNotifications()?.live;
  const incoming = live?.records.filter(item => item.createdAt > renderedAt && notificationMatches(item, unreadOnly, search)).length ?? 0;
  const currentCount = search ? count + incoming : live ? unreadOnly ? live.unread : live.total : count;
  return <ListControls fields={[]} searchParam="q" count={currentCount} scopeSelect={{ label: "Notifications", value: unreadOnly ? "unread" : "all", options: [{ value: "all", label: "All" }, { value: "unread", label: "Unread" }], param: "scope" }} />;
}

export function NotificationInbox({ initialRows, unreadOnly, search, limit, hasMore }: { initialRows: LiveNotification[]; unreadOnly: boolean; search: string; limit: number; hasMore: boolean }) {
  const live = useNotifications()?.live;
  const rows = useMemo(() => notificationInboxRows(initialRows, live?.records ?? [], unreadOnly, search, live?.readThrough ?? null), [initialRows, live, unreadOnly, search]);
  if (!rows.length) return <div className="empty-state">{search ? "No notifications match your search." : unreadOnly ? "You’re all caught up. No unread notifications." : "No notifications yet. Your workflow handoffs and task reminders will appear here."}</div>;
  return <>
    <div className="table-scroll"><table className="table-klyne">
      <thead><tr><th>Status</th><th>Notification</th><th>Received (UTC)</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <TableRows columns={4}>{rows.slice(0, limit).map(row => <tr key={row.id}>
        <td><span className={`badge ${row.readAt ? "badge-gray" : "badge-blue"}`}>{row.readAt ? "Read" : "Unread"}</span></td>
        <td><Link href={notificationHref(row.href)} className={`${row.readAt ? "font-medium" : "font-semibold"} hover:underline`}>{row.title}</Link><p className="mt-1 max-w-prose whitespace-normal text-xs text-gray-dark">{row.message}</p></td>
        <td><time dateTime={row.createdAt}>{dateFormat.format(new Date(row.createdAt))}</time></td>
        <td>{!row.readAt && <ReadNotificationButton id={row.id} />}</td>
      </tr>)}</TableRows>
    </table></div>
    <MoreRecords limit={limit} hasMore={hasMore || rows.length > limit} href="/notifications" />
  </>;
}
