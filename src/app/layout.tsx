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
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 bg-panel flex flex-col border-r border-border">
            <div className="px-5 py-5">
              <Link href="/dashboard" className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hss-logo.png" alt="HSS Kitchens" width={44} height={32} className="h-8 w-auto" />
                <div>
                  <div className="font-heading text-[16px] font-bold tracking-tight text-ink leading-tight">
                    HSS Kitchens
                  </div>
                  <div className="text-[10.5px] text-gray-dark">
                    Sales · Orders · Purchasing
                  </div>
                </div>
              </Link>
            </div>
            <Nav />
            <div className="px-5 py-4 text-[11px] text-gray">
              Built by Klyne &amp; Co.
            </div>
          </aside>
          <main id="main" className="flex-1 min-w-0 px-8 py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
