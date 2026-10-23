"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { LiveNotification } from "@/lib/notificationLiveTypes";
import { notificationHref } from "@/lib/notificationLiveTypes";

export function NotificationPopups({ items, dismiss, pause }: { items: LiveNotification[]; dismiss: (id: string) => void; pause: (id: string) => void }) {
  const stack = useRef<HTMLElement>(null);
  const visible = items.length > 0;
  useEffect(() => {
    const element = stack.current;
    if (!element) return;
    // Ordinary save/error toasts sit above this stack instead of covering it.
    const measure = () => document.documentElement.style.setProperty("--notification-popup-height", `${element.getBoundingClientRect().height + 12}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--notification-popup-height"); };
  }, [visible]);
  if (!visible) return null;
  return <section ref={stack} aria-label="New notifications" aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-h-[calc(100dvh-2.5rem)] max-w-md -translate-x-1/2 flex-col gap-3 overflow-y-auto">
    {[...items].reverse().map(item => <article key={item.id} onMouseEnter={() => pause(item.id)} onFocusCapture={() => pause(item.id)} className="notification-popup pointer-events-auto">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/70">New notification</p>
          <h2 className="mt-1 break-words text-[17px] font-semibold leading-snug text-white">{item.title}</h2>
        </div>
        <button type="button" aria-label={`Dismiss ${item.title}`} onClick={() => dismiss(item.id)} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" title="Dismiss notification">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <p className="mt-3 line-clamp-3 break-words text-[13px] leading-relaxed text-white/80">{item.message}</p>
      <Link href={notificationHref(item.href)} onClick={() => dismiss(item.id)} className="notification-popup-action mt-4 flex min-h-10 items-center justify-between gap-4 rounded-lg bg-surface px-3 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        Open record <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
      </Link>
    </article>)}
  </section>;
}
