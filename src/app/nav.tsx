"use client";

import Link from "@/lib/IntentLink";
import { useState } from "react";
import { usePathname } from "next/navigation";

const SECTIONS: {
  label: string | null;
  items: { href: string; label: string }[];
}[] = [
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
    label: "Bill",
    items: [{ href: "/invoices", label: "Invoices" }],
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
  "/orders": ["/purchase-orders"],
};

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, string> = {
    "/dashboard": "M3 10 12 3l9 7v11h-6v-7H9v7H3z",
    "/pipeline": "M4 4v16M12 4v16M20 4v16M6 7h3M14 11h3M6 14h3",
    "/rfq": "M5 3h10l4 4v14H5zM9 11h6M9 15h6",
    "/orders": "M4 7h16v14H4zM8 7V3h8v4M4 12h16",
    "/invoices": "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    "/deliveries":
      "M3 6h12v12H3zM15 10h4l3 4v4h-7M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
    "/service": "M4 5h16v11H9l-5 4z",
    "/phonebook": "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
    "/tasks": "m5 12 4 4L19 6",
    "/admin":
      "M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  };
  return (
    <svg
      aria-hidden
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[href] ?? paths["/tasks"]} />
    </svg>
  );
}

export default function Nav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    (ALIASES[href] ?? []).some((a) => pathname.startsWith(a));

  return (
    <div className="app-nav" data-open={open}>
      <button
        type="button"
        className="nav-toggle btn"
        aria-expanded={open}
        aria-controls="app-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close navigation" : "Menu"}
      </button>
      <nav id="app-navigation" className="compact-navigation">
        <Link href="/intake" className="nav-intake">
          + New Intake
        </Link>
        {SECTIONS.map((section, si) => (
          <div key={si}>
            {section.label && (
              <div className="nav-section-label">{section.label}</div>
            )}
            <div className="space-y-0.5">
              {section.items
                .filter((item) => item.href !== "/admin" || showAdmin)
                .map((item) => (
                  <Link
                    onClick={() => setOpen(false)}
                    key={item.href}
                    href={item.href}
                    className={
                      "nav-item " +
                      (isActive(item.href) ? "nav-item-active" : "")
                    }
                  >
                    <NavIcon href={item.href} />
                    {item.label}
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
