import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Archivo, Inter } from "next/font/google";
import Link from "next/link";
import Nav from "./nav";
import { NavigationContext } from "@/lib/NavigationContext";
import { NotificationProvider } from "./notifications/NotificationProvider";
import { currentUserId } from "@/lib/identityServer";
import WhoAmI from "./who-am-i";
import { currentUserName, sessionUserIsGone } from "@/lib/identityServer";
import { can } from "@/lib/permissionsServer";
import { ToastProvider } from "@/lib/toast";
import "./globals.css";
import { appMode } from '@/lib/environmentMode';

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
  title: appMode() === 'dev' ? 'HSS Kitchens — Testing' : 'HSS Kitchens',
  description: "CRM, Order & Purchasing Management",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
  record,
}: LayoutProps<"/">) {
  // Set by proxy.ts on every request; the /login route renders without
  // the signed-in sidebar chrome (there's no identity yet to show there).
  const pathname = (await headers()).get("x-pathname");
  const isLoginRoute = pathname === "/login";

  if (isLoginRoute) {
    return (
      <html
        lang="en"
        className={`${archivo.variable} ${inter.variable} h-full antialiased`}
      >
        <body className="min-h-full bg-bg text-ink">{appMode() === 'dev' && <div className="bg-ink px-4 py-2 text-center text-sm text-white">Testing environment</div>}{children}</body>
      </html>
    );
  }

  const [userName, showAdmin, sessionGone, userId] = await Promise.all([
    currentUserName(),
    can("admin.manage"),
    sessionUserIsGone(),
    currentUserId(),
  ]);
  // Valid cookie, but the user was deleted or deactivated: clear the cookie
  // via /logout (see src/app/logout/route.ts) rather than going to /login.
  if (sessionGone) redirect("/logout");
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg text-ink">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ToastProvider>
          <NotificationProvider key={userId} userId={userId}>
          <NavigationContext />
          <div className="app-shell">
            <aside className="app-sidebar">
              <div className="sidebar-brand">
                <Link href="/dashboard" className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/hss-logo.png"
                    alt="HSS Kitchens"
                    width={44}
                    height={32}
                    className="h-9 w-auto"
                  />
                  <div className="min-w-0">
                    <div className="font-heading text-[17px] font-bold tracking-tight text-ink leading-tight">
                      HSS Kitchens
                    </div>
                    <div className="brand-tagline">
                      {appMode() === 'dev' ? 'Testing environment' : 'Sales · Orders · Purchasing'}
                    </div>
                  </div>
                </Link>
              </div>
              <Nav showAdmin={showAdmin} />
              <div className="sidebar-account">
                <WhoAmI name={userName} />
                <div className="sidebar-credit">Built by Klyne &amp; Co.</div>
              </div>
            </aside>
            <main id="main" className="app-main">
              {children}
            </main>
            {record}
          </div>
          </NotificationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
