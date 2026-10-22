/** A record keeps one canonical URL from intake through fulfillment. */
export function recordPath(id: string, opportunityId?: string | null) {
  return `/records/${encodeURIComponent(opportunityId ?? id)}`;
}
