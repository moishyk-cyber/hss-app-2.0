"use client";

// Order detail tabs (Aug 31 feedback: "create tabs... Invoice tab, a PO tab,
// a delivery tab"). Client tab bar wrapping three server-rendered panels.
// Supports deep links via URL hash - #invoice, #purchase-orders, #delivery,
// plus the legacy #payments anchor mapped onto Invoice. The FlowStepper above
// this component drives it via next/link `href`s that point at these same
// hashes (same interaction language as the sales pipeline stepper).

import { useCallback, useEffect, useRef, useState } from "react";

type TabKey = "invoice" | "purchase-orders" | "delivery";

const HASH_TO_TAB: Record<string, TabKey> = {
  "#invoice": "invoice",
  "#payments": "invoice", // legacy anchor, kept working
  "#purchase-orders": "purchase-orders",
  "#delivery": "delivery",
};

const TABS: { key: TabKey; label: string; hash: string }[] = [
  { key: "invoice", label: "Invoice", hash: "#invoice" },
  { key: "purchase-orders", label: "Purchase Orders", hash: "#purchase-orders" },
  { key: "delivery", label: "Delivery", hash: "#delivery" },
];

export function OrderTabs({
  defaultTab,
  invoice,
  purchaseOrders,
  delivery,
}: {
  defaultTab: TabKey;
  invoice: React.ReactNode;
  purchaseOrders: React.ReactNode;
  delivery: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>(defaultTab);

  // Sep 3 QA #7: the header's "Record payment" (and the stepper's step links)
  // are plain <a href="#invoice">s. When their target tab was ALREADY showing,
  // setTab() was a no-op and the click looked completely dead. Every such
  // click now scrolls the tabs into view and briefly highlights the panel, so
  // something visibly happens whether or not the tab actually changed.
  const rootRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawAttention = useCallback(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 600);
  }, []);
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Deep-link support: honor a hash present on load, and react to any later
  // hash change (back/forward, or a plain <a href="#..."> like the header's
  // primary action).
  useEffect(() => {
    function syncFromHash() {
      const mapped = HASH_TO_TAB[window.location.hash];
      if (mapped) setTab(mapped);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // Belt-and-suspenders: the FlowStepper's steps render as next/link <Link>s,
  // which navigate via history.pushState rather than a real hash assignment -
  // that doesn't reliably fire "hashchange". Catch the click directly instead.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const hashIdx = href.indexOf("#");
      if (hashIdx === -1) return;
      const mapped = HASH_TO_TAB[href.slice(hashIdx)];
      if (!mapped) return;
      setTab(mapped);
      drawAttention();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [drawAttention]);

  function selectTab(next: TabKey, hash: string) {
    setTab(next);
    window.history.replaceState(null, "", hash);
  }

  return (
    <div ref={rootRef} className="scroll-mt-4">
      <div role="tablist" aria-label="Order sections" className="flex gap-1 border-b border-border">
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
                (active
                  ? "border-primary text-ink font-semibold"
                  : "border-transparent text-gray hover:text-ink")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {/* The ring snaps on and fades out via the transition once `flash` clears. */}
      <div
        className={
          "mt-5 rounded-lg transition-[box-shadow,background-color] duration-500 ease-out " +
          (flash ? "bg-hover ring-2 ring-primary/60 ring-offset-4 ring-offset-panel" : "")
        }
      >
        <div className={tab === "invoice" ? "" : "hidden"}>{invoice}</div>
        <div className={tab === "purchase-orders" ? "" : "hidden"}>{purchaseOrders}</div>
        <div className={tab === "delivery" ? "" : "hidden"}>{delivery}</div>
      </div>
    </div>
  );
}
