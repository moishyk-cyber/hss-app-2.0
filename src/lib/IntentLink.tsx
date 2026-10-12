"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/** Warm a single destination when the user points to it or focuses it.
 * Next's router handles expiry and server-action invalidation; no separate cache.
 */
export default function IntentLink({
  onMouseEnter,
  onFocus,
  prefetch,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return <Link
    {...props}
    prefetch={prefetch ?? (intent ? true : false)}
    onMouseEnter={event => { setIntent(true); onMouseEnter?.(event); }}
    onFocus={event => { setIntent(true); onFocus?.(event); }}
  />;
}
