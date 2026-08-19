import type { Metadata } from "next";
import { Sora, Poppins } from "next/font/google";
import Link from "next/link";
import Nav from "./nav";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "HSS Kitchens",
  description: "CRM, Order & Purchasing Management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-ink">
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 bg-panel flex flex-col border-r border-border">
            <div className="px-5 py-5">
              <Link href="/dashboard" className="block">
                <div className="font-heading text-[17px] font-bold tracking-tight text-ink">
                  HSS Kitchens
                </div>
                <div className="text-[11px] text-gray-dark mt-0.5">
                  Sales · Orders · Purchasing
                </div>
              </Link>
            </div>
            <Nav />
            <div className="px-5 py-4 text-[11px] text-gray">
              Built by Klyne &amp; Co.
            </div>
          </aside>
          <main className="flex-1 min-w-0 px-8 py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
