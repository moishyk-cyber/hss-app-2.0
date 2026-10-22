export type CollectionIndexRow = { id: string; groups: Record<string, string | null>; amount?: number | null };
export type CollectionSnapshotData = { total: number; boardTotal?: number; defaultView?: "list"|"kanban"; listIds: string[]; laneTotals: Record<string, Record<string, number>>; laneAmounts?: Record<string, Record<string, number>> };
/** The index is globally filtered and sorted in SQL. Only selected IDs are hydrated. */
export function collectionSnapshot(index: CollectionIndexRow[], limit: number, seedFields?: string[]) {
  const listIds = index.slice(0, limit).map(row => row.id);
  const ids = new Set(listIds);
  const laneTotals: CollectionSnapshotData['laneTotals'] = {};
  const laneAmounts: NonNullable<CollectionSnapshotData["laneAmounts"]> = {};
  const perLane = Math.max(30, Math.ceil(limit / 4));
  for (const row of index) {
    for (const [field, value] of Object.entries(row.groups)) {
      if (value === null) continue;
      const counts = laneTotals[field] ??= {};
      counts[value] = (counts[value] ?? 0) + 1;
      if (row.amount !== undefined) {
        const amounts = laneAmounts[field] ??= {};
        amounts[value] = ((Math.round((amounts[value] ?? 0) * 100)) + Math.round((row.amount ?? 0) * 100)) / 100;
      }
      if ((!seedFields || seedFields.includes(field)) && counts[value] <= perLane) ids.add(row.id);
    }
  }
  return { ids: [...ids], hasMore: index.length > limit, snapshot: { total: index.length, listIds, laneTotals, laneAmounts } };
}
