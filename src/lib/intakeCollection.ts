/** The same intake filters apply to directly-created orders awaiting payment. */
export function orderIntakeQuery(value: unknown): unknown {
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(orderIntakeQuery);
  const names: Record<string, string> = { salesperson: 'owner', salespersonId: 'ownerId', value: 'orderValue' };
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [names[key] ?? key, orderIntakeQuery(entry)]));
}
export type IntakeSortRow = { id: string; title: string; value: unknown; orderType: string; createdAt: Date; neededByDate: Date | null; nextFollowUp: Date | null; company: { name: string } | null; salesperson: { name: string } | null };
export function sortIntakeRows<T extends IntakeSortRow>(rows: T[], sort: string, direction: string): T[] {
  const key = sort || 'created';
  const descending = sort ? direction === 'desc' : true;
  const value = (row: T, field: string): string | number | null => field === 'title' ? row.title : field === 'orderType' ? row.orderType : field === 'company' ? row.company?.name ?? null : field === 'salesperson' ? row.salesperson?.name ?? null : field === 'value' ? row.value == null ? null : Number(row.value) : (field === 'neededBy' ? row.neededByDate : field === 'followUp' ? row.nextFollowUp : row.createdAt)?.getTime() ?? null;
  const compare = (a: string | number | null, b: string | number | null, desc: boolean) => a == null ? b == null ? 0 : desc ? -1 : 1 : b == null ? desc ? 1 : -1 : (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * (desc ? -1 : 1);
  return rows.sort((a, b) => compare(value(a, key), value(b, key), descending) || (key === 'company' ? compare(a.title, b.title, false) : ['orderType', 'salesperson'].includes(key) ? compare(a.createdAt.getTime(), b.createdAt.getTime(), true) : 0) || a.id.localeCompare(b.id));
}
