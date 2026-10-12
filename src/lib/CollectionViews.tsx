"use client";
import {
  Children,
  useEffect,
  useRef,
  useState,
  useTransition,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortHeader({
  field,
  children,
}: {
  field?: string;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
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
            const q = new URLSearchParams(params);
            q.set(
              "sort",
              `${field}:${key === field && dir !== "desc" ? "desc" : "asc"}`,
            );
            q.delete("page");
            q.delete("records");
            event.currentTarget.closest(".table-scroll")?.scrollTo({ top: 0 });
            startTransition(() =>
              router.replace(`${path}?${q}`, { scroll: false }),
            );
          }}
        >
          {children}
          <span aria-hidden>
            {pending
              ? "…"
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
  const rows = Children.toArray(children);
  const [page, setPage] = useState(0);
  const params = useSearchParams();
  const resetParams = new URLSearchParams(params);
  resetParams.delete("records");
  const query = resetParams.toString();
  const [previous, setPrevious] = useState(query);
  if (previous !== query) {
    setPrevious(query);
    setPage(0);
  }
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 30) - 1));
  return (
    <>
      <tbody>{rows.slice(current * 30, (current + 1) * 30)}</tbody>
      {rows.length > 30 && (
        <tfoot>
          <tr>
            <td colSpan={columns}>
              <div className="pagination">
                <span role="status">
                  {current * 30 + 1}–{Math.min((current + 1) * 30, rows.length)}{" "}
                  of {rows.length}
                </span>
                <button
                  className="btn btn-sm"
                  disabled={!current}
                  onClick={(e) => {
                    setPage(current - 1);
                    e.currentTarget
                      .closest(".table-scroll")
                      ?.scrollTo({ top: 0 });
                  }}
                >
                  Previous
                </button>
                <button
                  className="btn btn-sm"
                  disabled={(current + 1) * 30 >= rows.length}
                  onClick={(e) => {
                    setPage(current + 1);
                    e.currentTarget
                      .closest(".table-scroll")
                      ?.scrollTo({ top: 0 });
                  }}
                >
                  Next
                </button>
              </div>
            </td>
          </tr>
        </tfoot>
      )}
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
}: {
  children: ReactNode;
  laneKey: string;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
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
  const sorted = [...rows].sort(
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
          draggable
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
          <div className="lane-reorder">
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
          </div>
        </div>
      ))}
      {rows.length > limit && (
        <button
          className="btn btn-sm w-full"
          onClick={() => setLimit(limit + 20)}
        >
          Load {Math.min(20, rows.length - limit)} more · {rows.length - limit}{" "}
          remaining
        </button>
      )}
    </div>
  );
}
export function CollectionGroup({
  title,
  count,
  children,
  flat = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  flat?: boolean;
}) {
  if (flat) return <>{children}</>;
  return (
    <details open className="collection-group">
      <summary>
        <span aria-hidden className="group-chevron">
          ›
        </span>
        {title}
        <span className="group-count">{count}</span>
      </summary>
      <div className="group-content">{children}</div>
    </details>
  );
}
