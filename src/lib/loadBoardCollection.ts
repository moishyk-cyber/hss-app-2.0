/** One bounded snapshot supports every display without refetching on view changes. */
export async function loadBoardCollection<Row extends { id: string }, Where>(
  query: (where: Where, take?: number) => Promise<Row[]>,
  where: Where,
  limit: number,
  lanes: Where[],
  and: (conditions: Where[]) => Where,
  byIds: (ids: string[]) => Where,
  queryIds: (where: Where, take?: number) => Promise<{ id: string }[]> = query,
): Promise<{ rows: Row[]; hasMore: boolean }> {
  const initial = await query(where, limit + 1);
  if (initial.length <= limit) return { rows: initial, hasMore: false };
  const windows = await Promise.all(lanes.map(lane => queryIds(and([where, lane]), limit + 1)));
  const ids = [...new Set(windows.flatMap(window => window.slice(0, limit).map(row => row.id)))];
  const rows = await query(and([where, byIds(ids)]), ids.length);
  return { rows, hasMore: windows.some(window => window.length > limit) };
}
