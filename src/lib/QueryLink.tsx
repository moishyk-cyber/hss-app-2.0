"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

/** Change one collection choice without silently discarding the other choices. */
export function QueryLink({ href, clear = [], ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string; clear?: string[] }) {
  const current = useSearchParams();
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(current.toString());
  clear.forEach(key => params.delete(key));
  new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  const suffix = params.toString();
  return <Link {...props} href={suffix ? `${path}?${suffix}` : path} scroll={false}/>;
}
