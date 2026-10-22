"use client";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  useTransition,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CollectionGroupScope, useCollectionTotal, useLaneTotal, useTableRecordIds } from "./CollectionScope";
import { Spinner } from "./ui";
import { collectionHref, stageCollectionQuery } from "./collectionNavigation";

export function SortHeader({
  field,
  children,
}: {
  field?: string;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, dir] = (params.get("sort") ?? "").split(":");
  return (
    <th
      aria-sort={
        field && key === field
          ? dir === "desc"
            ? "descending"
            : "ascending"
          : "none"
      }
    >
      {field ? (
        <button
          className="table-sort"
          disabled={pending}
          aria-busy={pending}
          onClick={(event) => {
            const q = stageCollectionQuery(query => {
            const [currentKey, currentDir] = (query.get("sort") ?? "").split(":");
            query.set(
              "sort",
              `${field}:${currentKey === field && currentDir !== "desc" ? "desc" : "asc"}`,
            );
            query.delete("page");
            query.delete("records");
            });
            event.currentTarget.closest(".table-scroll")?.scrollTo({ top: 0 });
            startTransition(() =>
              router.replace(collectionHref(q), { scroll: false }),
            );
          }}
        >
          {children}
          <span aria-hidden>
            {pending
              ? <Spinner />
              : key === field
                ? dir === "desc"
                  ? "↓"
                  : "↑"
                : "↕"}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}
export function TableRows({
  children,
  columns,
}: {
  children: ReactNode;
  columns: number;
}) {
  const total=useCollectionTotal();
  const allowed=useTableRecordIds();
  const rows: ReactNode[]=[];
  Children.forEach(children,row=>{if(!allowed || (isValidElement(row) && allowed.has(String(row.key)))) rows.push(row);});
  const [visible, setVisible] = useState(30);
  const sentinel = useRef<HTMLTableRowElement>(null);
  const params = useSearchParams();
  const resetParams = new URLSearchParams(params);
  resetParams.delete("records");
  const query = resetParams.toString();
  const [previous, setPrevious] = useState(query);
  if (previous !== query) {
    setPrevious(query);
    setVisible(30);
  }
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      if (visible < rows.length) setVisible(count => Math.min(count + 30, rows.length));
      else if (total === undefined || rows.length < total) window.dispatchEvent(new CustomEvent("collection:load-more", { detail: { point: node.querySelector<HTMLElement>(".collection-load-point") } }));
    }, { root: node.closest(".table-scroll"), rootMargin: "0px 0px 160px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rows.length, query, total]);
  return (
    <>
      <tbody>{rows.slice(0, visible)}<tr ref={sentinel} data-collection-sentinel><td colSpan={columns} className="collection-sentinel"><div className="collection-load-point" /></td></tr></tbody>
    </>
  );
}
function subscribeOrder(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("hss-board-order", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hss-board-order", callback);
  };
}
export function LaneItems({
  children,
  laneKey,
  total: suppliedTotal,
}: {
  children: ReactNode;
  laneKey: string;
  total?: number;
}) {
  const scopedTotal=useCollectionTotal();
  const total=suppliedTotal??scopedTotal;
  const laneRef = useRef<HTMLDivElement>(null);
  const laneEnd = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const resetParams = new URLSearchParams(params);
  resetParams.delete("records");
  const query = resetParams.toString();
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    // A lane owns vertical scrolling; sideways gestures belong to its board.
    const forwardHorizontal = (event: WheelEvent) => {
      if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))
        return;
      const board = lane.closest<HTMLElement>(".kanban-board");
      if (!board || board.scrollWidth <= board.clientWidth) return;
      const delta =
        event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? board.clientWidth
            : 1;
      board.scrollLeft += delta * unit;
      event.preventDefault();
    };
    lane.addEventListener("wheel", forwardHorizontal, { passive: false });
    return () => lane.removeEventListener("wheel", forwardHorizontal);
  }, []);
  const rows = Children.toArray(children);
  const [limit, setLimit] = useState(20);
  const [previousQuery, setPreviousQuery] = useState(query);
  if (previousQuery !== query) { setPreviousQuery(query); setLimit(20); }
  useEffect(() => {
    const node = laneEnd.current;
    if (!node || !rows.length) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      if (limit < rows.length) setLimit(value => Math.min(value + 20, rows.length));
      else if (total === undefined || rows.length < total) window.dispatchEvent(new CustomEvent("collection:load-more", { detail: { point: node } }));
    }, { root: node.closest(".kanban-lane"), rootMargin: "0px 0px 160px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, rows.length, query, total]);
  const [memoryOrder, setMemoryOrder] = useState<string[]>([]);
  const storageKey = `hss-board:${laneKey}`;
  const stored = useSyncExternalStore(
    subscribeOrder,
    () => {
      try {
        return localStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  let order: string[] = [];
  try {
    order = stored ? JSON.parse(stored) : memoryOrder;
    if (!Array.isArray(order)) order = [];
  } catch {
    /* Ignore old or invalid preferences. */
  }
  const keyOf = (row: ReactNode) =>
    String((row as { key?: string })?.key ?? "");
  const ranks = new Map(order.map((key, index) => [key, index]));
  const sorted = params.get("sort") ? rows : [...rows].sort(
    (a, b) =>
      (ranks.get(keyOf(a)) ?? Infinity) - (ranks.get(keyOf(b)) ?? Infinity),
  );
  function reorder(from: string, to: string) {
    const keys = sorted.map(keyOf);
    const fromIndex = keys.indexOf(from);
    const toIndex = keys.indexOf(to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    keys.splice(fromIndex, 1);
    keys.splice(toIndex, 0, from);
    try {
      localStorage.setItem(storageKey, JSON.stringify(keys));
      window.dispatchEvent(new Event("hss-board-order"));
    } catch {
      setMemoryOrder(keys);
    }
  }
  return (
    <div className="lane-items" ref={laneRef}>
      {sorted.slice(0, limit).map((row, index) => (
        <div
          className="lane-entry"
          key={keyOf(row)}
          draggable={!params.get("sort")}
          onDragStartCapture={(e) => {
            if ((e.target as HTMLElement).closest("input,select,button")) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData("application/x-hss-card", keyOf(row));
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const from = e.dataTransfer.getData("application/x-hss-card");
            if (sorted.some((row) => keyOf(row) === from)) {
              e.preventDefault();
              e.stopPropagation();
              reorder(from, keyOf(row));
            }
          }}
        >
          {row}
          {!params.get("sort") && <div className="lane-reorder">
            <button
              type="button"
              className="sr-only focus:not-sr-only btn btn-sm"
              disabled={!index}
              onClick={() => reorder(keyOf(row), keyOf(sorted[index - 1]))}
            >
              Move card up
            </button>
            <button
              type="button"
              className="sr-only focus:not-sr-only btn btn-sm"
              disabled={index === sorted.length - 1}
              onClick={() => reorder(keyOf(row), keyOf(sorted[index + 1]))}
            >
              Move card down
            </button>
          </div>}
        </div>
      ))}
      <div ref={laneEnd} className="collection-load-point" />
    </div>
  );
}
export function CollectionGroup({
  title,
  count,
  totalField,
  totalValue,
  children,
  flat = false,
}: {
  title: string;
  count: number;
  totalField?: string;
  totalValue?: string;
  children: ReactNode;
  flat?: boolean;
}) {
  const total=useLaneTotal(totalField??"");
  const shownCount=totalField&&totalValue?total(totalValue,count):count;
  if (flat) return <>{children}</>;
  return (
    <details open className="collection-group">
      <summary>
        <span aria-hidden className="group-chevron">
          ›
        </span>
        {title}
        <span className="group-count">{shownCount}</span>
      </summary>
      <div className="group-content"><CollectionGroupScope total={shownCount}>{children}</CollectionGroupScope></div>
    </details>
  );
}
