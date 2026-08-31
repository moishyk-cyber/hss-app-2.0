"use client";

// App-wide "Sort by" / "Filter by" bar (Aug 31 feedback: on every list, any
// field). Writes `?sort=key:dir` and `f_<key>=value` params via a soft
// router.replace; the server page reads them with parseListQuery (listQuery.ts)
// and applies them to its own Prisma query.

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ListField } from "./listQuery";
import { Spinner } from "./ui";

export function ListControls({ fields }: { fields: ReadonlyArray<ListField> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortable = fields.filter((f) => f.sortable !== false);
  const filterable = fields.filter((f) => f.filterable !== false);

  const rawSort = searchParams.get("sort") ?? "";
  const [sortKey, sortDir] = rawSort.split(":");
  const activeFilterKey =
    filterable.find((f) => searchParams.get(`f_${f.key}`) != null)?.key ?? "";
  const [filterKey, setFilterKey] = useState(activeFilterKey);
  const filterField = filterable.find((f) => f.key === filterKey) ?? null;
  const filterValue = filterKey ? (searchParams.get(`f_${filterKey}`) ?? "") : "";

  function replaceParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function setSort(nextKey: string, nextDir: string) {
    replaceParams((params) => {
      if (!nextKey) params.delete("sort");
      else params.set("sort", `${nextKey}:${nextDir === "desc" ? "desc" : "asc"}`);
    });
  }

  function clearAllFilters(params: URLSearchParams) {
    for (const f of filterable) params.delete(`f_${f.key}`);
  }

  function setFilterValue(value: string, debounce = false) {
    const apply = () =>
      replaceParams((params) => {
        clearAllFilters(params);
        if (filterKey && value !== "") params.set(`f_${filterKey}`, value);
      });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (debounce) debounceRef.current = setTimeout(apply, 300);
    else apply();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-gray-dark">
        Sort by
        <select
          value={sortable.some((f) => f.key === sortKey) ? sortKey : ""}
          onChange={(e) => setSort(e.target.value, sortDir || "asc")}
          className="input-klyne px-2 py-1.5 text-xs"
        >
          <option value="">Default</option>
          {sortable.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {sortKey ? (
        <button
          type="button"
          onClick={() => setSort(sortKey, sortDir === "desc" ? "asc" : "desc")}
          className="btn btn-sm"
          title="Flip sort direction"
        >
          {sortDir === "desc" ? "Descending" : "Ascending"}
        </button>
      ) : null}

      <label className="ml-2 flex items-center gap-1.5 text-xs text-gray-dark">
        Filter by
        <select
          value={filterKey}
          onChange={(e) => {
            const next = e.target.value;
            setFilterKey(next);
            // Switching fields drops the old filter immediately.
            replaceParams((params) => clearAllFilters(params));
          }}
          className="input-klyne px-2 py-1.5 text-xs"
        >
          <option value="">None</option>
          {filterable.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {filterField ? (
        filterField.type === "enum" ? (
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="input-klyne px-2 py-1.5 text-xs"
            aria-label={`${filterField.label} value`}
          >
            <option value="">Any</option>
            {(filterField.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={filterField.type === "date" ? "date" : filterField.type === "number" ? "number" : "text"}
            defaultValue={filterValue}
            onChange={(e) => setFilterValue(e.target.value, filterField.type === "text")}
            placeholder={filterField.type === "text" ? `Filter ${filterField.label.toLowerCase()}...` : undefined}
            className="input-klyne w-40 px-2 py-1.5 text-xs"
            aria-label={`${filterField.label} value`}
          />
        )
      ) : null}

      {isPending ? <Spinner /> : null}
    </div>
  );
}
