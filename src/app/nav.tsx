"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intake", label: "New Order Intake" },
  { href: "/pipeline", label: "Sales Pipeline" },
  { href: "/rfq", label: "RFQ Queue" },
  { href: "/orders", label: "Orders" },
  { href: "/phonebook", label: "Phone Book" },
  { href: "/tasks", label: "Tasks" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-2 py-3 space-y-0.5">
      {NAV.map((item) => {
        const aliases: Record<string, string[]> = {
          "/phonebook": ["/companies", "/contacts"],
        };
        const active =
          pathname === item.href ||
          pathname.startsWith(item.href + "/") ||
          (aliases[item.href] ?? []).some((a) => pathname.startsWith(a));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors " +
              (active
                ? "bg-accent text-white"
                : "text-gray-dark hover:bg-hover hover:text-ink")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
