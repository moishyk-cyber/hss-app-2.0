import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Archivo, Inter } from "next/font/google";
import Link from "next/link";
import Nav from "./nav";
import WhoAmI from "./who-am-i";
import { currentUserName, sessionUserIsGone } from "@/lib/identityServer";
import { can } from "@/lib/permissionsServer";
import { ToastProvider } from "@/lib/toast";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "HSS Kitchens",
  description: "CRM, Order & Purchasing Management",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by proxy.ts on every request; the /login route renders without
  // the signed-in sidebar chrome (there's no identity yet to show there).
  const pathname = (await headers()).get("x-pathname");
  const isLoginRoute = pathname === "/login";

  if (isLoginRoute) {
    return (
      <html lang="en" className={`${archivo.variable} ${inter.variable} h-full antialiased`}>
        <body className="min-h-full bg-bg text-ink">{children}</body>
      </html>
    );
  }

  const [userName, showAdmin, sessionGone] = await Promise.all([
    currentUserName(),
    can("admin.manage"),
    sessionUserIsGone(),
  ]);
  // Valid cookie, but the user was deleted or deactivated: clear the cookie
  // via /logout (see src/app/logout/route.ts) rather than going to /login.
  if (sessionGone) redirect("/logout");
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-ink">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ToastProvider>
        <div className="flex min-h-screen">
          <aside className="w-64 shrink-0 bg-panel flex flex-col border-r border-border">
            <div className="px-6 py-6">
              <Link href="/dashboard" className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hss-logo.png" alt="HSS Kitchens" width={44} height={32} className="h-9 w-auto" />
                <div>
                  <div className="font-heading text-[17px] font-bold tracking-tight text-ink leading-tight">
                    HSS Kitchens
                  </div>
                  <div className="text-[11px] text-gray-dark mt-0.5">
                    Sales · Orders · Purchasing
                  </div>
                </div>
              </Link>
            </div>
            <Nav showAdmin={showAdmin} />
            <WhoAmI name={userName} />
            <div className="px-6 py-5 text-[11px] text-gray">
              Built by Klyne &amp; Co.
            </div>
          </aside>
          <main id="main" className="flex-1 min-w-0 px-10 py-9">{children}</main>
        </div>
        </ToastProvider>
      </body>
    </html>
  );
}
