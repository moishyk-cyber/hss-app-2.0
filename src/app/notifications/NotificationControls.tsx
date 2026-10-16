"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/lib/ui";
import { readNotification } from "./actions";
import { useNotifications } from "./NotificationProvider";

export function ReadNotificationButton({ id }: { id?: string }) {
  return <ActionButton className="btn btn-sm" action={async () => {
    const result = await readNotification(id);
    if (result.ok) window.dispatchEvent(new Event("notifications:read"));
    return result;
  }}>{id ? "Mark read" : "Mark all read"}</ActionButton>;
}
export function NotificationControls() {
  const notifications = useNotifications();
  const router = useRouter();
  const latestId = notifications?.latestId;
  useEffect(() => { if (latestId) router.refresh(); }, [latestId, router]);
  return <>
    <button type="button" className="btn btn-sm" aria-pressed={notifications?.sound ?? false} onClick={() => notifications?.toggleSound()}>Sound {notifications?.sound ? "on" : "off"}</button>
    <button type="button" className="btn btn-sm" onClick={async () => { await notifications?.refresh(); router.refresh(); }}>Refresh</button>
    <ReadNotificationButton />
    {notifications?.error && <span role="status" className="text-sm text-red">Could not update notifications. Try Refresh.</span>}
  </>;
}
