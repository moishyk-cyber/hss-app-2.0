export { MoreRecords } from "./ScrollCollectionWindow";
export function collectionLimit(
  params: Record<string, string | string[] | undefined>,
) {
  const raw = Number(params.records);
  return Number.isSafeInteger(raw) && raw >= 120 ? raw : 120;
}
