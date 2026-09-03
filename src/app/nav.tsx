"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: { label: string | null; items: { href: string; label: string }[] }[] = [
  { label: null, items: [{ href: "/dashboard", label: "Dashboard" }] },
  {
    label: "Sell",
    items: [
      { href: "/pipeline", label: "Pipeline" },
      { href: "/rfq", label: "RFQ Queue" },
    ],
  },
  {
    label: "Fulfill",
    items: [
      { href: "/orders", label: "Orders" },
      { href: "/deliveries", label: "Deliveries" },
      { href: "/service", label: "Customer Service" },
    ],
  },
  {
    label: "Everyone",
    items: [
      { href: "/phonebook", label: "Phone Book" },
      { href: "/tasks", label: "Tasks" },
      { href: "/admin", label: "Admin" },
    ],
  },
];

const ALIASES: Record<string, string[]> = {
  "/phonebook": ["/companies", "/contacts"],
};

export default function Nav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    (ALIASES[href] ?? []).some((a) => pathname.startsWith(a));

  return (
    <nav className="flex-1 px-4 py-3 space-y-6">
      <Link
        href="/intake"
        prefetch={false}
        className="flex items-center justify-center gap-1.5 rounded-[6px] px-4 py-2.5 text-[13px] font-semibold bg-primary text-white transition-colors hover:bg-[var(--primary-hover)] active:scale-[0.99]"
      >
        + New Intake
      </Link>
      {SECTIONS.map((section, si) => (
        <div key={si}>
          {section.label && (
            <div className="px-4 pb-2 font-heading text-[10px] font-semibold uppercase tracking-[0.08em] text-gray">
              {section.label}
            </div>
          )}
          <div className="space-y-0.5">
            {section.items
              .filter((item) => item.href !== "/admin" || showAdmin)
              .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                // Every route behind this nav is force-dynamic (fresh DB reads), so a
                // prefetch buys nothing but competes with in-flight mutations for the
                // same server capacity - it's the reason a plain Save click can show up
                // in the network panel as net::ERR_ABORTED (Next's router cancels the
                // mutation's own RSC-refresh fetch when one of these superseded it).
                prefetch={false}
                className={
                  "block rounded-[10px] px-4 py-2.5 text-[13px] font-medium transition-colors " +
                  (isActive(item.href)
                    ? "bg-ink text-white"
                    : "text-gray-dark hover:bg-hover hover:text-ink")
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
