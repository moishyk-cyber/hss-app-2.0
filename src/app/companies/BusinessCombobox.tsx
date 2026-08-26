"use client";

// Type-to-search business picker with a "create what you typed" escape hatch.
// Shared by the intake screen and the contact form — a caller mid-call should
// never dead-end because the business isn't on file yet.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { RequiredMark } from "./_ui";

export type ComboboxOption = { id: string; name: string; hint?: string | null };

export function BusinessCombobox({
  label = "Business",
  placeholder = "Start typing…",
  options,
  query,
  setQuery,
  selectedId,
  onPick,
  onCreate,
  maxResults = 8,
  required,
}: {
  label?: string;
  placeholder?: string;
  options: ComboboxOption[];
  query: string;
  setQuery: (next: string) => void;
  selectedId: string;
  onPick: (option: ComboboxOption) => void;
  onCreate: (name: string) => void;
  maxResults?: number;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const trimmed = query.trim();

  const results = useMemo(() => {
    const q = trimmed.toLowerCase();
    const matches = q
      ? options.filter((o) => o.name.toLowerCase().includes(q))
      : options;
    return matches.slice(0, maxResults);
  }, [options, trimmed, maxResults]);

  const canCreate = trimmed !== "";
  const createIndex = results.length;
  const rowCount = results.length + (canCreate ? 1 : 0);

  // Stable per-row ids so the input can point at whichever option is highlighted.
  const optionId = (index: number) => `${listId}-opt-${index}`;
  const activeOptionId =
    open && rowCount > 0 ? optionId(Math.min(highlight, rowCount - 1)) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function choose(index: number) {
    if (canCreate && index === createIndex) {
      onCreate(trimmed);
      setOpen(false);
      return;
    }
    const option = results[index];
    if (option) {
      onPick(option);
      setOpen(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(0);
        return;
      }
      if (rowCount === 0) return;
      setHighlight((h) =>
        e.key === "ArrowDown" ? (h + 1) % rowCount : (h - 1 + rowCount) % rowCount
      );
      return;
    }
    if (e.key === "Enter") {
      // Never let Enter submit the surrounding form while the picker is open.
      if (open && rowCount > 0) {
        e.preventDefault();
        choose(highlight);
      } else if (canCreate && !selectedId) {
        e.preventDefault();
        setOpen(true);
        setHighlight(0);
      }
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="block">
        <span className="field-label">
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`input-klyne w-full ${selectedId ? "border-green" : ""}`}
        />
      </label>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          // Keep focus in the input so blur doesn't close the list before a click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="card card-flush absolute z-30 mt-1 max-h-64 w-full overflow-y-auto py-1.5"
        >
          {results.map((o, i) => (
            <li
              key={o.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(i)}
              className={`cursor-pointer px-3 py-1.5 text-[13px] ${
                i === highlight ? "bg-hover text-ink" : "text-gray-dark"
              }`}
            >
              {o.name}
              {o.hint ? <span className="ml-2 text-xs text-gray">{o.hint}</span> : null}
            </li>
          ))}

          {canCreate ? (
            <li
              id={optionId(createIndex)}
              role="option"
              aria-selected={highlight === createIndex}
              onMouseEnter={() => setHighlight(createIndex)}
              onClick={() => choose(createIndex)}
              className={`cursor-pointer border-t border-border px-3 py-2 text-[13px] font-medium text-accent ${
                highlight === createIndex ? "bg-accent-soft" : ""
              }`}
            >
              ＋ Create “{trimmed}”
            </li>
          ) : null}

          {rowCount === 0 ? (
            <li className="px-3 py-2 text-[13px] text-gray">
              No businesses yet — type a name to create one.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
