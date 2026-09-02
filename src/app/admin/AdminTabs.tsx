"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/team", label: "Team" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label="Admin sections" className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors " +
              (active ? "border-primary text-ink font-semibold" : "border-transparent text-gray hover:text-ink")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
