import type { LiveNotification } from "./notificationLiveTypes";
export function notificationMatches(item: LiveNotification, unreadOnly: boolean, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return (!unreadOnly || !item.readAt) && (!query || `${item.title}\n${item.message}`.toLocaleLowerCase().includes(query));
}
/** Merge pushed changes by ID so new arrivals never need an automatic page fetch. */
export function notificationInboxRows(initial: LiveNotification[], changes: LiveNotification[], unreadOnly: boolean, search: string, readThrough: string | null) {
  const rows = new Map(initial.map(item => [item.id, item]));
  const changedIds = new Set(changes.map(item => item.id));
  for (const item of changes) rows.set(item.id, item);
  return [...rows.values()].map(item => !changedIds.has(item.id) && !item.readAt && readThrough && item.createdAt <= readThrough ? { ...item, readAt: readThrough } : item)
    .filter(item => notificationMatches(item, unreadOnly, search))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
