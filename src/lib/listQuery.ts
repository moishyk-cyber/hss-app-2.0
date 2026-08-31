// Server-side half of the app-wide list Sort by / Filter by controls.
// Pages declare their fields once (shared with ListControls), then use
// parseListQuery to read the URL params the control writes.

export type ListField = {
  key: string;
  label: string;
  /** enum renders a value dropdown from options; text a search box; date/number a typed input. */
  type: "enum" | "text" | "date" | "number";
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** Field can be offered for sorting (default true). */
  sortable?: boolean;
  /** Field can be offered for filtering (default true). */
  filterable?: boolean;
};

export type ParsedListQuery = {
  sortKey: string | null;
  sortDir: "asc" | "desc";
  /** filter values keyed by field key; only keys present in the URL appear. */
  filters: Record<string, string>;
};

/**
 * Reads `?sort=key:dir` plus one `f_<key>=value` param per active filter.
 * Unknown keys are ignored so a stale URL can't break a page.
 */
export function parseListQuery(
  fields: ReadonlyArray<ListField>,
  searchParams: Record<string, string | string[] | undefined>
): ParsedListQuery {
  const known = new Set(fields.map((f) => f.key));

  const rawSort = typeof searchParams.sort === "string" ? searchParams.sort : "";
  const [sortKeyRaw, sortDirRaw] = rawSort.split(":");
  const sortKey = known.has(sortKeyRaw) ? sortKeyRaw : null;
  const sortDir: "asc" | "desc" = sortDirRaw === "desc" ? "desc" : "asc";

  const filters: Record<string, string> = {};
  for (const field of fields) {
    if (field.filterable === false) continue;
    const raw = searchParams[`f_${field.key}`];
    if (typeof raw === "string" && raw !== "") filters[field.key] = raw;
  }

  return { sortKey, sortDir, filters };
}
