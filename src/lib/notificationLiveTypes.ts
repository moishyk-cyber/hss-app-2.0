/** Public payloads contain only the signed-in user's notification fields. */
export type LiveNotification = { id: string; title: string; message: string; href: string; createdAt: string; readAt: string | null };
export type NotificationSnapshot = { unread: number; total: number; latest: LiveNotification[] };
export type NotificationChange = { operation: "INSERT" | "UPDATE"; notification: LiveNotification };
export type NotificationUpdate = { unread: number; total: number; changes: NotificationChange[] };

export function notificationHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//") && !/[\\\r\n]/.test(href) ? href : "/notifications";
}

/** Treat the upstream payload as untrusted, including its recipient. */
export function notificationChange(payload: { eventType: string; new: Record<string, unknown> }, userId: string): NotificationChange | null {
  const row = payload.new;
  if (!["INSERT", "UPDATE"].includes(payload.eventType) || row.userId !== userId ||
      typeof row.id !== "string" || typeof row.title !== "string" || typeof row.message !== "string" ||
      typeof row.href !== "string" || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) ||
      !(row.readAt === null || (typeof row.readAt === "string" && Number.isFinite(Date.parse(row.readAt))))) return null;
  return { operation: payload.eventType as NotificationChange["operation"], notification: {
    id: row.id, title: row.title, message: row.message, href: notificationHref(row.href),
    createdAt: new Date(row.createdAt).toISOString(), readAt: row.readAt === null ? null : new Date(row.readAt as string).toISOString(),
  } };
}

/** No historical pop-ups on first open; reconnects announce only unseen unread rows. */
export function notificationArrivals(known: ReadonlySet<string> | null, candidates: LiveNotification[], initial: boolean) {
  return !known && initial ? [] : candidates.filter(item => !item.readAt && !known?.has(item.id));
}
