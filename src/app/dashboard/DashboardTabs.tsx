"use client";

// Dashboard tabs (Aug 31 feedback round 3: "split it into two tabs: 1. An
// actual dashboard of the graphs 2. Open items or My Items"). Same hash-driven
// pattern as the order detail's OrderTabs - deep links via #overview and
// #my-items, and both panels stay mounted so switching tabs never refetches.

import { useEffect, useState } from "react";

type TabKey = "overview" | "my-items";

const HASH_TO_TAB: Record<string, TabKey> = {
  "#overview": "overview",
  "#my-items": "my-items",
};

const TABS: { key: TabKey; label: string; hash: string }[] = [
  { key: "overview", label: "Overview", hash: "#overview" },
  { key: "my-items", label: "My Items", hash: "#my-items" },
];

export function DashboardTabs({
  overview,
  myItems,
}: {
  overview: React.ReactNode;
  myItems: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  // Honor a hash present on load, and react to later hash changes (back /
  // forward, or a plain <a href="#my-items"> anywhere on the page).
  useEffect(() => {
    function syncFromHash() {
      const mapped = HASH_TO_TAB[window.location.hash];
      if (mapped) setTab(mapped);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  function selectTab(next: TabKey, hash: string) {
    setTab(next);
    window.history.replaceState(null, "", `${window.location.search}${hash}`);
  }

  return (
    <div>
      <div role="tablist" aria-label="Dashboard sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t.key, t.hash)}
              className={
                "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors " +
                (active ? "border-primary text-ink font-semibold" : "border-transparent text-gray hover:text-ink")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="pt-6">
        <div className={tab === "overview" ? "" : "hidden"}>{overview}</div>
        <div className={tab === "my-items" ? "" : "hidden"}>{myItems}</div>
      </div>
    </div>
  );
}
