"use client";
import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ListField } from "./listQuery";
import { InstantSearch, Spinner } from "./ui";
import { ToolbarIcon } from "./ToolbarIcon";
import { FilterBuilder } from "./FilterBuilder";
import {
  readFilterTree,
  type FilterNode,
  type FilterGroup,
} from "./nestedFilters";

export function ListControls({
  fields,
  searchParam,
  count,
  hasMore = false,
  children,
  displayControls,
}: {
  fields: readonly ListField[];
  searchParam?: string;
  count?: number;
  hasMore?: boolean;
  children?: ReactNode;
  displayControls?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const latest = useRef(params.toString());
  const queryString = params.toString();
  useEffect(() => {
    if (!pending) latest.current = queryString;
  }, [queryString, pending]);
  const rawTree = params.get("filter_tree");
  const baseTree = useMemo(
    () => readFilterTree(rawTree, fields),
    [rawTree, fields],
  );
  const [tree, previewTree] = useOptimistic(baseTree);
  const active = Array.from(params.entries()).filter(
    ([key, value]) =>
      value &&
      (key.startsWith("f_") ||
        ["q", "status", "due", "type", "mine"].includes(key)),
  );
  const [showFilters, setShowFilters] = useState(false);
  const searchField = fields.find(
    (field) => field.type === "text" && field.filterable !== false,
  );
  const searchKey = searchParam ?? (searchField ? `f_${searchField.key}` : "");
  const [showSearch, setShowSearch] = useState(false);
  const displayRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const menu = displayRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }
    function closeOnEscape(event: KeyboardEvent) {
      const menu = displayRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      menu.open = false;
      if (menu.contains(document.activeElement)) {
        menu.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  function update(mutate: (query: URLSearchParams) => void) {
    const query = new URLSearchParams(latest.current);
    mutate(query);
    query.delete("page");
    query.delete("records");
    latest.current = query.toString();
    startTransition(() => {
      previewTree(readFilterTree(query.get("filter_tree"), fields));
      router.replace(query.size ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }
  function changeTree(
    path: number[],
    mutate: (node: FilterNode) => FilterNode | null,
  ) {
    update((query) => {
      const current = readFilterTree(query.get("filter_tree"), fields);
      function visit(node: FilterNode, depth: number): FilterNode | null {
        if (depth === path.length) return mutate(node);
        if (!("children" in node)) return node;
        return {
          ...node,
          children: node.children
            .map((child, index) =>
              index === path[depth] ? visit(child, depth + 1) : child,
            )
            .filter((child): child is FilterNode => child !== null),
        };
      }
      const next = visit(current, 0) as FilterGroup;
      if (next?.children.length) query.set("filter_tree", JSON.stringify(next));
      else query.delete("filter_tree");
    });
  }
  function label(key: string, value: string) {
    const field = fields.find((field) => `f_${field.key}` === key);
    return `${field?.label ?? { q: "Search", status: "Status", due: "Due", type: "Type", mine: "Owner" }[key] ?? key}: ${field?.options?.find((option) => option.value === value)?.label ?? (key === "mine" ? "Me" : value.replaceAll("_", " "))}`;
  }
  return (
    <section
      className="collection-toolbar"
      aria-label="Collection controls"
      aria-busy={pending}
    >
      {count !== undefined && (
        <span role="status" className="collection-count">{count}{hasMore ? "+" : ""}</span>
      )}
      <div className="toolbar-row">
        {children && <div className="collection-view-controls">{children}</div>}
        {searchKey && (showSearch || params.get(searchKey)) && (
          <div className="toolbar-search">
            <ToolbarIcon name="search" />
            <InstantSearch
              paramKey={searchKey}
              placeholder={
                searchParam === "q"
                  ? "Search names, phone or email…"
                  : `Search ${searchField?.label.toLowerCase() ?? "records"}…`
              }
              ariaLabel="Search this list"
              className="input-klyne w-full"
            />
          </div>
        )}
        {searchKey && <button type="button" className="toolbar-icon-button" title="Search" aria-label="Search this list" aria-expanded={showSearch || !!params.get(searchKey)} onClick={() => setShowSearch(!showSearch)}><ToolbarIcon name="search" /></button>}
        <button
          type="button"
          className={`btn btn-sm filter-toggle ${showFilters ? "is-active" : ""}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          <ToolbarIcon name="filter" />
          Filters
          {(tree.children.length > 0 || active.length > 0) && (
            <span className="filter-dot" aria-label="Filters applied" />
          )}
        </button>
        {(displayControls || (["/deliveries", "/rfq"].includes(pathname) && params.get("view") !== "kanban")) && (
          <details ref={displayRef} className="toolbar-display">
            <summary className="btn btn-sm">Display</summary>
            <div className="toolbar-display-panel">
              {displayControls}
        {["/deliveries", "/rfq"].includes(pathname) &&
          params.get("view") !== "kanban" && (
            <label className="toolbar-group">
              Group by
              <select
                className="input-klyne text-xs"
                value={params.get("group") ?? "stage"}
                onChange={(e) =>
                  update((query) => query.set("group", e.target.value))
                }
              >
                <option value="stage">Stage</option>
                <option value="none">None</option>
                {fields
                  .filter(
                    (field) => field.type === "enum" && field.key !== "status",
                  )
                  .map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
            </div>
          </details>
        )}
        {pending && <Spinner />}
      </div>
      {showFilters && (
        <div className="collection-filter-row">
          {active.map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="legacy-filter-chip"
              aria-label={`Remove ${label(key, value)} filter`}
              onClick={() => update((query) => query.delete(key))}
            >
              {label(key, value)} <span aria-hidden>×</span>
            </button>
          ))}
          <FilterBuilder tree={tree} fields={fields} onChange={changeTree} />
          {(active.length > 0 || tree.children.length > 0) && (
            <button
              type="button"
              className="clear-filters"
              onClick={() =>
                update((query) => {
                  active.forEach(([key]) => query.delete(key));
                  query.delete("filter_tree");
                })
              }
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}
