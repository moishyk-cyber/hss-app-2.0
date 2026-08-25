"use client";

import { useRef, useState, useTransition } from "react";
import { Spinner } from "@/lib/ui";
import { searchRecords } from "./actions";
import type { SearchResult } from "./actions";
import { TYPE_LABELS } from "./lib";

export default function LinkedRecordPicker({
  placeholder = "Search opportunities, orders, items, companies, contacts…",
  onSelect,
  autoFocus,
}: {
  placeholder?: string;
  onSelect: (choice: SearchResult) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const r = await searchRecords(v);
        setResults(r);
        setOpen(true);
      });
    }, 250);
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          autoFocus={autoFocus}
          className="input-klyne w-full pr-7"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {isPending && <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray" />}
      </div>
      {open && (
        <div className="card absolute z-20 mt-1 max-h-64 w-full overflow-y-auto p-1">
          {results.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-gray">No matches.</div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover"
                onClick={() => {
                  onSelect(r);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <span className="badge badge-gray shrink-0 text-[10px]">{TYPE_LABELS[r.type]}</span>
                <span className="truncate text-ink">{r.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
