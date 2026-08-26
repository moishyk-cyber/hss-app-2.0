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
    items: [{ href: "/orders", label: "Orders" }],
  },
  {
    label: "Everyone",
    items: [
      { href: "/phonebook", label: "Phone Book" },
      { href: "/tasks", label: "Tasks" },
      { href: "/team", label: "Team" },
    ],
  },
];

const ALIASES: Record<string, string[]> = {
  "/phonebook": ["/companies", "/contacts"],
};

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    (ALIASES[href] ?? []).some((a) => pathname.startsWith(a));

  return (
    <nav className="flex-1 px-4 py-3 space-y-6">
      <Link
        href="/intake"
        className={
          "flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold shadow-[0_1px_2px_rgba(253,0,1,0.15),0_4px_10px_rgba(253,0,1,0.18)] transition-colors active:scale-[0.99] " +
          (isActive("/intake")
            ? "bg-accent text-white"
            : "bg-accent text-white hover:bg-[#d90001]")
        }
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
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
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
