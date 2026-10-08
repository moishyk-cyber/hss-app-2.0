"use client";
// BackLink - the ONE back-navigation control, used at the top of every detail and
// form page (Aug 31 feedback: friendlier, and identical everywhere). Server-renderable.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};

export function BackLink({ href, label = "Back", className }: { href: string; label?: string; className?: string }) {
  const pathname = usePathname();
  const destination = useSyncExternalStore(subscribe, () => {
    try { const saved = sessionStorage.getItem(`hss:return:${pathname}`); return saved && saved.startsWith("/") && !saved.startsWith("//") ? saved : href; } catch { return href; }
  }, () => href);
  const destinationParts = destination.split(/[?#]/)[0].split("/").filter(Boolean);
  const fallbackGroup = href.split("/")[1];
  const groups: Record<string,[string,string]> = {orders:["Orders","Order"],pipeline:["Pipeline","Deal"],tasks:["Tasks","Task"],service:["Customer Service","Issue"],companies:["Businesses","Business"],contacts:["Contacts","Contact"],deliveries:["Deliveries","Delivery"],"purchase-orders":["Purchase Orders","Purchase Order"],phonebook:["Phone Book","Phone Book"]};
  const group = groups[destinationParts[0]];
  const displayLabel = label !== "Cancel" && destinationParts[0] !== fallbackGroup && group ? `Back to ${group[destinationParts.length > 1 ? 1 : 0]}` : label;
  return (
    <Link
      href={destination}
      scroll={false}
      onClick={() => { try { const path = destination.split(/[?#]/)[0]; sessionStorage.setItem(`hss:restore:${path}`, sessionStorage.getItem(`hss:scroll:${path}`) ?? "0"); } catch { /* optional */ } }}
      className={className ?? "inline-flex items-center gap-1 rounded-full border border-border bg-panel py-1.5 pl-2 pr-3 text-[12.5px] font-medium text-gray-dark transition-colors hover:bg-hover hover:text-ink"}
    >
      {label !== "Cancel" && <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>}
      {displayLabel}
    </Link>
  );
}
