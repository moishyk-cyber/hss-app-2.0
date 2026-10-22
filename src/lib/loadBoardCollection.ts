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
  if (lanes.length === 0) {
    const rows = await query(where, limit + 1);
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
  }
  const lightweight = queryIds !== query;
  const initial = await (lightweight ? queryIds : query)(where, limit + 1);
  if (initial.length <= limit) return { rows: lightweight ? initial.length ? await query(where, limit) : [] : initial.slice(0, limit) as Row[], hasMore: initial.length > limit };
  // Keep each lane populated without serializing hundreds of extra rows for every view switch.
  const laneLimit = Math.min(limit, Math.max(30, Math.ceil(limit / 4)));
  const windows = await Promise.all(lanes.map(lane => queryIds(and([where, lane]), laneLimit + 1)));
  const ids = [...new Set(windows.flatMap(window => window.slice(0, laneLimit).map(row => row.id)))];
  const rows = await query(and([where, byIds(ids)]), ids.length);
  return { rows, hasMore: windows.some(window => window.length > laneLimit) };
}
