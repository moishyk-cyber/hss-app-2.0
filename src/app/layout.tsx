import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HSS Kitchens",
  description: "CRM, Order & Purchasing Management",
};

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intake", label: "New Order Intake" },
  { href: "/pipeline", label: "Sales Pipeline" },
  { href: "/rfq", label: "RFQ Queue" },
  { href: "/orders", label: "Orders" },
  { href: "/companies", label: "Companies" },
  { href: "/contacts", label: "Contacts" },
  { href: "/tasks", label: "Tasks" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-gray-50 text-gray-900 font-sans">
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col">
            <div className="px-4 py-5 border-b border-gray-200">
              <Link href="/dashboard" className="block">
                <div className="text-lg font-bold tracking-tight">HSS Kitchens</div>
                <div className="text-xs text-gray-500">Sales · Orders · Purchasing</div>
              </Link>
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-400">
              MVP · built by Klyne &amp; Co.
            </div>
          </aside>
          <main className="flex-1 min-w-0 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
