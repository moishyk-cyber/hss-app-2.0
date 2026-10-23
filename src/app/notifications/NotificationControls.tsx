"use client";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/lib/ui";
import { readNotification } from "./actions";
import { useNotifications } from "./NotificationProvider";

export function ReadNotificationButton({ id }: { id?: string }) {
  const notifications = useNotifications();
  return <ActionButton className="btn btn-sm" action={async () => {
    const result = await readNotification(id);
    if (result.ok) notifications?.markRead(id);
    return result;
  }}>{id ? "Mark read" : "Mark all read"}</ActionButton>;
}
export function NotificationControls() {
  const notifications = useNotifications();
  const router = useRouter();
  return <>
    <button type="button" className="btn btn-sm" aria-pressed={notifications?.sound ?? false} onClick={() => notifications?.toggleSound()}>Sound {notifications?.sound ? "on" : "off"}</button>
    <button type="button" className="btn btn-sm" onClick={async () => { await notifications?.refresh(); router.refresh(); }}>Refresh</button>
    <ReadNotificationButton />
    <span role="status" className={`text-xs ${notifications?.error ? "text-red" : "text-gray-dark"}`}>{notifications?.error ? "Reconnecting…" : notifications?.unread === null ? "Connecting…" : "Live"}</span>
  </>;
}
