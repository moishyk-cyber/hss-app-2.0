// BackLink - the ONE back-navigation control, used at the top of every detail and
// form page (Aug 31 feedback: friendlier, and identical everywhere). Server-renderable.

import Link from "next/link";

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-border bg-panel px-3 py-1.5 text-[12.5px] font-medium text-gray-dark transition-colors hover:bg-hover hover:text-ink"
    >
      {label}
    </Link>
  );
}
