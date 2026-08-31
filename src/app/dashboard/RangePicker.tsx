"use client";

// Overview range control (Aug 31 feedback round 3): the three chip-links became
// a plain dropdown of presets plus a From / To pair for a custom window. Every
// change soft-replaces the URL in a transition, exactly like InstantSearch in
// @/lib/ui, so the server re-renders in the background without a page flash.
// The hash is preserved so the dashboard stays on the tab you are looking at.

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/lib/ui";
import { RANGE_OPTIONS, DEFAULT_RANGE } from "./ranges";

export function RangePicker() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const isCustom = Boolean(from || to);
  const range = params.get("range") ?? DEFAULT_RANGE;

  function push(next: URLSearchParams) {
    const qs = next.toString();
    startTransition(() => {
      router.replace(
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
        { scroll: false }
      );
    });
  }

  function onPreset(value: string) {
    if (value === "custom") return; // placeholder option, nothing to apply
    const sp = new URLSearchParams(params.toString());
    sp.delete("from");
    sp.delete("to");
    if (value === DEFAULT_RANGE) sp.delete("range");
    else sp.set("range", value);
    push(sp);
  }

  function onDate(key: "from" | "to", value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    push(sp);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-dark">Range</span>
        <select
          className="input-klyne"
          value={isCustom ? "custom" : range}
          onChange={(e) => onPreset(e.target.value)}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {isCustom && <option value="custom">Custom range</option>}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-dark">From</span>
        <input
          type="date"
          className="input-klyne"
          value={from}
          onChange={(e) => onDate("from", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-dark">To</span>
        <input
          type="date"
          className="input-klyne"
          value={to}
          onChange={(e) => onDate("to", e.target.value)}
        />
      </label>

      {isCustom && (
        <button type="button" className="btn btn-sm" onClick={() => onPreset(DEFAULT_RANGE)}>
          Clear dates
        </button>
      )}
      {isPending && <Spinner className="mb-2.5 text-gray" />}
    </div>
  );
}
