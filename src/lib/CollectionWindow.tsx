import { QueryLink } from "./QueryLink";
export function collectionLimit(
  params: Record<string, string | string[] | undefined>,
) {
  const raw = Number(params.records);
  return Number.isSafeInteger(raw) && raw >= 120 ? raw : 120;
}
export function MoreRecords({
  limit,
  hasMore,
  href,
}: {
  limit: number;
  hasMore: boolean;
  href: string;
}) {
  return hasMore ? (
    <div className="flex items-center justify-center gap-3 py-3">
      <span className="text-xs text-gray-dark">More records available</span>
      <QueryLink href={`${href}?records=${limit + 120}`} className="btn btn-sm">
        Load more records
      </QueryLink>
    </div>
  ) : null;
}
