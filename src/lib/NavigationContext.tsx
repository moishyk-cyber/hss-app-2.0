"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Keep the exact collection and scroll position when inspecting a record. */
export function NavigationContext() {
  const pathname = usePathname();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement)?.closest("a[href]");
      if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === pathname) return;
      if (!/^\/(pipeline|orders|companies|contacts|tasks|service|deliveries|purchase-orders|invoices)\/[^/]+/.test(url.pathname)) return;
      try {
        sessionStorage.setItem(`hss:return:${url.pathname}`, window.location.pathname + window.location.search + window.location.hash);
        sessionStorage.setItem(`hss:scroll:${pathname}`, String(window.scrollY));
      } catch { /* navigation still works when storage is unavailable */ }
    };
    document.addEventListener("click", onClick, true);
    try {
      const saved = sessionStorage.getItem(`hss:restore:${pathname}`);
      if (saved !== null) {
        sessionStorage.removeItem(`hss:restore:${pathname}`);
        const frame = requestAnimationFrame(() => window.scrollTo({top: Number(saved)}));
        return () => { cancelAnimationFrame(frame); document.removeEventListener("click", onClick, true); };
      }
    } catch { /* optional restoration */ }
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);
  return null;
}
