"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Spinner } from "./ui";
import { collectionQuery, collectionHref, stageCollectionQuery } from "./collectionNavigation";

/** Continue the server collection window only when scrolling reaches its end. */
export function MoreRecords({ limit, hasMore, href }: { limit: number; hasMore: boolean; href: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const marker = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const [point, setPoint] = useState<HTMLElement | null>(null);
  const [errorQuery, setErrorQuery] = useState<string | null>(null);
  const error = errorQuery === query;
  useEffect(() => { loading.current = false; return () => clearTimeout(timeout.current); }, [limit, query]);
  const load = useCallback((event?: Event) => {
    if (loading.current || !hasMore) return;
    // An old scroll boundary must not overwrite a pending filter or sort.
    const scope = (value: URLSearchParams) => {
      for (const key of ["records", "page", "view", "group"]) value.delete(key);
      value.sort();
      return value.toString();
    };
    if (scope(collectionQuery()) !== scope(new URLSearchParams(query))) return;
    loading.current = true;
    setPoint((event as CustomEvent<{ point?: HTMLElement }> | undefined)?.detail?.point ?? marker.current);
    setErrorQuery(null);
    const next = stageCollectionQuery(query => {
      query.delete("page");
      query.set("records", String(limit + 120));
    });
    startTransition(() => router.replace(collectionHref(next, href), { scroll: false }));
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => { loading.current = false; setErrorQuery(query); }, 25000);
  }, [hasMore, href, limit, query, router]);
  useEffect(() => {
    if (!hasMore || error) return;
    window.addEventListener("collection:load-more", load);
    // Tables signal from their internal scroll area. Other collections use page scrolling.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !marker.current?.parentElement?.querySelector(".table-scroll, .kanban-board")) load();
    }, { rootMargin: "0px 0px 160px 0px" });
    if (marker.current) observer.observe(marker.current);
    return () => { window.removeEventListener("collection:load-more", load); observer.disconnect(); };
  }, [hasMore, load, error]);
  if (!hasMore) return null;
  const indicator=error?<div className="flex items-center justify-center gap-2 py-2" role="alert"><span>Could not load more records.</span><button className="btn btn-sm" onClick={()=>load()}>Try again</button></div>
    :pending?<span className="collection-scroll-spinner" role="status" aria-label="Loading more records"><Spinner className="h-5 w-5 motion-reduce:animate-none"/><span className="sr-only">Loading more records</span></span>:null;
  return <><div ref={marker} />{point?.isConnected ? createPortal(indicator,point):indicator}</>;
}
